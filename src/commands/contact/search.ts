import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'

export default class ContactSearch extends BaseCommand {
  static description = 'Search contacts by name or organization'

  static examples = [
    '<%= config.bin %> contact search "John"',
    '<%= config.bin %> contact search "company" --json',
  ]

  static args = {
    query: Args.string({
      description: 'Search query (name or organization)',
      required: true,
    }),
  }

  static flags = {
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ContactSearch)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    const db = getDatabase()

    const contacts = db.query(`
      SELECT
        c.phone_normalized,
        c.name,
        c.organization,
        COUNT(m.ROWID) as message_count
      FROM contact c
      LEFT JOIN handle h ON c.phone_normalized = h.id
      LEFT JOIN message m ON h.ROWID = m.handle_id AND m.deleted_at IS NULL
      WHERE c.name LIKE ? OR c.organization LIKE ?
      GROUP BY c.phone_normalized
      ORDER BY message_count DESC
    `).all(`%${args.query}%`, `%${args.query}%`) as Array<{
      phone_normalized: string
      name: string
      organization: string | null
      message_count: number
    }>

    if (flags.json) {
      this.log(JSON.stringify(contacts, null, 2))
      return
    }

    if (contacts.length === 0) {
      this.log(chalk.yellow(`No contacts found matching "${args.query}"`))
      return
    }

    this.log('')
    this.log(chalk.bold(`Contacts matching "${args.query}"`))
    this.log('─'.repeat(60))

    for (const c of contacts) {
      const name = c.name.trim() || c.organization || '(unnamed)'
      const org = c.organization && c.name.trim() ? chalk.gray(` (${c.organization})`) : ''

      this.log(`  ${c.phone_normalized.padEnd(15)} ${name}${org} ${chalk.cyan(`[${c.message_count}]`)}`)
    }

    this.log('')
    this.log(`Found: ${contacts.length} contact(s)`)
  }
}
