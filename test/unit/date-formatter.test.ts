import { describe, it, expect } from 'vitest'
import {
  fromMacOSDate,
  toMacOSDate,
  startOfDay,
  endOfDay,
  daysAgo,
} from '../../src/utils/date-formatter.js'

describe('date-formatter', () => {
  describe('fromMacOSDate', () => {
    it('should convert macOS timestamp to JavaScript Date', () => {
      // Test roundtrip conversion
      const originalDate = new Date('2024-01-15T12:30:00Z')
      const macOSTimestamp = toMacOSDate(originalDate)
      const convertedDate = fromMacOSDate(macOSTimestamp)

      expect(convertedDate.getUTCFullYear()).toBe(2024)
      expect(convertedDate.getUTCMonth()).toBe(0) // January
      expect(convertedDate.getUTCDate()).toBe(15)
      expect(convertedDate.getUTCHours()).toBe(12)
    })

    it('should handle zero timestamp', () => {
      const date = fromMacOSDate(0)
      expect(date.getUTCFullYear()).toBe(2001)
    })
  })

  describe('toMacOSDate', () => {
    it('should convert JavaScript Date to macOS timestamp', () => {
      const date = new Date('2024-01-01T00:00:00Z')
      const timestamp = toMacOSDate(date)

      // Convert back and check
      const converted = fromMacOSDate(timestamp)
      expect(converted.getUTCFullYear()).toBe(2024)
      expect(converted.getUTCMonth()).toBe(0)
      expect(converted.getUTCDate()).toBe(1)
    })
  })

  describe('startOfDay', () => {
    it('should return start of day', () => {
      const date = new Date('2024-06-15T14:30:45')
      const start = startOfDay(date)

      expect(start.getHours()).toBe(0)
      expect(start.getMinutes()).toBe(0)
      expect(start.getSeconds()).toBe(0)
      expect(start.getMilliseconds()).toBe(0)
    })
  })

  describe('endOfDay', () => {
    it('should return end of day', () => {
      const date = new Date('2024-06-15T14:30:45')
      const end = endOfDay(date)

      expect(end.getHours()).toBe(23)
      expect(end.getMinutes()).toBe(59)
      expect(end.getSeconds()).toBe(59)
      expect(end.getMilliseconds()).toBe(999)
    })
  })

  describe('daysAgo', () => {
    it('should return date N days ago', () => {
      const now = new Date()
      const sevenDaysAgo = daysAgo(7)

      const diff = now.getTime() - sevenDaysAgo.getTime()
      const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24))

      // Should be 7 days (or close to it due to start of day)
      expect(daysDiff).toBeGreaterThanOrEqual(6)
      expect(daysDiff).toBeLessThanOrEqual(7)
    })
  })
})
