/**
 * Clean text for display purposes.
 *
 * This function performs minimal cleanup on text that has already been
 * extracted from NSAttributedString by attributed-string.ts during sync.
 * It handles edge cases and legacy data that might still have artifacts.
 */
export function cleanText(text: string | null): string | null {
  if (!text) return null

  // Legacy data check: if text still contains NSAttributedString binary markers,
  // it wasn't properly extracted - return null to show (no content) rather than garbage
  if (text.includes('streamtyped') || text.includes('NSMutableAttributedString')) {
    return null
  }

  let cleaned = text

  // Remove any remaining control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')

  // Remove replacement character (used for unknown bytes)
  cleaned = cleaned.replace(/\uFFFD/g, '')

  // Remove object replacement character (used for attachments)
  cleaned = cleaned.replace(/\uFFFC/g, '')

  // Remove trailing iI marker with any preceding garbage (legacy data)
  cleaned = cleaned.replace(/[\x80-\xff]*iI.{0,5}$/g, '')

  // Remove any trailing high bytes (garbage from binary data)
  cleaned = cleaned.replace(/[\x80-\xff]+$/g, '')

  // Trim whitespace
  cleaned = cleaned.trim()

  return cleaned || null
}
