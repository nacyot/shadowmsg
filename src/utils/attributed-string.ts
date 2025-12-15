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

  // First, try to extract from RCS rich card (cardDescription field)
  const rcsText = extractFromRcsRichCard(buffer)
  if (rcsText) return rcsText

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

  // If the main text is just a replacement character, it's likely an RCS message
  // with content stored elsewhere - return null to indicate no valid text
  if (!text || text === '\uFFFE' || text === '\uFFFD') {
    return null
  }

  return text || null
}

/**
 * Extract text from RCS rich card format.
 * RCS messages store content in cardDescription field within __kIMRichCardsAttributeName.
 */
function extractFromRcsRichCard(buffer: Buffer): string | null {
  const bufStr = buffer.toString('binary')

  // Check if this is an RCS rich card message
  if (!bufStr.includes('__kIMRichCardsAttributeName')) {
    return null
  }

  // Find cardDescription field
  const cardDescMarker = 'cardDescription'
  const cardDescIndex = bufStr.indexOf(cardDescMarker)
  if (cardDescIndex < 0) return null

  // After cardDescription, there's a length byte and then the UTF-8 text
  // Pattern: cardDescription + marker bytes + length byte + text
  let pos = cardDescIndex + cardDescMarker.length

  // Skip marker bytes until we find the length indicator
  while (pos < buffer.length && (buffer[pos] < 0x20 || buffer[pos] > 0x7e)) {
    // Skip special bytes: 0x86, 0x92, 0x84, 0x98, 0x98, then length
    pos++
    if (pos - (cardDescIndex + cardDescMarker.length) > 20) break
  }

  // Now pos should be at or near the start of the text length
  // Look for a reasonable length byte (the text content follows)
  // The length is encoded as a single byte if < 128, otherwise multi-byte
  let textLength = buffer[pos]
  pos++

  if (textLength >= 0x80) {
    // Multi-byte length or this is actually content start
    // Try to find the actual text start by looking for Korean UTF-8 or ASCII
    pos--
    while (pos < buffer.length - 10) {
      // Check if this looks like UTF-8 text start
      // Korean UTF-8 starts with 0xEC, 0xED, 0xEB, 0xEA (가-힣 range: U+AC00-U+D7A3)
      // Or ASCII printable: 0x20-0x7E
      if ((buffer[pos] >= 0x20 && buffer[pos] <= 0x7e) ||
          buffer[pos] === 0x5b || // '[' for [Web발신]
          (buffer[pos] >= 0xea && buffer[pos] <= 0xed)) {
        break
      }
      pos++
    }
    textLength = 0 // Unknown length, will find end marker
  }

  const textStart = pos

  // Find where the text ends - look for end markers
  let textEnd = buffer.length
  const endMarkers = [
    Buffer.from([0x86, 0x86, 0x86, 0x86, 0x86]), // Common RCS end marker
    Buffer.from([0x86, 0x86, 0x86, 0x86]),
    // RCS rich card field names that follow cardDescription
    Buffer.from('layout'),
    Buffer.from('orientation'),
    Buffer.from('imageAlignment'),
    Buffer.from('width'),
    Buffer.from('title'),
  ]

  for (const marker of endMarkers) {
    const endIndex = buffer.indexOf(marker, textStart)
    if (endIndex > textStart && endIndex < textEnd) {
      textEnd = endIndex
    }
  }

  if (textEnd <= textStart) return null

  // Extract and decode as UTF-8
  const textBuffer = buffer.subarray(textStart, textEnd)
  let text = textBuffer.toString('utf-8')

  // Clean up - remove any remaining RCS field artifacts
  text = cleanExtractedText(text)
  // Additional RCS-specific cleanup
  text = text.replace(/layout(orientation)?q?(imageAlignment)?(width)?(title)?.*$/i, '')
  text = text.replace(/[^\x20-\x7E\u3000-\u9FFF\uAC00-\uD7AF\n\r]*$/, '')

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
