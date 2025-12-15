// @ts-nocheck
import { buildCommand } from '@stricli/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'
import { autoSyncIfNeeded } from '../utils/auto-sync.js'

const SAVED_QUERIES: Record<string, string> = {
  'recent-orders': `
    SELECT
      datetime(m.date/1000000000+strftime('%s','2001-01-01'),'unixepoch','localtime') AS sent_at,
      COALESCE(sa.alias, h.id) AS sender,
      SUBSTR(m.text_extracted, 1, 100) AS content
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
    WHERE m.text_extracted LIKE '%payment%' OR m.text_extracted LIKE '%order%'
    ORDER BY m.date DESC
    LIMIT 20
  `,
  'by-sender': `
    SELECT
      COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), h.id) AS sender,
      COUNT(*) AS message_count
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN contact c ON h.id = c.phone_normalized
    LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
    WHERE m.deleted_at IS NULL AND m.is_from_me = 0
    GROUP BY sender
    ORDER BY message_count DESC
    LIMIT 30
  `,
  'yearly-stats': `
    SELECT
      strftime('%Y', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') AS year,
      COUNT(*) AS count
    FROM message
    WHERE deleted_at IS NULL
    GROUP BY year
    ORDER BY year
  `,
  'monthly-stats': `
    SELECT
      strftime('%Y-%m', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') AS month,
      COUNT(*) AS count
    FROM message
    WHERE deleted_at IS NULL
    GROUP BY month
    ORDER BY month DESC
    LIMIT 24
  `,
}

function outputTable(results: Record<string, unknown>[]): void {
  if (results.length === 0) {
    console.log(chalk.yellow('No results'))
    return
  }

  const columns = Object.keys(results[0])

  const widths: Record<string, number> = {}
  for (const col of columns) {
    widths[col] = Math.max(
      col.length,
      ...results.map(r => String(r[col] ?? '').slice(0, 50).length)
    )
  }

  const header = columns.map(c => c.padEnd(widths[c])).join(' | ')
  console.log('')
  console.log(header)
  console.log(columns.map(c => '─'.repeat(widths[c])).join('─┼─'))

  for (const row of results) {
    const line = columns.map(c => {
      const val = String(row[c] ?? '').slice(0, 50)
      return val.padEnd(widths[c])
    }).join(' | ')
    console.log(line)
  }

  console.log('')
  console.log(`${results.length} row(s)`)
}

export const queryCommand = buildCommand({
  docs: {
    brief: 'Execute raw SQL query on shadow database',
  },
  async func(flags, ...args: string[]) {
    const sql = args[0]
    if (flags['list-saved']) {
      console.log('')
      console.log(chalk.bold('Available saved queries:'))
      console.log('─'.repeat(40))
      for (const name of Object.keys(SAVED_QUERIES)) {
        console.log(`  ${chalk.cyan(name)}`)
      }
      console.log('')
      console.log('Use: ' + chalk.cyan('sm query --saved <name>'))
      return
    }

    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    let query: string | undefined

    if (flags.saved) {
      query = SAVED_QUERIES[flags.saved]
      if (!query) {
        console.error(`Unknown saved query: ${flags.saved}\nUse --list-saved to see available queries.`)
        process.exit(1)
      }
    } else if (flags.file) {
      if (!fs.existsSync(flags.file)) {
        console.error(`File not found: ${flags.file}`)
        process.exit(1)
      }
      query = fs.readFileSync(flags.file, 'utf-8')
    } else if (sql) {
      query = sql
    } else {
      console.error('Please provide a SQL query, --file, or --saved option')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    try {
      const stmt = db.query(query)
      const isSelect = query.trim().toUpperCase().startsWith('SELECT')

      if (isSelect) {
        const results = stmt.all() as Record<string, unknown>[]

        if (flags.json) {
          console.log(JSON.stringify(results, null, 2))
        } else {
          outputTable(results)
        }
      } else {
        const result = stmt.run()
        console.log(chalk.green('✓') + ` Query executed. Changes: ${result.changes}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`SQL Error: ${error.message}`)
        process.exit(1)
      }
      throw error
    }
  },
  parameters: {
    positional: {
      kind: 'array',
      parameter: {
        brief: 'SQL query to execute',
        parse: String,
        placeholder: 'sql',
      },
    },
    flags: {
      file: {
        kind: 'parsed',
        brief: 'Read SQL from file',
        parse: String,
        optional: true,
      },
      saved: {
        kind: 'parsed',
        brief: 'Run a saved query (recent-orders, by-sender, yearly-stats, monthly-stats)',
        parse: String,
        optional: true,
      },
      'list-saved': {
        kind: 'boolean',
        brief: 'List available saved queries',
        default: false,
      },
      json: {
        kind: 'boolean',
        brief: 'Output as JSON',
        default: false,
      },
      'no-sync': {
        kind: 'boolean',
        brief: 'Skip auto-sync before command execution',
        default: false,
      },
    },
  },
})
