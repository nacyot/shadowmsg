import { describe, it, expect } from 'vitest'
import { extractFromAttributedBody } from '../../src/utils/attributed-string.js'

describe('attributed-string', () => {
  describe('extractFromAttributedBody', () => {
    it('should return null for null input', () => {
      expect(extractFromAttributedBody(null as unknown as Buffer)).toBe(null)
    })

    it('should return null for empty buffer', () => {
      expect(extractFromAttributedBody(Buffer.from([]))).toBe(null)
    })

    it('should return null for buffer too small', () => {
      expect(extractFromAttributedBody(Buffer.from('short'))).toBe(null)
    })

    it('should return null if NSString marker not found', () => {
      const buf = Buffer.alloc(100)
      buf.write('some random content without markers')
      expect(extractFromAttributedBody(buf)).toBe(null)
    })

    it('should extract text from NSAttributedString format', () => {
      // Simulate the binary format: header + NSString + marker + length + text + trailer
      const text = '[SMS]\nThis is a test message'
      const textBytes = Buffer.from(text, 'utf8')

      // Build a realistic buffer
      const header = Buffer.from('streamtyped_padding_NSMutableAttributedString_NSAttributedString_NSObject_NSMutableString_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b]) // marker + '+'
      const lengthByte = Buffer.from([textBytes.length]) // single byte length
      const trailer = Buffer.from('\x86\x84\x01iI\x00NSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(text)
    })

    it('should extract English text', () => {
      const text = 'Hello World! This is a test message.'
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      const lengthByte = Buffer.from([textBytes.length])
      const trailer = Buffer.from('\x86\x84\x01iINSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(text)
    })

    it('should handle multi-byte length encoding for long text', () => {
      // Text longer than 127 bytes uses multi-byte length encoding
      const text = '[SMS]\n' + 'Test message '.repeat(50).trim() // ~200+ bytes, trimmed
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      // Multi-byte length: 0x81 + 2 bytes for length
      const lengthBytes = Buffer.from([0x81, textBytes.length & 0xff, (textBytes.length >> 8) & 0xff])
      const trailer = Buffer.from('\x86\x84\x01iINSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthBytes, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(text)
    })

    it('should remove trailing iI marker from text', () => {
      const text = 'Message content'
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      const lengthByte = Buffer.from([textBytes.length + 10]) // Include some trailer in "text"
      // Text with some trailing garbage that should be cleaned
      const textWithGarbage = Buffer.concat([textBytes, Buffer.from('\x81\x81\x81iI!')])
      const trailer = Buffer.from('NSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textWithGarbage, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(text)
    })

    it('should remove control characters from extracted text', () => {
      const text = 'Message\x00\x01\x02content' // Text with control chars
      const expectedClean = 'Messagecontent'
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      const lengthByte = Buffer.from([textBytes.length])
      const trailer = Buffer.from('\x86\x84\x01iINSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(expectedClean)
    })

    it('should remove object replacement character (attachment placeholder)', () => {
      const text = 'Image: \uFFFC attached' // With object replacement char
      const expectedClean = 'Image:  attached'
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      const lengthByte = Buffer.from([textBytes.length])
      const trailer = Buffer.from('\x86\x84\x01iINSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(expectedClean)
    })

    it('should handle text with newlines correctly', () => {
      const text = 'First line\nSecond line\nThird line'
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      const lengthByte = Buffer.from([textBytes.length])
      const trailer = Buffer.from('\x86\x84\x01iINSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(text)
    })

    it('should handle Japanese text', () => {
      const text = 'Hello. Reservation number.'
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      const lengthByte = Buffer.from([textBytes.length])
      const trailer = Buffer.from('\x86\x84\x01iINSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(text)
    })

    it('should handle mixed content', () => {
      const text = '[SMS] Hello World 123'
      const textBytes = Buffer.from(text, 'utf8')

      const header = Buffer.from('streamtyped_NSString\x00')
      const marker = Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b])
      const lengthByte = Buffer.from([textBytes.length])
      const trailer = Buffer.from('\x86\x84\x01iINSDictionary')

      const fullBuffer = Buffer.concat([header, marker, lengthByte, textBytes, trailer])

      const result = extractFromAttributedBody(fullBuffer)
      expect(result).toBe(text)
    })

    it('should return null for buffer without + marker after NSString', () => {
      const header = Buffer.from('streamtyped_NSString\x00')
      const noMarker = Buffer.alloc(100) // No 0x2b (+) marker
      const fullBuffer = Buffer.concat([header, noMarker])

      expect(extractFromAttributedBody(fullBuffer)).toBe(null)
    })
  })
})
