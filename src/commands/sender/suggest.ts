import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'

export default class SenderSuggest extends BaseCommand {
  static description = 'Suggest phone numbers that could use aliases'

  static examples = [
    '<%= config.bin %> sender suggest',
    '<%= config.bin %> sender suggest --limit 20',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum suggestions',
      default: 10,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SenderSuggest)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    // Find phone numbers with most messages that don't have aliases
    const suggestions = db
      .query(
        `SELECT
          h.id as phone,
          COUNT(*) as message_count,
          MAX(m.text_extracted) as sample_message
        FROM message m
        JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
        LEFT JOIN contact c ON h.id = c.phone_normalized
        WHERE sa.phone_normalized IS NULL
          AND c.phone_normalized IS NULL
          AND m.deleted_at IS NULL
          AND m.is_from_me = 0
        GROUP BY h.id
        ORDER BY message_count DESC
        LIMIT ?`
      )
      .all(flags.limit) as Array<{
      phone: string
      message_count: number
      sample_message: string | null
    }>

    if (flags.json) {
      this.log(JSON.stringify(suggestions, null, 2))
      return
    }

    if (suggestions.length === 0) {
      this.log(chalk.green('✓') + ' All frequent senders have aliases!')
      return
    }

    this.log('')
    this.log(chalk.bold('Suggested senders to add aliases for:'))
    this.log('─'.repeat(60))
    this.log('')

    for (const s of suggestions) {
      const sample = (s.sample_message || '')
        .replace(/\n/g, ' ')
        .slice(0, 40)

      this.log(`${s.phone.padEnd(15)} ${chalk.gray(`(${s.message_count} messages)`)}`)
      if (sample) {
        this.log(`  ${chalk.gray(sample)}...`)
      }
      this.log('')
    }

    this.log('Use ' + chalk.cyan('sm sender add <phone> <alias>') + ' to add an alias.')
  }
}
