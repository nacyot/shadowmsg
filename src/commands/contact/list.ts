import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'

export default class ContactList extends BaseCommand {
  static description = 'List contacts synced from AddressBook'

  static examples = [
    '<%= config.bin %> contact list',
    '<%= config.bin %> contact list --with-count',
    '<%= config.bin %> contact list --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'with-count': Flags.boolean({
      description: 'Include message count for each contact',
      default: false,
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum results',
      default: 50,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ContactList)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    const db = getDatabase()

    let sql: string
    if (flags['with-count']) {
      sql = `
        SELECT
          c.phone_normalized,
          c.name,
          c.organization,
          COUNT(m.ROWID) as message_count
        FROM contact c
        LEFT JOIN handle h ON c.phone_normalized = h.id
        LEFT JOIN message m ON h.ROWID = m.handle_id AND m.deleted_at IS NULL
        GROUP BY c.phone_normalized
        ORDER BY message_count DESC, c.name
        LIMIT ?
      `
    } else {
      sql = `
        SELECT phone_normalized, name, organization
        FROM contact
        ORDER BY name
        LIMIT ?
      `
    }

    const contacts = db.prepare(sql).all(flags.limit) as Array<{
      phone_normalized: string
      name: string
      organization: string | null
      message_count?: number
    }>

    if (flags.json) {
      this.log(JSON.stringify(contacts, null, 2))
      return
    }

    if (contacts.length === 0) {
      this.log(chalk.yellow('No contacts synced'))
      this.log('')
      this.log('Run ' + chalk.cyan('sm sync') + ' to sync contacts from AddressBook.')
      return
    }

    this.log('')
    this.log(chalk.bold('Contacts'))
    this.log('─'.repeat(60))

    for (const c of contacts) {
      const name = c.name.trim() || c.organization || '(unnamed)'
      const org = c.organization && c.name.trim() ? chalk.gray(` (${c.organization})`) : ''
      const count = flags['with-count'] ? chalk.cyan(` [${c.message_count}]`) : ''

      this.log(`  ${c.phone_normalized.padEnd(15)} ${name}${org}${count}`)
    }

    this.log('')
    this.log(`Total: ${contacts.length} contact(s)`)
  }
}
