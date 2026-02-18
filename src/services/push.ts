import { Database } from 'bun:sqlite'
import { fromMacOSDate } from '../utils/date-formatter.js'

export interface PushConfig {
  endpoint: string
  apiKey: string
  batchSize: number
  dryRun: boolean
}

export interface PushResult {
  batches: number
  imported: number
  skipped: number
  total: number
  lastRowid: number
}

interface PushMessageRow {
  rowid: number
  date: number
  is_from_me: number
  text_extracted: string | null
  sender_phone: string | null
  sender_name: string | null
  service: string | null
}

interface PushState {
  endpoint: string
  last_pushed_rowid: number
  last_push_at: string | null
  total_pushed: number
}

interface BatchResult {
  imported: number
  skipped: number
}

export function getPushState(db: Database, endpoint: string): PushState {
  const row = db
    .query(`SELECT endpoint, last_pushed_rowid, last_push_at, total_pushed FROM push_state WHERE endpoint = ?`)
    .get(endpoint) as PushState | null

  return row ?? { endpoint, last_pushed_rowid: 0, last_push_at: null, total_pushed: 0 }
}

export function resetPushState(db: Database, endpoint: string): void {
  db.query(
    `INSERT INTO push_state (endpoint, last_pushed_rowid, total_pushed)
     VALUES (?, 0, 0)
     ON CONFLICT(endpoint) DO UPDATE SET last_pushed_rowid = 0, total_pushed = 0`
  ).run(endpoint)
}

function queryMessages(db: Database, afterRowid: number, limit: number): PushMessageRow[] {
  return db.query(`
    SELECT
      m.ROWID as rowid,
      m.date,
      m.is_from_me,
      m.text_extracted,
      h.id as sender_phone,
      COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), c.organization, h.id) as sender_name,
      h.service
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN contact c ON h.id = c.phone_normalized
    LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
    WHERE m.deleted_at IS NULL
      AND m.ROWID > ?
    ORDER BY m.ROWID ASC
    LIMIT ?
  `).all(afterRowid, limit) as PushMessageRow[]
}

function formatPayload(rows: PushMessageRow[]): object {
  return {
    messages: rows.map((r) => ({
      external_id: r.rowid,
      sender: r.sender_phone,
      sender_name: r.sender_name,
      body: r.text_extracted,
      sent_at: fromMacOSDate(r.date).toISOString(),
      service: r.service || 'SMS',
      is_from_me: r.is_from_me === 1,
    })),
  }
}

function updatePushState(db: Database, endpoint: string, lastRowid: number, pushed: number): void {
  db.query(
    `INSERT INTO push_state (endpoint, last_pushed_rowid, last_push_at, total_pushed)
     VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       last_pushed_rowid = excluded.last_pushed_rowid,
       last_push_at = excluded.last_push_at,
       total_pushed = push_state.total_pushed + excluded.total_pushed`
  ).run(endpoint, lastRowid, pushed)
}

export interface BatchCallback {
  (batch: number, sent: number, imported: number, skipped: number): void
}

export type FetchFn = typeof globalThis.fetch

export interface PushOptions {
  onBatch?: BatchCallback
  fetchFn?: FetchFn
}

export async function pushMessages(
  db: Database,
  config: PushConfig,
  options: PushOptions = {},
): Promise<PushResult> {
  const { endpoint, apiKey, batchSize, dryRun } = config
  const { onBatch, fetchFn = globalThis.fetch } = options

  const state = getPushState(db, endpoint)
  let afterRowid = state.last_pushed_rowid
  let batchNum = 0
  let totalImported = 0
  let totalSkipped = 0
  let totalSent = 0
  let lastRowid = afterRowid

  while (true) {
    const rows = queryMessages(db, afterRowid, batchSize)
    if (rows.length === 0) break

    batchNum++
    totalSent += rows.length
    const batchLastRowid = rows[rows.length - 1].rowid

    if (dryRun) {
      onBatch?.(batchNum, rows.length, rows.length, 0)
      totalImported += rows.length
      afterRowid = batchLastRowid
      lastRowid = batchLastRowid
      continue
    }

    const payload = formatPayload(rows)
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Push failed (HTTP ${response.status}): ${text}`)
    }

    const result = await response.json() as BatchResult
    const imported = result.imported ?? rows.length
    const skipped = result.skipped ?? 0

    totalImported += imported
    totalSkipped += skipped
    afterRowid = batchLastRowid
    lastRowid = batchLastRowid

    updatePushState(db, endpoint, batchLastRowid, rows.length)
    onBatch?.(batchNum, rows.length, imported, skipped)
  }

  return {
    batches: batchNum,
    imported: totalImported,
    skipped: totalSkipped,
    total: totalSent,
    lastRowid,
  }
}

export function countPendingMessages(db: Database, afterRowid: number): number {
  const result = db.query(
    `SELECT COUNT(*) as count FROM message WHERE deleted_at IS NULL AND ROWID > ?`
  ).get(afterRowid) as { count: number }
  return result.count
}
