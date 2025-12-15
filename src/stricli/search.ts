// @ts-nocheck
import { buildCommand } from '@stricli/core'
import chalk from 'chalk'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'
import { searchMessages, SearchResult } from '../services/search.js'
import { fromMacOSDate, formatDate, formatDateShort } from '../utils/date-formatter.js'
import { cleanText } from '../utils/text-cleaner.js'
import { autoSyncIfNeeded } from '../utils/auto-sync.js'

function outputJson(result: SearchResult): void {
  const output = {
    total: result.total,
    showing: result.messages.length,
    limit: result.limit,
    messages: result.messages.map((r) => ({
      rowid: r.rowid,
      sent_at: fromMacOSDate(r.date).toISOString(),
      sender: r.sender_name,
      phone: r.sender_phone,
      service: r.service || 'SMS',
      content: cleanText(r.text_extracted),
      is_from_me: r.is_from_me === 1,
    })),
  }
  console.log(JSON.stringify(output, null, 2))
}

function outputShort(result: SearchResult): void {
  const { messages, total, limit } = result

  if (messages.length === 0) {
    console.log(chalk.yellow('No messages found'))
    return
  }

  if (total > messages.length) {
    console.log(chalk.gray(`Showing ${messages.length} of ${total} results (limit: ${limit})`))
  } else {
    console.log(chalk.gray(`Found ${total} results`))
  }
  console.log('')

  for (const r of messages) {
    const date = formatDateShort(fromMacOSDate(r.date))
    const sender = (r.sender_name || r.sender_phone || 'Unknown').slice(0, 12).padEnd(12)
    const cleaned = cleanText(r.text_extracted) || ''
    const content = cleaned.replace(/\n/g, ' ').slice(0, 50)

    console.log(`#${r.rowid}  ${date}  ${sender}  ${content}...`)
  }
}

function outputFull(result: SearchResult): void {
  const { messages, total, limit } = result

  if (messages.length === 0) {
    console.log(chalk.yellow('No messages found'))
    return
  }

  if (total > messages.length) {
    console.log(`Found ${chalk.cyan(total.toString())} messages, showing ${chalk.cyan(messages.length.toString())} (use ${chalk.gray('--limit')} to see more)`)
  } else {
    console.log(`Found ${chalk.cyan(total.toString())} messages`)
  }
  console.log('')

  for (let i = 0; i < messages.length; i++) {
    const r = messages[i]
    const date = formatDate(fromMacOSDate(r.date))
    const sender = r.sender_name || r.sender_phone || 'Unknown'
    const service = r.service || 'SMS'
    const content = cleanText(r.text_extracted)

    console.log(chalk.blue('┌─') + chalk.gray(` #${r.rowid} · ${date} · ${sender} · ${service}`))

    if (content) {
      const lines = content.split('\n')
      for (const line of lines) {
        console.log(chalk.blue('│ ') + line)
      }
    } else {
      console.log(chalk.blue('│ ') + chalk.gray('(no content)'))
    }

    console.log(chalk.blue('└─'))

    if (i < messages.length - 1) {
      console.log('')
    }
  }
}

export const searchCommand = buildCommand({
  docs: {
    brief: 'Search messages',
  },
  async func(flags, query: string) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const result = searchMessages(db, query, {
      from: flags.from,
      after: flags.after ? new Date(flags.after) : undefined,
      before: flags.before ? new Date(flags.before) : undefined,
      limit: flags.limit,
    })

    if (flags.json) {
      outputJson(result)
    } else if (flags.short) {
      outputShort(result)
    } else {
      outputFull(result)
    }
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Search keyword (space-separated terms are ANDed)',
          parse: String,
          placeholder: 'query',
        },
      ],
    },
    flags: {
      from: {
        kind: 'parsed',
        brief: 'Filter by sender (phone or alias)',
        parse: String,
        optional: true,
      },
      after: {
        kind: 'parsed',
        brief: 'Filter messages after date (ISO 8601)',
        parse: String,
        optional: true,
      },
      before: {
        kind: 'parsed',
        brief: 'Filter messages before date (ISO 8601)',
        parse: String,
        optional: true,
      },
      limit: {
        kind: 'parsed',
        brief: 'Maximum results',
        parse: Number,
        default: 20,
      },
      json: {
        kind: 'boolean',
        brief: 'Output as JSON',
        default: false,
      },
      short: {
        kind: 'boolean',
        brief: 'One-line summary format',
        default: false,
      },
      'no-sync': {
        kind: 'boolean',
        brief: 'Skip auto-sync before command execution',
        default: false,
      },
    },
  },
})
