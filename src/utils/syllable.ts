/**
 * Convert text to space-separated characters for FTS5 unicode61 tokenizer.
 * "hello" → "h e l l o"
 */
export function toSyllables(text: string): string {
  return text.split('').join(' ')
}

/**
 * Convert search query to character-separated format.
 * "test" → "t e s t"
 */
export function toSyllableQuery(query: string): string {
  return toSyllables(query)
}
