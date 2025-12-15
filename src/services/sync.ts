import { Database } from 'bun:sqlite'
import {
  getSourceDbPath,
  findAddressBookDbs,
  updateLastSyncAt,
} from './database.js'
import { toSyllables } from '../utils/syllable.js'
import { extractFromAttributedBody } from '../utils/attributed-string.js'

interface SyncResult {
  handles: number
  messages: number
  attachments: number
  contacts: number
}

export async function syncAll(
  shadowDb: Database,
  options: { cleanup?: boolean } = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    handles: 0,
    messages: 0,
    attachments: 0,
    contacts: 0,
  }

  const sourceDbPath = getSourceDbPath()

  let sourceDb: Database | null = null
  try {
    sourceDb = new Database(sourceDbPath, {
      readonly: true,
      create: false,
    })
    sourceDb.exec('PRAGMA busy_timeout = 2500')
  } catch (error) {
    throw new Error(
      `Cannot open Messages database: ${error instanceof Error ? error.message : error}`
    )
  }

  try {
    shadowDb.exec('BEGIN')

    // 1. Sync handles
    result.handles = syncHandles(sourceDb, shadowDb)

    // 2. Sync messages
    result.messages = syncMessages(sourceDb, shadowDb)

    // 3. Sync attachments
    result.attachments = syncAttachments(sourceDb, shadowDb)

    // 4. Sync message_attachment_join
    syncMessageAttachmentJoin(sourceDb, shadowDb)

    // 5. Update FTS indexes
    updateFtsIndexes(shadowDb)

    // 6. Update sync state
    updateSyncState(sourceDb, shadowDb)

    shadowDb.exec('COMMIT')
  } catch (error) {
    shadowDb.exec('ROLLBACK')
    throw error
  } finally {
    sourceDb.close()
  }

  // Sync contacts (separate transaction)
  result.contacts = syncContacts(shadowDb)

  // Optional cleanup
  if (options.cleanup) {
    cleanupOrphanRecords(shadowDb, sourceDbPath)
  }

  // Update last sync timestamp
  updateLastSyncAt()

  return result
}

function syncHandles(sourceDb: Database, shadowDb: Database): number {
  const lastRowid = shadowDb
    .query(`SELECT last_rowid FROM sync_state WHERE table_name = 'handle'`)
    .get() as { last_rowid: number }

  const rows = sourceDb
    .query(`SELECT ROWID, id, service FROM handle WHERE ROWID > ?`)
    .all(lastRowid.last_rowid) as Array<{ ROWID: number; id: string; service: string }>

  if (rows.length === 0) return 0

  const insert = shadowDb.query(`
    INSERT OR REPLACE INTO handle (ROWID, id, service)
    VALUES (?, ?, ?)
  `)

  for (const row of rows) {
    insert.run(row.ROWID, row.id, row.service)
  }

  return rows.length
}

function syncMessages(sourceDb: Database, shadowDb: Database): number {
  const lastRowid = shadowDb
    .query(`SELECT last_rowid FROM sync_state WHERE table_name = 'message'`)
    .get() as { last_rowid: number }

  const rows = sourceDb
    .query(
      `SELECT
        ROWID,
        guid,
        handle_id,
        date,
        is_from_me,
        text,
        attributedBody,
        cache_has_attachments
      FROM message
      WHERE ROWID > ?`
    )
    .all(lastRowid.last_rowid) as Array<{
    ROWID: number
    guid: string
    handle_id: number
    date: number
    is_from_me: number
    text: string | null
    attributedBody: Uint8Array | null
    cache_has_attachments: number
  }>

  if (rows.length === 0) return 0

  const insert = shadowDb.query(`
    INSERT OR REPLACE INTO message
    (ROWID, guid, handle_id, date, is_from_me, text, text_extracted, text_syllables, cache_has_attachments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const row of rows) {
    const textExtracted = extractText(row.text, row.attributedBody)
    const syllables = textExtracted ? toSyllables(textExtracted) : null

    insert.run(
      row.ROWID,
      row.guid,
      row.handle_id,
      row.date,
      row.is_from_me,
      row.text,
      textExtracted,
      syllables,
      row.cache_has_attachments
    )
  }

  return rows.length
}

function extractText(
  text: string | null,
  attributedBody: Uint8Array | null
): string | null {
  // 1. Use text column if available and not a placeholder character
  if (text) {
    const trimmed = text.trim()
    // Skip object replacement characters (U+FFFE, U+FFFC, U+FFFD)
    // These indicate the actual content is in attributedBody
    if (trimmed && trimmed !== '\uFFFE' && trimmed !== '\uFFFC' && trimmed !== '\uFFFD') {
      return trimmed
    }
  }

  // 2. Extract from attributedBody using proper NSAttributedString parser
  if (!attributedBody) return null

  // Convert Uint8Array to Buffer for compatibility with extractFromAttributedBody
  return extractFromAttributedBody(Buffer.from(attributedBody))
}

function syncAttachments(
  sourceDb: Database,
  shadowDb: Database
): number {
  const lastRowid = shadowDb
    .query(`SELECT last_rowid FROM sync_state WHERE table_name = 'attachment'`)
    .get() as { last_rowid: number }

  const rows = sourceDb
    .query(
      `SELECT ROWID, guid, filename, mime_type, total_bytes
       FROM attachment WHERE ROWID > ?`
    )
    .all(lastRowid.last_rowid) as Array<{
      ROWID: number
      guid: string
      filename: string | null
      mime_type: string | null
      total_bytes: number | null
    }>

  if (rows.length === 0) return 0

  const insert = shadowDb.query(`
    INSERT OR REPLACE INTO attachment (ROWID, guid, filename, mime_type, total_bytes)
    VALUES (?, ?, ?, ?, ?)
  `)

  for (const row of rows) {
    insert.run(row.ROWID, row.guid, row.filename, row.mime_type, row.total_bytes)
  }

  return rows.length
}

function syncMessageAttachmentJoin(
  sourceDb: Database,
  shadowDb: Database
): void {
  const lastRowid = shadowDb
    .query(`SELECT last_rowid FROM sync_state WHERE table_name = 'message_attachment_join'`)
    .get() as { last_rowid: number }

  const rows = sourceDb
    .query(
      `SELECT message_id, attachment_id
       FROM message_attachment_join WHERE message_id > ?`
    )
    .all(lastRowid.last_rowid) as Array<{ message_id: number; attachment_id: number }>

  if (rows.length === 0) return

  const insert = shadowDb.query(`
    INSERT OR REPLACE INTO message_attachment_join (message_id, attachment_id)
    VALUES (?, ?)
  `)

  for (const row of rows) {
    insert.run(row.message_id, row.attachment_id)
  }
}

function updateFtsIndexes(shadowDb: Database): void {
  // Rebuild FTS indexes for new data
  // Using INSERT INTO ... VALUES('rebuild') for full rebuild
  // For incremental, we rely on content= table sync
  try {
    shadowDb.exec(`INSERT INTO fts_trigram(fts_trigram) VALUES('rebuild')`)
    shadowDb.exec(`INSERT INTO fts_char(fts_char) VALUES('rebuild')`)
  } catch {
    // FTS rebuild might fail if no new data, ignore
  }
}

function updateSyncState(
  sourceDb: Database,
  shadowDb: Database
): void {
  const tables = ['handle', 'message', 'attachment', 'message_attachment_join']

  for (const table of tables) {
    const sourceTable = table === 'message_attachment_join' ? table : table
    const result = sourceDb
      .query(`SELECT MAX(ROWID) as maxRowid FROM ${sourceTable}`)
      .get() as { maxRowid: number | null }

    if (result.maxRowid !== null) {
      shadowDb
        .query(
          `UPDATE sync_state SET last_rowid = ?, last_sync_at = datetime('now')
           WHERE table_name = ?`
        )
        .run(result.maxRowid, table)
    }
  }
}

function syncContacts(shadowDb: Database): number {
  const addressBookDbs = findAddressBookDbs()
  if (addressBookDbs.length === 0) return 0

  // Clear existing contacts
  shadowDb.exec('DELETE FROM contact')

  let totalContacts = 0

  for (const dbPath of addressBookDbs) {
    try {
      const abDb = new Database(dbPath, { readonly: true, create: false })

      const contacts = abDb
        .query(
          `SELECT
            COALESCE(r.ZFIRSTNAME, '') || ' ' || COALESCE(r.ZLASTNAME, '') AS name,
            r.ZORGANIZATION AS organization,
            p.ZFULLNUMBER AS phone
          FROM ZABCDRECORD r
          JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK
          WHERE p.ZFULLNUMBER IS NOT NULL`
        )
        .all() as Array<{
        name: string
        organization: string | null
        phone: string
      }>

      const insert = shadowDb.query(`
        INSERT OR REPLACE INTO contact (phone_normalized, name, organization, phone_original)
        VALUES (?, ?, ?, ?)
      `)

      for (const contact of contacts) {
        const normalized = normalizePhone(contact.phone)
        insert.run(normalized, contact.name.trim(), contact.organization, contact.phone)
        totalContacts++
      }

      abDb.close()
    } catch {
      // Skip inaccessible address books
    }
  }

  return totalContacts
}

function normalizePhone(phone: string): string {
  // Remove all non-digits
  let normalized = phone.replace(/[^\d+]/g, '')

  // Convert +82 to 0
  normalized = normalized.replace(/^\+82/, '0')

  // Convert 0xx to +82xx format
  if (normalized.startsWith('0')) {
    normalized = '+82' + normalized.slice(1)
  }

  return normalized
}

function cleanupOrphanRecords(
  shadowDb: Database,
  sourceDbPath: string
): void {
  let sourceDb: Database | null = null
  try {
    sourceDb = new Database(sourceDbPath, { readonly: true, create: false })

    // Soft delete orphan messages
    shadowDb.exec(`
      UPDATE message SET deleted_at = datetime('now')
      WHERE deleted_at IS NULL
        AND ROWID NOT IN (SELECT ROWID FROM message WHERE deleted_at IS NULL)
    `)
  } catch {
    // Ignore cleanup errors
  } finally {
    sourceDb?.close()
  }
}
