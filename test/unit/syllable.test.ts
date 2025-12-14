import { describe, it, expect } from 'vitest'
import { toSyllables, toSyllableQuery } from '../../src/utils/syllable.js'

describe('syllable', () => {
  describe('toSyllables', () => {
    it('should convert text to space-separated characters', () => {
      expect(toSyllables('hello')).toBe('h e l l o')
    })

    it('should handle single character', () => {
      expect(toSyllables('a')).toBe('a')
    })

    it('should handle two characters', () => {
      expect(toSyllables('ab')).toBe('a b')
    })

    it('should handle mixed content', () => {
      expect(toSyllables('test')).toBe('t e s t')
    })

    it('should handle empty string', () => {
      expect(toSyllables('')).toBe('')
    })

    it('should handle numbers', () => {
      expect(toSyllables('123')).toBe('1 2 3')
    })
  })

  describe('toSyllableQuery', () => {
    it('should convert search query to character format', () => {
      expect(toSyllableQuery('test')).toBe('t e s t')
    })
  })
})
