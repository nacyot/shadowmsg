import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Database } from 'bun:sqlite'
import { initializeSchema } from '../../src/services/database.js'
import { pushMessages, getPushState, resetPushState, countPendingMessages } from '../../src/services/push.js'
import type { PushConfig, FetchFn } from '../../src/services/push.js'

function createTestDb(): Database {
  const db = new Database(':memory:')
  initializeSchema(db)

  db.exec(`
    INSERT INTO handle (ROWID, id, service) VALUES
      (1, '+1234567890', 'iMessage'),
      (2, '+0987654321', 'SMS');

    INSERT INTO contact (phone_normalized, name, organization) VALUES
      ('+0987654321', 'Bob', 'Example Corp');

    INSERT INTO sender_alias (phone_normalized, alias) VALUES
      ('+1234567890', 'Alice');

    INSERT INTO message (ROWID, guid, handle_id, date, is_from_me, text_extracted) VALUES
      (1, 'a', 1, 700000000000000000, 0, 'Order confirmed'),
      (2, 'b', 1, 700000001000000000, 0, 'Payment approved 10.00'),
      (3, 'c', 2, 700000002000000000, 0, 'Delivery completed'),
      (4, 'd', 2, 700000003000000000, 1, 'Thank you'),
      (5, 'e', 1, 700000004000000000, 0, 'Refund processed');
  `)

  return db
}

function createMockFetch(response: object = { imported: 0, skipped: 0 }): FetchFn {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }) as unknown as FetchFn
}

describe('push service', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  const baseConfig: PushConfig = {
    endpoint: 'https://example.com/api/v2/messages/bulk',
    apiKey: 'test-key',
    batchSize: 500,
    dryRun: false,
  }

  describe('pushMessages', () => {
    it('should push all messages and update push_state', async () => {
      const fetchFn = createMockFetch({ imported: 5, skipped: 0 })

      const result = await pushMessages(db, baseConfig, { fetchFn })

      expect(result.batches).toBe(1)
      expect(result.total).toBe(5)
      expect(result.imported).toBe(5)
      expect(result.skipped).toBe(0)
      expect(result.lastRowid).toBe(5)

      expect(fetchFn).toHaveBeenCalledOnce()
      const [url, options] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(url).toBe(baseConfig.endpoint)
      expect(options.headers['Authorization']).toBe('Bearer test-key')

      const body = JSON.parse(options.body)
      expect(body.messages).toHaveLength(5)
      expect(body.messages[0].external_id).toBe(1)

      const state = getPushState(db, baseConfig.endpoint)
      expect(state.last_pushed_rowid).toBe(5)
    })

    it('should do incremental push (only new messages)', async () => {
      const fetchFn = createMockFetch({ imported: 5, skipped: 0 }) as ReturnType<typeof vi.fn>

      // First push
      await pushMessages(db, baseConfig, { fetchFn: fetchFn as unknown as FetchFn })
      expect(fetchFn).toHaveBeenCalledOnce()

      // Add new messages
      db.exec(`
        INSERT INTO message (ROWID, guid, handle_id, date, is_from_me, text_extracted) VALUES
          (6, 'f', 1, 700000005000000000, 0, 'New message');
      `)

      fetchFn.mockResolvedValue({
        ok: true,
        json: async () => ({ imported: 1, skipped: 0 }),
        text: async () => '{}',
      })

      // Second push — only new message
      const result = await pushMessages(db, baseConfig, { fetchFn: fetchFn as unknown as FetchFn })
      expect(result.total).toBe(1)
      expect(result.lastRowid).toBe(6)

      const body = JSON.parse(fetchFn.mock.calls[1][1].body)
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].external_id).toBe(6)
    })

    it('should split into multiple batches', async () => {
      const fetchFn = createMockFetch({ imported: 2, skipped: 0 })
      const batches: number[] = []

      const result = await pushMessages(
        db,
        { ...baseConfig, batchSize: 2 },
        {
          fetchFn,
          onBatch: (_batch, sent) => { batches.push(sent) },
        },
      )

      expect(result.batches).toBe(3)
      expect(batches).toEqual([2, 2, 1])
      expect(fetchFn).toHaveBeenCalledTimes(3)
    })

    it('should handle dry-run without calling fetch', async () => {
      const fetchFn = createMockFetch()

      const result = await pushMessages(db, { ...baseConfig, dryRun: true }, { fetchFn })

      expect(fetchFn).not.toHaveBeenCalled()
      expect(result.total).toBe(5)
      expect(result.imported).toBe(5)

      // push_state should NOT be updated in dry-run
      const state = getPushState(db, baseConfig.endpoint)
      expect(state.last_pushed_rowid).toBe(0)
    })

    it('should resend all after full reset', async () => {
      const fetchFn = createMockFetch({ imported: 5, skipped: 0 })

      // First push
      await pushMessages(db, baseConfig, { fetchFn })
      expect(getPushState(db, baseConfig.endpoint).last_pushed_rowid).toBe(5)

      // Reset
      resetPushState(db, baseConfig.endpoint)
      expect(getPushState(db, baseConfig.endpoint).last_pushed_rowid).toBe(0)

      // Push again — should resend all
      const result = await pushMessages(db, baseConfig, { fetchFn })
      expect(result.total).toBe(5)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('should preserve previous batch state on API error', async () => {
      let callCount = 0
      const fetchFn = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          return { ok: false, status: 500, text: async () => 'Server error' }
        }
        return {
          ok: true,
          json: async () => ({ imported: 2, skipped: 0 }),
          text: async () => '{}',
        }
      }) as unknown as FetchFn

      await expect(
        pushMessages(db, { ...baseConfig, batchSize: 2 }, { fetchFn })
      ).rejects.toThrow('Push failed (HTTP 500)')

      // First batch (rowid 1,2) should be saved
      const state = getPushState(db, baseConfig.endpoint)
      expect(state.last_pushed_rowid).toBe(2)
    })

    it('should resolve sender_name: alias > contact > org > phone', async () => {
      const fetchFn = createMockFetch({ imported: 5, skipped: 0 })

      await pushMessages(db, baseConfig, { fetchFn })

      const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      // +1234567890 has alias 'Alice'
      expect(body.messages[0].sender).toBe('+1234567890')
      expect(body.messages[0].sender_name).toBe('Alice')
      // +0987654321 has contact name 'Bob'
      expect(body.messages[2].sender).toBe('+0987654321')
      expect(body.messages[2].sender_name).toBe('Bob')
    })

    it('should handle empty database', async () => {
      const emptyDb = new Database(':memory:')
      initializeSchema(emptyDb)
      const fetchFn = createMockFetch()

      const result = await pushMessages(emptyDb, baseConfig, { fetchFn })

      expect(result.batches).toBe(0)
      expect(result.total).toBe(0)
      expect(fetchFn).not.toHaveBeenCalled()

      emptyDb.close()
    })

    it('should exclude deleted messages', async () => {
      db.exec(`UPDATE message SET deleted_at = datetime('now') WHERE ROWID = 3`)
      const fetchFn = createMockFetch({ imported: 4, skipped: 0 })

      const result = await pushMessages(db, baseConfig, { fetchFn })

      expect(result.total).toBe(4)
      const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      const rowids = body.messages.map((m: { external_id: number }) => m.external_id)
      expect(rowids).not.toContain(3)
    })
  })

  describe('countPendingMessages', () => {
    it('should count messages after given rowid', () => {
      expect(countPendingMessages(db, 0)).toBe(5)
      expect(countPendingMessages(db, 3)).toBe(2)
      expect(countPendingMessages(db, 5)).toBe(0)
    })
  })

  describe('getPushState', () => {
    it('should return defaults for unknown endpoint', () => {
      const state = getPushState(db, 'https://unknown.com/api')
      expect(state.last_pushed_rowid).toBe(0)
      expect(state.total_pushed).toBe(0)
    })
  })
})
