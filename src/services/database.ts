import Database, { Database as DatabaseType } from 'better-sqlite3'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Environment variables:
// - SHADOWMSG_DIR: Shadow database directory (default: ~/.shadowmsg)
// - SHADOWMSG_SOURCE_DB: Source Messages database path (default: ~/Library/Messages/chat.db)
const SHADOWMSG_DIR = process.env.SHADOWMSG_DIR || path.join(os.homedir(), '.shadowmsg')
const SHADOW_DB_PATH = path.join(SHADOWMSG_DIR, 'shadow.db')
const STATE_PATH = path.join(SHADOWMSG_DIR, 'state.json')
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let dbInstance: DatabaseType | null = null

export function getShadowMsgDir(): string {
  return SHADOWMSG_DIR
}

export function getShadowDbPath(): string {
  return SHADOW_DB_PATH
}

export function ensureShadowMsgDir(): void {
  if (!fs.existsSync(SHADOWMSG_DIR)) {
    fs.mkdirSync(SHADOWMSG_DIR, { recursive: true })
  }
}

export function getDatabase(): DatabaseType {
  if (dbInstance) return dbInstance

  ensureShadowMsgDir()
  dbInstance = new Database(SHADOW_DB_PATH)
  dbInstance.pragma('journal_mode = WAL')
  return dbInstance
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

export function isDatabaseInitialized(): boolean {
  if (!fs.existsSync(SHADOW_DB_PATH)) return false

  try {
    const db = getDatabase()
    const result = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='message'
    `).get()
    return !!result
  } catch {
    return false
  }
}

export function initializeSchema(db: DatabaseType): void {
  db.exec(`
    -- handle table
    CREATE TABLE IF NOT EXISTS handle (
      ROWID INTEGER PRIMARY KEY,
      id TEXT,
      service TEXT
    );

    -- message table
    CREATE TABLE IF NOT EXISTS message (
      ROWID INTEGER PRIMARY KEY,
      guid TEXT,
      handle_id INTEGER,
      date INTEGER,
      is_from_me INTEGER,
      text TEXT,
      text_extracted TEXT,
      text_syllables TEXT,
      cache_has_attachments INTEGER,
      deleted_at TEXT
    );

    -- attachment table
    CREATE TABLE IF NOT EXISTS attachment (
      ROWID INTEGER PRIMARY KEY,
      guid TEXT,
      filename TEXT,
      mime_type TEXT,
      total_bytes INTEGER
    );

    -- message_attachment_join table
    CREATE TABLE IF NOT EXISTS message_attachment_join (
      message_id INTEGER,
      attachment_id INTEGER
    );

    -- contact table (from AddressBook)
    CREATE TABLE IF NOT EXISTS contact (
      phone_normalized TEXT PRIMARY KEY,
      name TEXT,
      organization TEXT,
      phone_original TEXT
    );

    -- sender_alias table (user-defined)
    CREATE TABLE IF NOT EXISTS sender_alias (
      phone_normalized TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- sync_state table
    CREATE TABLE IF NOT EXISTS sync_state (
      table_name TEXT PRIMARY KEY,
      last_rowid INTEGER DEFAULT 0,
      last_sync_at TEXT
    );

    -- Initialize sync_state
    INSERT OR IGNORE INTO sync_state (table_name, last_rowid) VALUES ('handle', 0);
    INSERT OR IGNORE INTO sync_state (table_name, last_rowid) VALUES ('message', 0);
    INSERT OR IGNORE INTO sync_state (table_name, last_rowid) VALUES ('attachment', 0);
    INSERT OR IGNORE INTO sync_state (table_name, last_rowid) VALUES ('message_attachment_join', 0);

    -- FTS5 indexes
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_trigram USING fts5(
      text_extracted,
      content='message',
      content_rowid='ROWID',
      tokenize='trigram'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_char USING fts5(
      text_syllables,
      content='message',
      content_rowid='ROWID',
      tokenize='unicode61 remove_diacritics 0'
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_message_handle_id ON message(handle_id);
    CREATE INDEX IF NOT EXISTS idx_message_date ON message(date);
    CREATE INDEX IF NOT EXISTS idx_handle_id ON handle(id);
  `)
}

interface SyncState {
  lastSyncAt?: string
}

function loadState(): SyncState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return {}
}

export function saveState(state: SyncState): void {
  ensureShadowMsgDir()
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

export function getLastSyncAt(): Date | null {
  const state = loadState()
  return state.lastSyncAt ? new Date(state.lastSyncAt) : null
}

export function updateLastSyncAt(): void {
  const state = loadState()
  state.lastSyncAt = new Date().toISOString()
  saveState(state)
}

export function shouldAutoSync(_db: DatabaseType): boolean {
  if (!isDatabaseInitialized()) return false

  const lastSync = getLastSyncAt()
  if (!lastSync) return true

  const elapsed = Date.now() - lastSync.getTime()
  return elapsed > AUTO_SYNC_INTERVAL_MS
}

export function getSourceDbPath(): string {
  return process.env.SHADOWMSG_SOURCE_DB || path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
}

export function findAddressBookDbs(): string[] {
  const basePath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'AddressBook',
    'Sources'
  )

  if (!fs.existsSync(basePath)) return []

  try {
    const sources = fs.readdirSync(basePath)
    return sources
      .map((uuid) => path.join(basePath, uuid, 'AddressBook-v22.abcddb'))
      .filter((p) => fs.existsSync(p))
  } catch {
    return []
  }
}
