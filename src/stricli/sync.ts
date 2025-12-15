// @ts-nocheck
import { buildCommand, buildRouteMap } from '@stricli/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import {
  getDatabase,
  getSourceDbPath,
  isDatabaseInitialized,
  getLastSyncAt,
} from '../services/database.js'
import { syncAll } from '../services/sync.js'

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

const syncIndex = buildCommand({
  docs: {
    brief: 'Sync messages from macOS Messages app',
  },
  async func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const sourceDbPath = getSourceDbPath()
    if (!fs.existsSync(sourceDbPath)) {
      console.error(
        `Messages database not found at ${sourceDbPath}\n` +
        'Make sure you have Full Disk Access enabled for your terminal.'
      )
      process.exit(1)
    }

    console.log('Syncing messages...')

    const startTime = Date.now()
    const db = getDatabase()

    try {
      const result = await syncAll(db, { cleanup: flags.cleanup })
      const elapsed = Date.now() - startTime

      console.log('')
      console.log(chalk.green('✓') + ' Sync complete!')
      console.log('')
      console.log('  Handles:     ' + chalk.cyan(result.handles.toString().padStart(6)))
      console.log('  Messages:    ' + chalk.cyan(result.messages.toString().padStart(6)))
      console.log('  Attachments: ' + chalk.cyan(result.attachments.toString().padStart(6)))
      console.log('  Contacts:    ' + chalk.cyan(result.contacts.toString().padStart(6)))
      console.log('')
      console.log(`  Time: ${elapsed}ms`)
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message)
        process.exit(1)
      }
      throw error
    }
  },
  parameters: {
    flags: {
      full: {
        kind: 'boolean',
        brief: 'Force full resync (rebuilds FTS indexes)',
        default: false,
      },
      cleanup: {
        kind: 'boolean',
        brief: 'Clean up orphan records from deleted messages',
        default: false,
      },
    },
  },
})

const syncStatus = buildCommand({
  docs: {
    brief: 'Show sync status',
  },
  parameters: {},
  func() {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const db = getDatabase()

    const syncStates = db
      .query(`SELECT table_name, last_rowid, last_sync_at FROM sync_state ORDER BY table_name`)
      .all() as Array<{
      table_name: string
      last_rowid: number
      last_sync_at: string | null
    }>

    const counts = {
      messages: (db.query(`SELECT COUNT(*) as count FROM message`).get() as { count: number }).count,
      handles: (db.query(`SELECT COUNT(*) as count FROM handle`).get() as { count: number }).count,
      contacts: (db.query(`SELECT COUNT(*) as count FROM contact`).get() as { count: number }).count,
      aliases: (db.query(`SELECT COUNT(*) as count FROM sender_alias`).get() as { count: number }).count,
    }

    const lastSync = getLastSyncAt()

    console.log('')
    console.log(chalk.bold('Sync Status'))
    console.log('─'.repeat(40))
    console.log('')

    console.log(chalk.bold('Last Sync:'))
    if (lastSync) {
      const ago = formatTimeAgo(lastSync)
      console.log(`  ${lastSync.toLocaleString()} (${ago})`)
    } else {
      console.log(chalk.yellow('  Never synced'))
    }

    console.log('')
    console.log(chalk.bold('Data Counts:'))
    console.log(`  Messages:    ${chalk.cyan(counts.messages.toLocaleString())}`)
    console.log(`  Handles:     ${chalk.cyan(counts.handles.toLocaleString())}`)
    console.log(`  Contacts:    ${chalk.cyan(counts.contacts.toLocaleString())}`)
    console.log(`  Aliases:     ${chalk.cyan(counts.aliases.toLocaleString())}`)

    console.log('')
    console.log(chalk.bold('Sync State:'))
    for (const state of syncStates) {
      console.log(`  ${state.table_name.padEnd(25)} last_rowid: ${state.last_rowid}`)
    }
    console.log('')
  },
})

const syncRebuild = buildCommand({
  docs: {
    brief: 'Rebuild shadow database from scratch',
  },
  async func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const sourceDbPath = getSourceDbPath()
    if (!fs.existsSync(sourceDbPath)) {
      console.error(
        `Messages database not found at ${sourceDbPath}\n` +
        'Make sure you have Full Disk Access enabled for your terminal.'
      )
      process.exit(1)
    }

    if (!flags.yes) {
      console.log(chalk.yellow('⚠️  This will delete all synced message data and rebuild from scratch.'))
      console.log(chalk.yellow('   User-defined sender aliases will be preserved.'))
      console.log('')
      console.log('Run with ' + chalk.cyan('--yes') + ' to confirm.')
      return
    }

    console.log('Rebuilding shadow database...')
    console.log('')

    const startTime = Date.now()
    const db = getDatabase()

    try {
      console.log('  Clearing existing data...')
      db.exec(`
        DELETE FROM message;
        DELETE FROM handle;
        DELETE FROM attachment;
        DELETE FROM message_attachment_join;
        DELETE FROM contact;

        UPDATE sync_state SET last_rowid = 0, last_sync_at = NULL;

        DELETE FROM fts_trigram;
        DELETE FROM fts_char;
      `)
      console.log(chalk.green('  ✓') + ' Data cleared')

      console.log('  Compacting database...')
      db.exec('VACUUM')
      console.log(chalk.green('  ✓') + ' Database compacted')

      console.log('  Syncing messages...')
      const result = await syncAll(db, { cleanup: false })

      const elapsed = Date.now() - startTime

      console.log('')
      console.log(chalk.green('✓') + ' Rebuild complete!')
      console.log('')
      console.log('  Handles:     ' + chalk.cyan(result.handles.toString().padStart(6)))
      console.log('  Messages:    ' + chalk.cyan(result.messages.toString().padStart(6)))
      console.log('  Attachments: ' + chalk.cyan(result.attachments.toString().padStart(6)))
      console.log('  Contacts:    ' + chalk.cyan(result.contacts.toString().padStart(6)))
      console.log('')
      console.log(`  Time: ${elapsed}ms`)
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message)
        process.exit(1)
      }
      throw error
    }
  },
  parameters: {
    flags: {
      yes: {
        kind: 'boolean',
        brief: 'Skip confirmation prompt',
        default: false,
      },
    },
  },
})

export const syncCommands = buildRouteMap({
  routes: {
    run: syncIndex,
    status: syncStatus,
    rebuild: syncRebuild,
  },
  docs: {
    brief: 'Sync messages from Messages.app',
  },
})
