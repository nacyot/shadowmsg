# ShadowMSG

macOS Messages CLI tool that creates a searchable shadow database from `~/Library/Messages/chat.db`.

Extracts text from binary `attributedBody` BLOB (NSAttributedString format) to enable full-text search on messages that are otherwise unsearchable.

## Features

- Full-text search with FTS5 (trigram + syllable tokenization for Korean)
- Incremental sync from macOS Messages database (read-only)
- Contact sync from AddressBook
- Sender alias management
- Message browsing with pagination
- Statistics and diagnostics

## Requirements

- macOS (tested on macOS 14+)
- Node.js 18+
- **Full Disk Access** permission for Terminal/iTerm (System Settings > Privacy & Security > Full Disk Access)

## Installation

```bash
npm install -g shadowmsg
```

Or run directly:

```bash
npx shadowmsg --help
```

## Quick Start

```bash
# Initialize shadow database
sm init

# Check system configuration
sm doctor

# Sync messages from Messages.app
sm sync

# Search messages
sm search "keyword"
```

## Commands

### Core

```bash
sm init              # Initialize shadow database (~/.shadowmsg/shadow.db)
sm sync              # Sync messages (incremental, auto-syncs if >5min old)
sm sync --full       # Force full resync with FTS rebuild
sm sync rebuild      # Rebuild database from scratch
sm doctor            # Check configuration and permissions
```

### Search

```bash
sm search "keyword"                    # Basic search
sm search "term1 term2"                # AND search (both terms required)
sm search "exact phrase" --from +1234567890  # Filter by sender
sm search "keyword" --after 2024-01-01         # Filter by date
sm search "keyword" --json                      # JSON output
sm search "keyword" --short                     # One-line format
```

### Browse Messages

```bash
sm message list                  # List recent messages
sm message list --days 7         # Last 7 days
sm message list --from "sender"  # Filter by sender
sm message get 12345             # Get specific message by ROWID
sm message context 12345         # Show conversation around message
```

### Statistics

```bash
sm stats              # Overall statistics
sm stats --yearly     # Yearly breakdown
sm stats --monthly    # Monthly breakdown
```

### Contacts & Senders

```bash
sm contact list              # List synced contacts
sm contact search "name"     # Search contacts
sm contact stats             # Top contacts by message count

sm sender list               # List sender aliases
sm sender add "+1234567890" "Name"   # Add alias
sm sender remove "+1234567890"       # Remove alias
sm sender suggest            # Suggest senders needing aliases
```

### Advanced

```bash
sm query "SELECT COUNT(*) FROM message"   # Raw SQL query
sm query --saved yearly-stats             # Run saved query
sm query --list-saved                     # List saved queries
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SHADOWMSG_DIR` | Shadow database directory | `~/.shadowmsg` |
| `SHADOWMSG_SOURCE_DB` | Source Messages database | `~/Library/Messages/chat.db` |

## How It Works

1. Reads from `~/Library/Messages/chat.db` (read-only)
2. Extracts text from `attributedBody` BLOB (NSAttributedString binary format)
3. Stores in `~/.shadowmsg/shadow.db` with FTS5 full-text indexes
4. Auto-syncs if last sync was >5 minutes ago

### Text Extraction

macOS stores some messages in binary `attributedBody` instead of plain `text` column. This tool extracts readable text from the binary NSAttributedString format.

## Data Privacy

- All data stays local - no external API calls
- Source database is accessed read-only
- Shadow database stored in `~/.shadowmsg/`

> **⚠️ SECURITY WARNING**
>
> The shadow database contains **unencrypted copies of your private messages**. You are solely responsible for securing this data.
>
> When no longer needed: `rm -rf ~/.shadowmsg`

## License

MIT
