import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import {
  getDatabase,
  getSourceDbPath,
  isDatabaseInitialized,
} from '../../services/database.js'
import { syncAll } from '../../services/sync.js'
import * as fs from 'node:fs'

export default class Sync extends Command {
  static description = 'Sync messages from macOS Messages app'

  static examples = [
    '<%= config.bin %> sync',
    '<%= config.bin %> sync --full',
    '<%= config.bin %> sync --cleanup',
  ]

  static flags = {
    full: Flags.boolean({
      description: 'Force full resync (rebuilds FTS indexes)',
      default: false,
    }),
    cleanup: Flags.boolean({
      description: 'Clean up orphan records from deleted messages',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Sync)

    // Check if initialized
    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    // Check source database access
    const sourceDbPath = getSourceDbPath()
    if (!fs.existsSync(sourceDbPath)) {
      this.error(
        `Messages database not found at ${sourceDbPath}\n` +
        'Make sure you have Full Disk Access enabled for your terminal.'
      )
    }

    this.log('Syncing messages...')

    const startTime = Date.now()
    const db = getDatabase()

    try {
      const result = await syncAll(db, { cleanup: flags.cleanup })
      const elapsed = Date.now() - startTime

      this.log('')
      this.log(chalk.green('✓') + ' Sync complete!')
      this.log('')
      this.log('  Handles:     ' + chalk.cyan(result.handles.toString().padStart(6)))
      this.log('  Messages:    ' + chalk.cyan(result.messages.toString().padStart(6)))
      this.log('  Attachments: ' + chalk.cyan(result.attachments.toString().padStart(6)))
      this.log('  Contacts:    ' + chalk.cyan(result.contacts.toString().padStart(6)))
      this.log('')
      this.log(`  Time: ${elapsed}ms`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      }
      throw error
    }
  }
}
