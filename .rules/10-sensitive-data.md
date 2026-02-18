# Sensitive Data Detection Rules

## Patterns to Check

### Phone Numbers
- Korean: `+82`, `010`, `1577-`, `1588-`
- Any 10+ digit number with country code

### Personal Information
- Real names (check test data)
- Email addresses
- Physical addresses
- IP addresses

### Financial Data
- Currency amounts that look like real transactions
- Card numbers, account numbers
- Payment/order details

### API & Secrets
- `sk-`, `api_key`, `secret`, `token`, `password`
- Hardcoded credentials

### Localized Content
- Korean characters: `[\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]`
- Region-specific company names (Coupang, Shinhan, etc.)

## Grep Commands for Verification

```bash
# Korean characters (exclude .gitignore'd dirs)
grep -r --include="*.ts" --include="*.js" --include="*.json" --include="*.md" \
  -P '[\x{AC00}-\x{D7A3}\x{3131}-\x{314E}\x{314F}-\x{3163}]' . \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.notes \
  --exclude=package-lock.json

# Korean phone numbers
grep -r -E '\+82[0-9]|010[0-9]{8}|15(77|88)-' .

# Git history check
git log -p --all | grep -E '(pattern)'
```

## Safe Test Data Examples

```typescript
// Phone numbers
'+1234567890', '+0987654321'

// Names
'Alice', 'Bob', 'Example Corp'

// Messages
'Order confirmed', 'Payment approved 10.00'
```
