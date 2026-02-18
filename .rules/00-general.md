# General Rules

## Code Review Before Publish

1. **Sensitive data check must include git history**
   - Current code is not enough
   - All commits in history must be clean

2. **No localized content in public repos**
   - No Korean text (even in comments, tests, examples)
   - No region-specific phone numbers (+82, 010, etc.)
   - Use generic placeholders: +1234567890, "Example Corp", "John Doe"

3. **Files excluded by .gitignore are NOT part of the review**
   - Do not delete .gitignore'd files during cleanup
   - Only review files that will be committed
