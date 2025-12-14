import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { initializeSchema } from '../../src/services/database.js'

describe('database integration', () => {
  let testDbPath: string
  let db: Database.Database

  beforeEach(() => {
    // Create a temp database for testing
    testDbPath = path.join(os.tmpdir(), `shadowmsg-test-${Date.now()}.db`)
    db = new Database(testDbPath)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
  })

  describe('initializeSchema', () => {
    it('should create all required tables', () => {
      initializeSchema(db)

      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
        )
        .all() as Array<{ name: string }>

      const tableNames = tables.map((t) => t.name)

      expect(tableNames).toContain('message')
      expect(tableNames).toContain('handle')
      expect(tableNames).toContain('contact')
      expect(tableNames).toContain('sender_alias')
      expect(tableNames).toContain('attachment')
      expect(tableNames).toContain('sync_state')
    })

    it('should create FTS5 virtual tables', () => {
      initializeSchema(db)

      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fts_%'`
        )
        .all() as Array<{ name: string }>

      const tableNames = tables.map((t) => t.name)

      expect(tableNames).toContain('fts_trigram')
      expect(tableNames).toContain('fts_char')
    })

    it('should initialize sync_state with default values', () => {
      initializeSchema(db)

      const states = db
        .prepare(`SELECT table_name, last_rowid FROM sync_state`)
        .all() as Array<{ table_name: string; last_rowid: number }>

      expect(states.length).toBe(4)
      for (const state of states) {
        expect(state.last_rowid).toBe(0)
      }
    })

    it('should be idempotent', () => {
      // Should not throw when called multiple times
      initializeSchema(db)
      initializeSchema(db)
      initializeSchema(db)

      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='message'`
        )
        .all()

      expect(tables.length).toBe(1)
    })
  })

  describe('sender_alias', () => {
    it('should allow adding and retrieving aliases', () => {
      initializeSchema(db)

      db.prepare(
        `INSERT INTO sender_alias (phone_normalized, alias) VALUES (?, ?)`
      ).run('+1234567890', 'Amazon')

      const alias = db
        .prepare(
          `SELECT alias FROM sender_alias WHERE phone_normalized = ?`
        )
        .get('+1234567890') as { alias: string }

      expect(alias.alias).toBe('Amazon')
    })
  })
})
