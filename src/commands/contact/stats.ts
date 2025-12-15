import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'

export default class ContactStats extends BaseCommand {
  static description = 'Show message statistics by contact'

  static examples = [
    '<%= config.bin %> contact stats',
    '<%= config.bin %> contact stats --top 20',
    '<%= config.bin %> contact stats --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    top: Flags.integer({
      description: 'Show top N contacts',
      default: 10,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ContactStats)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const stats = db.query(`
      SELECT
        COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), c.organization, h.id) as sender,
        h.id as phone,
        COUNT(*) as total,
        SUM(CASE WHEN m.is_from_me = 0 THEN 1 ELSE 0 END) as received,
        SUM(CASE WHEN m.is_from_me = 1 THEN 1 ELSE 0 END) as sent
      FROM message m
      JOIN handle h ON m.handle_id = h.ROWID
      LEFT JOIN contact c ON h.id = c.phone_normalized
      LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
      WHERE m.deleted_at IS NULL
      GROUP BY h.id
      ORDER BY total DESC
      LIMIT ?
    `).all(flags.top) as Array<{
      sender: string
      phone: string
      total: number
      received: number
      sent: number
    }>

    if (flags.json) {
      this.log(JSON.stringify(stats, null, 2))
      return
    }

    if (stats.length === 0) {
      this.log(chalk.yellow('No message statistics available'))
      return
    }

    this.log('')
    this.log(chalk.bold(`Top ${flags.top} contacts by message count`))
    this.log('─'.repeat(70))
    this.log('')
    this.log('  ' + 'Sender'.padEnd(20) + 'Total'.padStart(8) + 'Recv'.padStart(8) + 'Sent'.padStart(8))
    this.log('  ' + '─'.repeat(20) + '─'.repeat(8) + '─'.repeat(8) + '─'.repeat(8))

    for (const s of stats) {
      const sender = (s.sender || s.phone).slice(0, 18).padEnd(20)
      this.log(
        `  ${sender}${s.total.toString().padStart(8)}${s.received.toString().padStart(8)}${s.sent.toString().padStart(8)}`
      )
    }

    this.log('')
  }
}
