import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../base-command.js'
import { getDatabase, isDatabaseInitialized, getLastSyncAt, getShadowDbPath } from '../services/database.js'
import * as fs from 'node:fs'

export default class Stats extends BaseCommand {
  static description = 'Show message statistics'

  static examples = [
    '<%= config.bin %> stats',
    '<%= config.bin %> stats --yearly',
    '<%= config.bin %> stats --monthly --year 2024',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    yearly: Flags.boolean({
      description: 'Show yearly statistics',
      default: false,
    }),
    monthly: Flags.boolean({
      description: 'Show monthly statistics',
      default: false,
    }),
    year: Flags.integer({
      description: 'Filter by year (for monthly stats)',
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Stats)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    if (flags.yearly) {
      this.showYearlyStats(db, flags.json)
    } else if (flags.monthly) {
      this.showMonthlyStats(db, flags.year, flags.json)
    } else {
      this.showOverallStats(db, flags.json)
    }
  }

  private showOverallStats(db: ReturnType<typeof getDatabase>, json: boolean): void {
    const totalMessages = (db.query(`SELECT COUNT(*) as count FROM message WHERE deleted_at IS NULL`).get() as { count: number }).count
    const totalHandles = (db.query(`SELECT COUNT(*) as count FROM handle`).get() as { count: number }).count
    const totalContacts = (db.query(`SELECT COUNT(*) as count FROM contact`).get() as { count: number }).count
    const totalAliases = (db.query(`SELECT COUNT(*) as count FROM sender_alias`).get() as { count: number }).count

    const received = (db.query(`SELECT COUNT(*) as count FROM message WHERE is_from_me = 0 AND deleted_at IS NULL`).get() as { count: number }).count
    const sent = (db.query(`SELECT COUNT(*) as count FROM message WHERE is_from_me = 1 AND deleted_at IS NULL`).get() as { count: number }).count

    const dateRange = db.query(`
      SELECT
        MIN(date) as min_date,
        MAX(date) as max_date
      FROM message WHERE deleted_at IS NULL
    `).get() as { min_date: number; max_date: number }

    const lastSync = getLastSyncAt()
    const dbPath = getShadowDbPath()
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0

    const stats = {
      messages: {
        total: totalMessages,
        received,
        sent,
      },
      handles: totalHandles,
      contacts: totalContacts,
      aliases: totalAliases,
      dateRange: {
        from: dateRange.min_date ? this.formatMacDate(dateRange.min_date) : null,
        to: dateRange.max_date ? this.formatMacDate(dateRange.max_date) : null,
      },
      lastSync: lastSync?.toISOString() || null,
      dbSizeBytes: dbSize,
    }

    if (json) {
      this.log(JSON.stringify(stats, null, 2))
      return
    }

    this.log('')
    this.log(chalk.bold('ShadowMSG Statistics'))
    this.log('─'.repeat(40))
    this.log('')
    this.log(chalk.bold('Messages:'))
    this.log(`  Total:     ${chalk.cyan(totalMessages.toLocaleString())}`)
    this.log(`  Received:  ${chalk.cyan(received.toLocaleString())}`)
    this.log(`  Sent:      ${chalk.cyan(sent.toLocaleString())}`)
    this.log('')
    this.log(chalk.bold('Data:'))
    this.log(`  Handles:   ${chalk.cyan(totalHandles.toLocaleString())}`)
    this.log(`  Contacts:  ${chalk.cyan(totalContacts.toLocaleString())}`)
    this.log(`  Aliases:   ${chalk.cyan(totalAliases.toLocaleString())}`)
    this.log('')
    this.log(chalk.bold('Date Range:'))
    this.log(`  From: ${stats.dateRange.from || 'N/A'}`)
    this.log(`  To:   ${stats.dateRange.to || 'N/A'}`)
    this.log('')
    this.log(chalk.bold('Database:'))
    this.log(`  Size:      ${this.formatBytes(dbSize)}`)
    this.log(`  Last Sync: ${lastSync ? lastSync.toLocaleString() : 'Never'}`)
    this.log('')
  }

  private showYearlyStats(db: ReturnType<typeof getDatabase>, json: boolean): void {
    const stats = db.query(`
      SELECT
        strftime('%Y', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') AS year,
        COUNT(*) AS total,
        SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) AS received,
        SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) AS sent
      FROM message
      WHERE deleted_at IS NULL
      GROUP BY year
      ORDER BY year
    `).all() as Array<{ year: string; total: number; received: number; sent: number }>

    if (json) {
      this.log(JSON.stringify(stats, null, 2))
      return
    }

    this.log('')
    this.log(chalk.bold('Yearly Statistics'))
    this.log('─'.repeat(50))
    this.log('')
    this.log('  ' + 'Year'.padEnd(6) + 'Total'.padStart(10) + 'Received'.padStart(10) + 'Sent'.padStart(10))
    this.log('  ' + '─'.repeat(6) + '─'.repeat(10) + '─'.repeat(10) + '─'.repeat(10))

    for (const s of stats) {
      this.log(
        `  ${s.year.padEnd(6)}${s.total.toLocaleString().padStart(10)}${s.received.toLocaleString().padStart(10)}${s.sent.toLocaleString().padStart(10)}`
      )
    }
    this.log('')
  }

  private showMonthlyStats(db: ReturnType<typeof getDatabase>, year: number | undefined, json: boolean): void {
    let sql = `
      SELECT
        strftime('%Y-%m', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') AS month,
        COUNT(*) AS total,
        SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) AS received,
        SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) AS sent
      FROM message
      WHERE deleted_at IS NULL
    `

    const params: string[] = []
    if (year) {
      sql += ` AND strftime('%Y', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') = ?`
      params.push(String(year))
    }

    sql += ` GROUP BY month ORDER BY month DESC LIMIT 24`

    const stats = db.query(sql).all(...params) as Array<{ month: string; total: number; received: number; sent: number }>

    if (json) {
      this.log(JSON.stringify(stats, null, 2))
      return
    }

    this.log('')
    this.log(chalk.bold(year ? `Monthly Statistics (${year})` : 'Monthly Statistics (last 24 months)'))
    this.log('─'.repeat(55))
    this.log('')
    this.log('  ' + 'Month'.padEnd(10) + 'Total'.padStart(10) + 'Received'.padStart(10) + 'Sent'.padStart(10))
    this.log('  ' + '─'.repeat(10) + '─'.repeat(10) + '─'.repeat(10) + '─'.repeat(10))

    for (const s of stats) {
      this.log(
        `  ${s.month.padEnd(10)}${s.total.toLocaleString().padStart(10)}${s.received.toLocaleString().padStart(10)}${s.sent.toLocaleString().padStart(10)}`
      )
    }
    this.log('')
  }

  private formatMacDate(nanoseconds: number): string {
    const MACOS_EPOCH = new Date('2001-01-01T00:00:00Z').getTime()
    const milliseconds = Math.floor(nanoseconds / 1_000_000)
    const date = new Date(MACOS_EPOCH + milliseconds)
    return date.toLocaleDateString('ko-KR')
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }
}
