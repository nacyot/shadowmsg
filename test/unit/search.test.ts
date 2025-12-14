import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { searchMessages } from '../../src/services/search.js'

describe('search', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')

    // Create minimal schema
    db.exec(`
      CREATE TABLE message (
        ROWID INTEGER PRIMARY KEY,
        guid TEXT,
        handle_id INTEGER,
        date INTEGER,
        is_from_me INTEGER DEFAULT 0,
        text_extracted TEXT,
        cache_has_attachments INTEGER DEFAULT 0,
        deleted_at INTEGER
      );

      CREATE TABLE handle (
        ROWID INTEGER PRIMARY KEY,
        id TEXT,
        service TEXT
      );

      CREATE TABLE contact (
        phone_normalized TEXT PRIMARY KEY,
        name TEXT,
        organization TEXT
      );

      CREATE TABLE sender_alias (
        phone_normalized TEXT PRIMARY KEY,
        alias TEXT
      );
    `)

    // Insert test data
    db.exec(`
      INSERT INTO handle (ROWID, id, service) VALUES
        (1, '+1234567890', 'SMS'),
        (2, '+0987654321', 'SMS');

      INSERT INTO message (ROWID, guid, handle_id, date, text_extracted) VALUES
        (1, 'a', 1, 700000000000000000, 'Amazon order has been received'),
        (2, 'b', 1, 700000001000000000, 'Amazon payment approved 17.99'),
        (3, 'c', 1, 700000002000000000, 'Delivery completed'),
        (4, 'd', 2, 700000003000000000, 'Bank payment approved 15.00 credit'),
        (5, 'e', 2, 700000004000000000, 'Bank payment approved 8.00 credit Amazon'),
        (6, 'f', 1, 700000005000000000, NULL),
        (7, 'g', 1, 700000006000000000, 'Deleted message');

      UPDATE message SET deleted_at = 1 WHERE ROWID = 7;

      INSERT INTO sender_alias (phone_normalized, alias) VALUES
        ('+1234567890', 'Amazon');
    `)
  })

  afterAll(() => {
    db.close()
  })

  describe('searchMessages', () => {
    it('should find messages with single term', () => {
      const result = searchMessages(db, 'Amazon')
      expect(result.total).toBe(3)
      expect(result.messages).toHaveLength(3)
    })

    it('should AND multiple terms (space-separated)', () => {
      const result = searchMessages(db, 'Amazon payment')
      expect(result.total).toBe(2)
    })

    it('should AND three or more terms', () => {
      const result = searchMessages(db, 'Bank payment credit')
      expect(result.total).toBe(2)
    })

    it('should treat quoted string as single term', () => {
      const result = searchMessages(db, '"Amazon payment"')
      expect(result.total).toBe(1)
    })

    it('should return empty for non-matching query', () => {
      const result = searchMessages(db, 'nonexistent12345')
      expect(result.total).toBe(0)
      expect(result.messages).toHaveLength(0)
    })

    it('should exclude deleted messages', () => {
      const result = searchMessages(db, 'Deleted')
      expect(result.total).toBe(0)
    })

    it('should respect limit option', () => {
      const result = searchMessages(db, 'approved', { limit: 2 })
      expect(result.messages).toHaveLength(2)
      expect(result.total).toBe(3)
      expect(result.limit).toBe(2)
    })

    it('should respect offset option', () => {
      const result1 = searchMessages(db, 'approved', { limit: 2, offset: 0 })
      const result2 = searchMessages(db, 'approved', { limit: 2, offset: 2 })

      expect(result1.messages[0].rowid).not.toBe(result2.messages[0].rowid)
    })

    it('should filter by sender (from option)', () => {
      const result = searchMessages(db, 'approved', { from: 'Amazon' })
      expect(result.total).toBe(1)
      expect(result.messages[0].sender_name).toBe('Amazon')
    })

    it('should filter by date range (after)', () => {
      const afterDate = new Date('2001-01-01T00:00:00Z')
      const result = searchMessages(db, 'approved', { after: afterDate })
      expect(result.total).toBe(3)
    })

    it('should handle empty query gracefully', () => {
      const result = searchMessages(db, '')
      expect(result.total).toBe(6)
    })

    it('should handle single character search', () => {
      const result = searchMessages(db, 'A')
      expect(result.total).toBeGreaterThan(0)
    })
  })
})
