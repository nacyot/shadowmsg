import { describe, it, expect } from 'vitest'
import { cleanText } from '../../src/utils/text-cleaner.js'

describe('text-cleaner', () => {
  describe('cleanText', () => {
    // Basic cases
    it('should return null for null input', () => {
      expect(cleanText(null)).toBe(null)
    })

    it('should keep normal text unchanged', () => {
      expect(cleanText('Hello World')).toBe('Hello World')
    })

    it('should trim whitespace', () => {
      expect(cleanText('  Hello World  ')).toBe('Hello World')
    })

    it('should return null for empty string after cleaning', () => {
      expect(cleanText('   ')).toBe(null)
    })

    it('should handle SMS text', () => {
      expect(cleanText('[SMS] Your order is complete')).toBe('[SMS] Your order is complete')
    })

    // Legacy data detection (NSAttributedString markers)
    it('should return null for text containing streamtyped', () => {
      expect(cleanText('streamtyped...')).toBe(null)
    })

    it('should return null for text containing NSMutableAttributedString', () => {
      expect(cleanText('some prefix NSMutableAttributedString data')).toBe(null)
    })

    it('should return null for text with streamtyped in the middle', () => {
      expect(cleanText('some data streamtyped more binary stuff')).toBe(null)
    })

    // Garbage byte removal
    it('should remove trailing garbage bytes', () => {
      const textWithGarbage = 'Hello World\x84'
      expect(cleanText(textWithGarbage)).toBe('Hello World')
    })

    it('should remove multiple trailing high bytes', () => {
      const textWithGarbage = 'Message content\x80\x81\x82\x83'
      expect(cleanText(textWithGarbage)).toBe('Message content')
    })

    // iI marker removal
    it('should remove trailing iI marker', () => {
      expect(cleanText('Test messageiI')).toBe('Test message')
    })

    it('should remove trailing iI marker with characters after', () => {
      expect(cleanText('Test messageiI!')).toBe('Test message')
      expect(cleanText('Test messageiI,NSD')).toBe('Test message')
    })

    it('should remove iI marker with preceding high bytes', () => {
      expect(cleanText('Test message\x81\x81\x81iI')).toBe('Test message')
    })

    it('should not remove iI in the middle of text', () => {
      expect(cleanText('Code: IN6ii41rvYt here')).toBe('Code: IN6ii41rvYt here')
    })

    // Control character removal
    it('should remove control characters except newlines and tabs', () => {
      expect(cleanText('Hello\x00\x01\x02World')).toBe('HelloWorld')
    })

    it('should preserve newlines', () => {
      expect(cleanText('Line 1\nLine 2')).toBe('Line 1\nLine 2')
    })

    it('should preserve tabs', () => {
      expect(cleanText('Column1\tColumn2')).toBe('Column1\tColumn2')
    })

    it('should preserve carriage returns', () => {
      expect(cleanText('Line 1\r\nLine 2')).toBe('Line 1\r\nLine 2')
    })

    // Replacement character removal
    it('should remove replacement character (U+FFFD)', () => {
      expect(cleanText('Test\uFFFDmessage')).toBe('Testmessage')
    })

    it('should remove object replacement character (U+FFFC)', () => {
      expect(cleanText('Image: \uFFFC attached')).toBe('Image:  attached')
    })

    // Complex cases
    it('should handle text with multiple types of garbage', () => {
      const messy = 'Message content\x00\uFFFD\x81iI!'
      expect(cleanText(messy)).toBe('Message content')
    })

    it('should handle real-world message format', () => {
      const message = `[SMS]
Payment Approved
John Doe
472.18 USD
12/01 23:13
Insurance Company
Total: 8,875.51`
      expect(cleanText(message)).toBe(message)
    })

    // Edge cases
    it('should handle text that is only garbage', () => {
      expect(cleanText('\x80\x81\x82')).toBe(null)
    })

    it('should handle very long text', () => {
      const longText = 'Test '.repeat(1000).trim()
      expect(cleanText(longText)).toBe(longText)
    })
  })
})
