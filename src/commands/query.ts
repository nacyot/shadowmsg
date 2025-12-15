import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import { BaseCommand } from '../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'

// Built-in saved queries
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

export default class Query extends BaseCommand {
  static description = 'Execute raw SQL query on shadow database'

  static examples = [
    '<%= config.bin %> query "SELECT COUNT(*) FROM message"',
    '<%= config.bin %> query --file ./my-query.sql',
    '<%= config.bin %> query --saved recent-orders',
    '<%= config.bin %> query --saved by-sender --json',
    '<%= config.bin %> query --list-saved',
  ]

  static args = {
    sql: Args.string({
      description: 'SQL query to execute',
      required: false,
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Read SQL from file',
    }),
    saved: Flags.string({
      char: 's',
      description: 'Run a saved query (recent-orders, by-sender, yearly-stats, monthly-stats)',
    }),
    'list-saved': Flags.boolean({
      description: 'List available saved queries',
      default: false,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
    table: Flags.boolean({
      description: 'Output as table (default)',
      default: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Query)

    if (flags['list-saved']) {
      this.log('')
      this.log(chalk.bold('Available saved queries:'))
      this.log('─'.repeat(40))
      for (const name of Object.keys(SAVED_QUERIES)) {
        this.log(`  ${chalk.cyan(name)}`)
      }
      this.log('')
      this.log('Use: ' + chalk.cyan('sm query --saved <name>'))
      return
    }

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    // Determine SQL to run
    let sql: string | undefined

    if (flags.saved) {
      sql = SAVED_QUERIES[flags.saved]
      if (!sql) {
        this.error(`Unknown saved query: ${flags.saved}\nUse --list-saved to see available queries.`)
      }
    } else if (flags.file) {
      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }
      sql = fs.readFileSync(flags.file, 'utf-8')
    } else if (args.sql) {
      sql = args.sql
    } else {
      this.error('Please provide a SQL query, --file, or --saved option')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    try {
      const stmt = db.query(sql)
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT')

      if (isSelect) {
        const results = stmt.all() as Record<string, unknown>[]

        if (flags.json) {
          this.log(JSON.stringify(results, null, 2))
        } else {
          this.outputTable(results)
        }
      } else {
        const result = stmt.run()
        this.log(chalk.green('✓') + ` Query executed. Changes: ${result.changes}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`SQL Error: ${error.message}`)
      }
      throw error
    }
  }

  private outputTable(results: Record<string, unknown>[]): void {
    if (results.length === 0) {
      this.log(chalk.yellow('No results'))
      return
    }

    const columns = Object.keys(results[0])

    // Calculate column widths
    const widths: Record<string, number> = {}
    for (const col of columns) {
      widths[col] = Math.max(
        col.length,
        ...results.map(r => String(r[col] ?? '').slice(0, 50).length)
      )
    }

    // Header
    const header = columns.map(c => c.padEnd(widths[c])).join(' | ')
    this.log('')
    this.log(header)
    this.log(columns.map(c => '─'.repeat(widths[c])).join('─┼─'))

    // Rows
    for (const row of results) {
      const line = columns.map(c => {
        const val = String(row[c] ?? '').slice(0, 50)
        return val.padEnd(widths[c])
      }).join(' | ')
      this.log(line)
    }

    this.log('')
    this.log(`${results.length} row(s)`)
  }
}
