import { Database } from 'bun:sqlite'

/**
 * Parse query into terms for AND search.
 * - Space-separated terms are ANDed together
 * - Quoted strings are kept as single terms
 * - OR/NOT operators are not supported (treated as literal text)
 */
function parseQueryTerms(query: string): string[] {
  const terms: string[] = []
  const regex = /"([^"]+)"|(\S+)/g
  let match
  while ((match = regex.exec(query)) !== null) {
    terms.push(match[1] || match[2])
  }
  return terms
}

export interface MessageResult {
  rowid: number
  guid: string
  handle_id: number
  date: number
  is_from_me: number
  text_extracted: string | null
  cache_has_attachments: number
  sender_phone: string | null
  sender_name: string | null
  service: string | null
}

export interface SearchOptions {
  from?: string
  after?: Date
  before?: Date
  limit?: number
  offset?: number
}

export interface SearchResult {
  messages: MessageResult[]
  total: number
  limit: number
  offset: number
}

export function searchMessages(
  db: Database,
  query: string,
  options: SearchOptions = {}
): SearchResult {
  const { from, after, before, limit = 20, offset = 0 } = options

  const messages = search(db, query, { from, after, before, limit, offset })
  const total = count(db, query, { from, after, before })

  return { messages, total, limit, offset }
}

function search(
  db: Database,
  query: string,
  options: SearchOptions
): MessageResult[] {
  const { from, after, before, limit = 20, offset = 0 } = options
  const terms = parseQueryTerms(query)

  let sql = `
    SELECT
      m.ROWID as rowid,
      m.guid,
      m.handle_id,
      m.date,
      m.is_from_me,
      m.text_extracted,
      m.cache_has_attachments,
      h.id as sender_phone,
      COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), c.organization, h.id) as sender_name,
      h.service
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN contact c ON h.id = c.phone_normalized
    LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
    WHERE m.deleted_at IS NULL
  `

  const params: (string | number)[] = []

  // Each term must be present (AND logic)
  for (const term of terms) {
    sql += ` AND m.text_extracted LIKE ?`
    params.push(`%${term}%`)
  }

  if (from) {
    sql += ` AND (h.id LIKE ? OR sa.alias LIKE ? OR c.name LIKE ?)`
    const fromPattern = `%${from}%`
    params.push(fromPattern, fromPattern, fromPattern)
  }

  if (after) {
    sql += ` AND m.date >= ?`
    params.push(toMacOSTimestamp(after))
  }

  if (before) {
    sql += ` AND m.date <= ?`
    params.push(toMacOSTimestamp(before))
  }

  sql += ` ORDER BY m.date DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  return db.query(sql).all(...params) as MessageResult[]
}

function count(
  db: Database,
  query: string,
  options: Omit<SearchOptions, 'limit' | 'offset'>
): number {
  const { from, after, before } = options
  const terms = parseQueryTerms(query)

  let sql = `
    SELECT COUNT(*) as count
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN contact c ON h.id = c.phone_normalized
    LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
    WHERE m.deleted_at IS NULL
  `

  const params: (string | number)[] = []

  for (const term of terms) {
    sql += ` AND m.text_extracted LIKE ?`
    params.push(`%${term}%`)
  }

  if (from) {
    sql += ` AND (h.id LIKE ? OR sa.alias LIKE ? OR c.name LIKE ?)`
    const fromPattern = `%${from}%`
    params.push(fromPattern, fromPattern, fromPattern)
  }

  if (after) {
    sql += ` AND m.date >= ?`
    params.push(toMacOSTimestamp(after))
  }

  if (before) {
    sql += ` AND m.date <= ?`
    params.push(toMacOSTimestamp(before))
  }

  const result = db.query(sql).get(...params) as { count: number }
  return result.count
}

function toMacOSTimestamp(date: Date): number {
  const MACOS_EPOCH = new Date('2001-01-01T00:00:00Z').getTime()
  return (date.getTime() - MACOS_EPOCH) * 1_000_000
}
