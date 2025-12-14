/**
 * macOS Messages date is nanoseconds since 2001-01-01 00:00:00 UTC
 */
const MACOS_EPOCH = new Date('2001-01-01T00:00:00Z').getTime()

/**
 * Convert macOS Messages timestamp to JavaScript Date.
 */
export function fromMacOSDate(nanoseconds: number): Date {
  const milliseconds = Math.floor(nanoseconds / 1_000_000)
  return new Date(MACOS_EPOCH + milliseconds)
}

/**
 * Format date for display.
 */
export function formatDate(date: Date): string {
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Format date for short display.
 */
export function formatDateShort(date: Date): string {
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Parse ISO date string to Date object.
 */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr)
}

/**
 * Get start of day for a given date.
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Get end of day for a given date.
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Get date N days ago.
 */
export function daysAgo(days: number): Date {
  const result = new Date()
  result.setDate(result.getDate() - days)
  return startOfDay(result)
}

/**
 * Convert JavaScript Date to macOS timestamp (nanoseconds).
 */
export function toMacOSDate(date: Date): number {
  const milliseconds = date.getTime() - MACOS_EPOCH
  return milliseconds * 1_000_000
}
