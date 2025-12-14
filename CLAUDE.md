# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ShadowMSG** - macOS Messages CLI tool that creates a searchable shadow database from `~/Library/Messages/chat.db`. Extracts text from binary `attributedBody` BLOB (NSAttributedString format) to enable full-text search.

## Commands

```bash
# Build
npm run build

# Test
npm test
npm test -- --watch    # Watch mode

# CLI (after build)
./bin/run.js --help
./bin/run.js init
./bin/run.js sync
./bin/run.js search "keyword"
```

## Architecture

### Tech Stack
- **CLI Framework**: oclif
- **Database**: better-sqlite3 with FTS5
- **Language**: TypeScript (ESM)
- **Testing**: vitest

### Key Directories
```
src/
├── commands/          # oclif commands
│   ├── init.ts
│   ├── search.ts
│   ├── sync/
│   ├── message/
│   └── sender/
├── services/
│   ├── database.ts    # SQLite connection, schema
│   ├── sync.ts        # Messages DB → shadow.db sync
│   └── search.ts      # FTS5 search routing
└── utils/
    ├── syllable.ts    # Korean text → space-separated syllables
    ├── text-cleaner.ts
    └── date-formatter.ts
```

### Dual-Index FTS5 Strategy
- `fts_trigram`: 3+ character searches (1-3ms)
- `fts_char`: 1-2 character searches using syllable tokenization (~16ms)

### Data Flow
1. `sm sync` reads from `~/Library/Messages/chat.db` (read-only)
2. Extracts text from `attributedBody` BLOB
3. Stores in `~/.shadowmsg/shadow.db` with FTS5 indexes
4. Auto-sync triggers if last sync > 5 minutes

### macOS Date Format
- Nanoseconds since 2001-01-01 00:00:00 UTC
- Convert: `(timestamp / 1_000_000) + Date('2001-01-01').getTime()`

## Development Guidelines

- **TDD**: Write tests first, then implement
- **All commands must have --help with examples**
- Run `npm run build && npm test` before committing
