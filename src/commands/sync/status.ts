import { Command } from '@oclif/core'
import chalk from 'chalk'
import {
  getDatabase,
  getLastSyncAt,
  isDatabaseInitialized,
} from '../../services/database.js'

export default class SyncStatus extends Command {
  static description = 'Show sync status'

  static examples = ['<%= config.bin %> sync status']

  async run(): Promise<void> {
    if (!isDatabaseInitialized()) {
      this.error(
        'Database not initialized. Run ' + chalk.cyan('sm init') + ' first.'
      )
    }

    const db = getDatabase()

    // Get sync state
    const syncStates = db
      .query(
        `SELECT table_name, last_rowid, last_sync_at FROM sync_state ORDER BY table_name`
      )
      .all() as Array<{
      table_name: string
      last_rowid: number
      last_sync_at: string | null
    }>

    // Get counts
    const counts = {
      messages: (
        db.query(`SELECT COUNT(*) as count FROM message`).get() as {
          count: number
        }
      ).count,
      handles: (
        db.query(`SELECT COUNT(*) as count FROM handle`).get() as {
          count: number
        }
      ).count,
      contacts: (
        db.query(`SELECT COUNT(*) as count FROM contact`).get() as {
          count: number
        }
      ).count,
      aliases: (
        db.query(`SELECT COUNT(*) as count FROM sender_alias`).get() as {
          count: number
        }
      ).count,
    }

    const lastSync = getLastSyncAt()

    this.log('')
    this.log(chalk.bold('Sync Status'))
    this.log('─'.repeat(40))
    this.log('')

    this.log(chalk.bold('Last Sync:'))
    if (lastSync) {
      const ago = formatTimeAgo(lastSync)
      this.log(`  ${lastSync.toLocaleString()} (${ago})`)
    } else {
      this.log(chalk.yellow('  Never synced'))
    }

    this.log('')
    this.log(chalk.bold('Data Counts:'))
    this.log(`  Messages:    ${chalk.cyan(counts.messages.toLocaleString())}`)
    this.log(`  Handles:     ${chalk.cyan(counts.handles.toLocaleString())}`)
    this.log(`  Contacts:    ${chalk.cyan(counts.contacts.toLocaleString())}`)
    this.log(`  Aliases:     ${chalk.cyan(counts.aliases.toLocaleString())}`)

    this.log('')
    this.log(chalk.bold('Sync State:'))
    for (const state of syncStates) {
      this.log(
        `  ${state.table_name.padEnd(25)} last_rowid: ${state.last_rowid}`
      )
    }
    this.log('')
  }
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}
