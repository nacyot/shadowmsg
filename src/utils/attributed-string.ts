/**
 * Extract plain text from NSAttributedString binary format.
 *
 * The attributedBody column in Messages database contains serialized NSAttributedString.
 * Format (actual structure from analysis):
 *   - Header: streamtyped...NSMutableAttributedString...NSString
 *   - Marker: \x01\x95\x84\x01
 *   - Length prefix: + (0x2B) followed by length byte(s)
 *   - Text content: UTF-8 encoded string
 *   - Trailer: binary metadata (NSDictionary, bplist, etc.)
 *
 * This parser extracts the text content without relying on bplist parsing,
 * which can be unreliable for this specific format.
 */

// Markers that indicate end of text content
const END_MARKERS = [
  Buffer.from([0x86, 0x84, 0x01]), // Common end marker before iI
  Buffer.from([0x81, 0x81, 0x81]), // Another common end marker
  Buffer.from('NSDictionary'),
  Buffer.from('__kIM'),
  Buffer.from('bplist00'),
  Buffer.from('iI'), // End marker for message metadata
]

/**
 * Extract plain text from NSAttributedString binary buffer.
 * Returns null if extraction fails or no text found.
 */
export function extractFromAttributedBody(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 50) return null

  // Find NSString marker - the text follows after this
  const nsStringIndex = findNSStringEnd(buffer)
  if (nsStringIndex < 0) return null

  // After NSString, pattern is: \x01\x95\x84\x01 + length_prefix + text
  // Skip to the '+' (0x2B) marker which precedes the length
  let pos = nsStringIndex

  // Find the '+' marker
  while (pos < buffer.length && buffer[pos] !== 0x2b) {
    pos++
  }

  if (pos >= buffer.length) return null

  // Skip the '+' marker
  pos++

  // Read length byte(s)
  // Single byte if < 0x80, otherwise multi-byte encoding
  if (buffer[pos] >= 0x80) {
    // Multi-byte length: 0x81 followed by 2 more bytes
    pos++ // Skip 0x81
    pos += 2 // Skip the 2-byte length value
  } else {
    // Single byte length
    pos++
  }

  const textStart = pos

  // Find where text ends
  let textEnd = findTextEnd(buffer, textStart)
  if (textEnd <= textStart) {
    textEnd = buffer.length
  }

  // Extract and decode as UTF-8
  const textBuffer = buffer.subarray(textStart, textEnd)
  let text = textBuffer.toString('utf-8')

  // Clean up any remaining binary artifacts
  text = cleanExtractedText(text)

  return text || null
}

/**
 * Find the position after NSString marker in buffer.
 */
function findNSStringEnd(buffer: Buffer): number {
  // Look for NSString marker (without null byte - the format uses length-prefixed strings)
  const bufStr = buffer.toString('binary')
  const nsStringIdx = bufStr.indexOf('NSString')

  if (nsStringIdx >= 0) {
    return nsStringIdx + 8 // Length of "NSString"
  }

  return -1
}

/**
 * Find where the text content ends.
 */
function findTextEnd(buffer: Buffer, startFrom: number): number {
  // Look for end markers
  for (const marker of END_MARKERS) {
    const index = buffer.indexOf(marker, startFrom)
    if (index > startFrom) {
      // Walk backwards to skip any binary prefix before the marker
      let end = index
      while (end > startFrom && isControlByte(buffer[end - 1])) {
        end--
      }
      return end
    }
  }

  // Fallback: find first sequence of control bytes that looks like metadata start
  for (let i = startFrom + 10; i < buffer.length - 5; i++) {
    // Look for pattern like: text... + control bytes + "iI" or "NS"
    if (buffer[i] < 0x20 && buffer[i] !== 0x0a && buffer[i] !== 0x0d) {
      // Check if this starts a control sequence
      let controlCount = 0
      for (let j = i; j < Math.min(i + 10, buffer.length); j++) {
        if (isControlByte(buffer[j])) controlCount++
      }
      if (controlCount >= 3) {
        return i
      }
    }
  }

  return buffer.length
}

/**
 * Check if a byte is a control character (non-printable)
 */
function isControlByte(byte: number): boolean {
  return byte < 0x20 && byte !== 0x0a && byte !== 0x0d && byte !== 0x09
}

/**
 * Clean up extracted text by removing any remaining binary artifacts.
 */
function cleanExtractedText(text: string): string {
  let cleaned = text

  // Remove control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')

  // Remove replacement character
  cleaned = cleaned.replace(/\uFFFD/g, '')

  // Remove object replacement character (used for attachments)
  cleaned = cleaned.replace(/\uFFFC/g, '')

  // Remove any trailing binary garbage (high bytes followed by ASCII)
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x80-\xff]+[a-zA-Z_]+[\x00-\x1f]*$/g, '')

  // Remove trailing iI marker with any preceding garbage
  // Pattern: optional high bytes + iI + optional characters at end
  cleaned = cleaned.replace(/[\x80-\xff]*iI.{0,5}$/g, '')

  // Trim whitespace
  cleaned = cleaned.trim()

  return cleaned
}
