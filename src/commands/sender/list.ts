import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'

export default class SenderList extends BaseCommand {
  static description = 'List sender aliases'

  static examples = [
    '<%= config.bin %> sender list',
    '<%= config.bin %> sender list --json',
  ]

  static flags = {
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SenderList)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    const db = getDatabase()

    const aliases = db
      .prepare(
        `SELECT phone_normalized, alias, created_at FROM sender_alias ORDER BY created_at DESC`
      )
      .all() as Array<{
      phone_normalized: string
      alias: string
      created_at: string
    }>

    if (flags.json) {
      this.log(JSON.stringify(aliases, null, 2))
      return
    }

    if (aliases.length === 0) {
      this.log(chalk.yellow('No aliases registered'))
      this.log('')
      this.log('Use ' + chalk.cyan('sm sender add <phone> <alias>') + ' to add one.')
      return
    }

    this.log('')
    this.log(chalk.bold('Sender Aliases'))
    this.log('─'.repeat(50))

    for (const alias of aliases) {
      this.log(`  ${alias.phone_normalized.padEnd(15)} → ${alias.alias}`)
    }

    this.log('')
    this.log(`Total: ${aliases.length} alias(es)`)
  }
}
