import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import {
  getDatabase,
  getSourceDbPath,
  isDatabaseInitialized,
} from '../../services/database.js'
import { syncAll } from '../../services/sync.js'
import * as fs from 'node:fs'

export default class SyncRebuild extends Command {
  static description = 'Rebuild shadow database from scratch (deletes all synced data and re-imports)'

  static examples = [
    '<%= config.bin %> sync rebuild',
    '<%= config.bin %> sync rebuild --yes',
  ]

  static flags = {
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation prompt',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SyncRebuild)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    const sourceDbPath = getSourceDbPath()
    if (!fs.existsSync(sourceDbPath)) {
      this.error(
        `Messages database not found at ${sourceDbPath}\n` +
        'Make sure you have Full Disk Access enabled for your terminal.'
      )
    }

    // Confirmation
    if (!flags.yes) {
      this.log(chalk.yellow('⚠️  This will delete all synced message data and rebuild from scratch.'))
      this.log(chalk.yellow('   User-defined sender aliases will be preserved.'))
      this.log('')
      this.log('Run with ' + chalk.cyan('--yes') + ' to confirm.')
      return
    }

    this.log('Rebuilding shadow database...')
    this.log('')

    const startTime = Date.now()
    const db = getDatabase()

    try {
      // Step 1: Clear existing data
      this.log('  Clearing existing data...')
      db.exec(`
        DELETE FROM message;
        DELETE FROM handle;
        DELETE FROM attachment;
        DELETE FROM message_attachment_join;
        DELETE FROM contact;

        -- Reset sync state
        UPDATE sync_state SET last_rowid = 0, last_sync_at = NULL;

        -- Clear FTS indexes
        DELETE FROM fts_trigram;
        DELETE FROM fts_char;
      `)
      this.log(chalk.green('  ✓') + ' Data cleared')

      // Step 2: Vacuum to reclaim space
      this.log('  Compacting database...')
      db.exec('VACUUM')
      this.log(chalk.green('  ✓') + ' Database compacted')

      // Step 3: Re-sync everything
      this.log('  Syncing messages...')
      const result = await syncAll(db, { cleanup: false })

      const elapsed = Date.now() - startTime

      this.log('')
      this.log(chalk.green('✓') + ' Rebuild complete!')
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
