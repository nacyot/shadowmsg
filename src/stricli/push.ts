// @ts-nocheck
import { buildCommand } from '@stricli/core'
import chalk from 'chalk'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'
import { pushMessages, getPushState, resetPushState, countPendingMessages } from '../services/push.js'
import { autoSyncIfNeeded } from '../utils/auto-sync.js'

export const pushCommand = buildCommand({
  docs: {
    brief: 'Push messages to a remote API endpoint',
  },
  async func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const url = flags.url || process.env.SHADOWMSG_PUSH_URL
    const apiKey = flags['api-key'] || process.env.SHADOWMSG_PUSH_API_KEY
    const host = flags.host || process.env.SHADOWMSG_PUSH_HOST || undefined

    if (!url) {
      console.error('Missing endpoint URL. Use ' + chalk.cyan('--url') + ' or set ' + chalk.cyan('SHADOWMSG_PUSH_URL'))
      process.exit(1)
    }

    if (!apiKey) {
      console.error('Missing API key. Use ' + chalk.cyan('--api-key') + ' or set ' + chalk.cyan('SHADOWMSG_PUSH_API_KEY'))
      process.exit(1)
    }

    const db = getDatabase()

    if (flags.full) {
      resetPushState(db, url)
    }

    const state = getPushState(db, url)
    const pending = countPendingMessages(db, state.last_pushed_rowid)

    if (pending === 0) {
      console.log(chalk.green('✓') + ' No new messages to push')
      return
    }

    if (flags['dry-run']) {
      console.log(`${pending} messages pending (from ROWID > ${state.last_pushed_rowid})`)
      return
    }

    console.log(`Pushing messages to ${chalk.cyan(url)}`)
    console.log('')

    try {
      const result = await pushMessages(db, {
        endpoint: url,
        apiKey,
        batchSize: flags['batch-size'],
        dryRun: false,
        host,
      }, {
        onBatch(batch, sent, imported, skipped) {
          const sentStr = sent.toString().padStart(4)
          console.log(`  Batch ${batch}: ${sentStr} messages → ${imported} imported, ${skipped} skipped`)
        },
      })

      console.log('')
      console.log(chalk.green('✓') + ' Push complete!')
      console.log(`  Total: ${result.total.toLocaleString()} messages (${result.imported.toLocaleString()} imported, ${result.skipped.toLocaleString()} skipped)`)
      console.log(`  Last ROWID: ${result.lastRowid}`)
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red('Push failed:') + ' ' + error.message)
        process.exit(1)
      }
      throw error
    }
  },
  parameters: {
    flags: {
      url: {
        kind: 'parsed',
        parse: String,
        brief: 'API endpoint URL (or SHADOWMSG_PUSH_URL env)',
        optional: true,
      },
      'api-key': {
        kind: 'parsed',
        parse: String,
        brief: 'API key (or SHADOWMSG_PUSH_API_KEY env)',
        optional: true,
      },
      'batch-size': {
        kind: 'parsed',
        parse: Number,
        brief: 'Batch size (default: 500)',
        default: 500,
      },
      full: {
        kind: 'boolean',
        brief: 'Resend all messages (reset watermark)',
        default: false,
      },
      'dry-run': {
        kind: 'boolean',
        brief: 'Show pending count without sending',
        default: false,
      },
      host: {
        kind: 'parsed',
        parse: String,
        brief: 'Host header for reverse proxy (or SHADOWMSG_PUSH_HOST env)',
        optional: true,
      },
      'no-sync': {
        kind: 'boolean',
        brief: 'Skip auto-sync before push',
        default: false,
      },
    },
  },
})
