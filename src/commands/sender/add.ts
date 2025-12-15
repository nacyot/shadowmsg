import { Args } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'

export default class SenderAdd extends BaseCommand {
  static description = 'Add a sender alias'

  static examples = [
    '<%= config.bin %> sender add "+1234567890" "Amazon"',
    '<%= config.bin %> sender add "+0987654321" "Bank"',
  ]

  static args = {
    phone: Args.string({
      description: 'Phone number (normalized format: +82...)',
      required: true,
    }),
    alias: Args.string({
      description: 'Alias name to display',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SenderAdd)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    const db = getDatabase()

    // Normalize phone number
    let phone = args.phone.replace(/[^\d+]/g, '')
    if (phone.startsWith('0')) {
      phone = '+82' + phone.slice(1)
    }
    if (!phone.startsWith('+')) {
      phone = '+' + phone
    }

    // Check if alias already exists
    const existing = db
      .query(`SELECT alias FROM sender_alias WHERE phone_normalized = ?`)
      .get(phone) as { alias: string } | undefined

    if (existing) {
      db.query(
        `UPDATE sender_alias SET alias = ? WHERE phone_normalized = ?`
      ).run(args.alias, phone)
      this.log(chalk.green('✓') + ` Updated alias: ${phone} → ${args.alias}`)
    } else {
      db.query(
        `INSERT INTO sender_alias (phone_normalized, alias) VALUES (?, ?)`
      ).run(phone, args.alias)
      this.log(chalk.green('✓') + ` Added alias: ${phone} → ${args.alias}`)
    }
  }
}
