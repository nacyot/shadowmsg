import { Args } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'

export default class SenderRemove extends BaseCommand {
  static description = 'Remove a sender alias'

  static examples = ['<%= config.bin %> sender remove "+1234567890"']

  static args = {
    phone: Args.string({
      description: 'Phone number to remove alias for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SenderRemove)

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

    // Check if alias exists
    const existing = db
      .prepare(`SELECT alias FROM sender_alias WHERE phone_normalized = ?`)
      .get(phone) as { alias: string } | undefined

    if (!existing) {
      this.error(`No alias found for ${phone}`)
    }

    db.prepare(`DELETE FROM sender_alias WHERE phone_normalized = ?`).run(phone)
    this.log(chalk.green('✓') + ` Removed alias for ${phone} (was: ${existing.alias})`)
  }
}
