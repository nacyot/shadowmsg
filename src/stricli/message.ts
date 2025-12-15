// @ts-nocheck
import { buildCommand, buildRouteMap } from '@stricli/core'
import chalk from 'chalk'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'
import { fromMacOSDate, formatDate, formatDateShort, daysAgo, startOfDay, endOfDay, toMacOSDate } from '../utils/date-formatter.js'
import { cleanText } from '../utils/text-cleaner.js'
import { autoSyncIfNeeded } from '../utils/auto-sync.js'

const messageList = buildCommand({
  docs: {
    brief: 'List and browse messages',
  },
  async func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    let sql = `
      SELECT
        m.ROWID as rowid,
        m.guid,
        m.handle_id,
        m.date,
        m.is_from_me,
        m.text_extracted,
        m.cache_has_attachments,
        h.id as sender_phone,
        COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), c.organization, h.id) as sender_name,
        h.service
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      LEFT JOIN contact c ON h.id = c.phone_normalized
      LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
      WHERE m.deleted_at IS NULL
    `

    const params: (string | number)[] = []

    if (flags.before) {
      sql += ` AND m.ROWID < ?`
      params.push(flags.before)
    }
    if (flags.after) {
      sql += ` AND m.ROWID > ?`
      params.push(flags.after)
    }

    if (flags.date) {
      const date = new Date(flags.date)
      sql += ` AND m.date >= ? AND m.date <= ?`
      params.push(toMacOSDate(startOfDay(date)), toMacOSDate(endOfDay(date)))
    }
    if (flags.since) {
      sql += ` AND m.date >= ?`
      params.push(toMacOSDate(startOfDay(new Date(flags.since))))
    }
    if (flags.until) {
      sql += ` AND m.date <= ?`
      params.push(toMacOSDate(endOfDay(new Date(flags.until))))
    }
    if (flags.days) {
      sql += ` AND m.date >= ?`
      params.push(toMacOSDate(daysAgo(flags.days)))
    }

    if (flags.from) {
      sql += ` AND (h.id LIKE ? OR sa.alias LIKE ? OR c.name LIKE ?)`
      const fromPattern = `%${flags.from}%`
      params.push(fromPattern, fromPattern, fromPattern)
    }

    if (flags.sent) {
      sql += ` AND m.is_from_me = 1`
    }

    if (flags.after) {
      sql += ` ORDER BY m.date ASC`
    } else {
      sql += ` ORDER BY m.date DESC`
    }

    sql += ` LIMIT ? OFFSET ?`
    params.push(flags.limit, flags.offset)

    const results = db.query(sql).all(...params) as Array<{
      rowid: number
      date: number
      is_from_me: number
      text_extracted: string | null
      sender_phone: string | null
      sender_name: string | null
      service: string | null
    }>

    if (flags.after) {
      results.reverse()
    }

    if (flags.json) {
      const output = results.map((r) => ({
        rowid: r.rowid,
        sent_at: fromMacOSDate(r.date).toISOString(),
        sender: r.sender_name,
        phone: r.sender_phone,
        service: r.service || 'SMS',
        content: cleanText(r.text_extracted),
        is_from_me: r.is_from_me === 1,
      }))
      console.log(JSON.stringify(output, null, 2))
      return
    }

    if (flags.short) {
      if (results.length === 0) {
        console.log(chalk.yellow('No messages found'))
        return
      }

      for (const r of results) {
        const date = formatDateShort(fromMacOSDate(r.date))
        const sender = ((r.sender_name || r.sender_phone || 'Unknown') as string).slice(0, 12).padEnd(12)
        const cleaned = cleanText(r.text_extracted) || ''
        const content = cleaned.replace(/\n/g, ' ').slice(0, 50)

        console.log(`#${r.rowid}  ${date}  ${sender}  ${content}...`)
      }
      return
    }

    if (results.length === 0) {
      console.log(chalk.yellow('No messages found'))
      return
    }

    console.log(`Found ${chalk.cyan(results.length.toString())} messages:`)
    console.log('')

    for (const r of results) {
      const date = formatDate(fromMacOSDate(r.date))
      const sender = (r.sender_name || r.sender_phone || 'Unknown') as string
      const service = (r.service || 'SMS') as string
      const content = cleanText(r.text_extracted)

      console.log(`#${r.rowid} · ${date} · ${sender} · ${service}`)
      console.log('─'.repeat(60))

      if (content) {
        console.log(content)
      } else {
        console.log(chalk.gray('(no content)'))
      }

      console.log('')
    }
  },
  parameters: {
    flags: {
      limit: {
        kind: 'parsed',
        brief: 'Maximum results',
        parse: Number,
        default: 20,
      },
      offset: {
        kind: 'parsed',
        brief: 'Skip first N results',
        parse: Number,
        default: 0,
      },
      before: {
        kind: 'parsed',
        brief: 'Show messages before this ROWID',
        parse: Number,
        optional: true,
      },
      after: {
        kind: 'parsed',
        brief: 'Show messages after this ROWID',
        parse: Number,
        optional: true,
      },
      date: {
        kind: 'parsed',
        brief: 'Show messages from specific date (YYYY-MM-DD)',
        parse: String,
        optional: true,
      },
      since: {
        kind: 'parsed',
        brief: 'Show messages since date (YYYY-MM-DD)',
        parse: String,
        optional: true,
      },
      until: {
        kind: 'parsed',
        brief: 'Show messages until date (YYYY-MM-DD)',
        parse: String,
        optional: true,
      },
      days: {
        kind: 'parsed',
        brief: 'Show messages from last N days',
        parse: Number,
        optional: true,
      },
      from: {
        kind: 'parsed',
        brief: 'Filter by sender (phone, alias, or contact name)',
        parse: String,
        optional: true,
      },
      sent: {
        kind: 'boolean',
        brief: 'Show only messages sent by me',
        default: false,
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

const messageGet = buildCommand({
  docs: {
    brief: 'Get a specific message by ROWID',
  },
  async func(flags, rowid: number) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const message = db.query(`
      SELECT
        m.ROWID as rowid,
        m.guid,
        m.handle_id,
        m.date,
        m.is_from_me,
        m.text_extracted,
        m.cache_has_attachments,
        h.id as sender_phone,
        COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), c.organization, h.id) as sender_name,
        h.service
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      LEFT JOIN contact c ON h.id = c.phone_normalized
      LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
      WHERE m.ROWID = ?
    `).get(rowid) as {
      rowid: number
      date: number
      is_from_me: number
      text_extracted: string | null
      cache_has_attachments: number
      sender_phone: string | null
      sender_name: string | null
      service: string | null
    } | undefined

    if (!message) {
      console.error(`Message #${rowid} not found`)
      process.exit(1)
    }

    const content = cleanText(message.text_extracted)

    if (flags.json) {
      const output = {
        rowid: message.rowid,
        sent_at: fromMacOSDate(message.date).toISOString(),
        sender: message.sender_name,
        phone: message.sender_phone,
        service: message.service || 'SMS',
        content,
        is_from_me: message.is_from_me === 1,
        has_attachments: message.cache_has_attachments === 1,
      }
      console.log(JSON.stringify(output, null, 2))
      return
    }

    const date = formatDate(fromMacOSDate(message.date))
    const sender = message.sender_name || message.sender_phone || 'Unknown'
    const phone = message.sender_phone || ''
    const service = message.service || 'SMS'

    console.log('')
    console.log(`Message #${message.rowid}`)
    console.log('─'.repeat(40))
    console.log(`  Date:    ${date}`)
    console.log(`  From:    ${sender}${phone && sender !== phone ? ` (${phone})` : ''}`)
    console.log(`  Service: ${service}`)
    if (message.cache_has_attachments) {
      console.log(`  Attachments: Yes`)
    }
    console.log('')

    if (content) {
      console.log(content)
    } else {
      console.log(chalk.gray('(no content)'))
    }

    console.log('')
    console.log('─'.repeat(40))
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Message ROWID',
          parse: Number,
          placeholder: 'rowid',
        },
      ],
    },
    flags: {
      json: {
        kind: 'boolean',
        brief: 'Output as JSON',
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

const messageContext = buildCommand({
  docs: {
    brief: 'Show messages around a specific message (conversation context)',
  },
  async func(flags, rowid: number) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const target = db.query(`
      SELECT handle_id, date FROM message WHERE ROWID = ?
    `).get(rowid) as { handle_id: number; date: number } | undefined

    if (!target) {
      console.error(`Message #${rowid} not found`)
      process.exit(1)
    }

    const messages = db.query(`
      SELECT
        m.ROWID as rowid,
        m.date,
        m.is_from_me,
        m.text_extracted,
        h.id as sender_phone,
        COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), c.organization, h.id) as sender_name,
        h.service
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      LEFT JOIN contact c ON h.id = c.phone_normalized
      LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
      WHERE m.handle_id = ?
        AND m.deleted_at IS NULL
        AND m.date BETWEEN
          (SELECT date FROM message WHERE ROWID = ?) - 86400000000000 * 7
          AND
          (SELECT date FROM message WHERE ROWID = ?) + 86400000000000 * 7
      ORDER BY m.date ASC
    `).all(target.handle_id, rowid, rowid) as Array<{
      rowid: number
      date: number
      is_from_me: number
      text_extracted: string | null
      sender_phone: string | null
      sender_name: string | null
      service: string | null
    }>

    const targetIndex = messages.findIndex(m => m.rowid === rowid)
    if (targetIndex === -1) {
      console.error(`Message #${rowid} not found in context`)
      process.exit(1)
    }

    const start = Math.max(0, targetIndex - flags.range)
    const end = Math.min(messages.length, targetIndex + flags.range + 1)
    const contextMessages = messages.slice(start, end)

    if (flags.json) {
      const output = contextMessages.map(m => ({
        rowid: m.rowid,
        sent_at: fromMacOSDate(m.date).toISOString(),
        sender: m.sender_name,
        phone: m.sender_phone,
        service: m.service || 'SMS',
        content: cleanText(m.text_extracted),
        is_from_me: m.is_from_me === 1,
        is_target: m.rowid === rowid,
      }))
      console.log(JSON.stringify(output, null, 2))
      return
    }

    console.log('')
    console.log(chalk.bold(`Conversation context around #${rowid}`))
    console.log('─'.repeat(60))
    console.log('')

    for (const m of contextMessages) {
      const date = formatDate(fromMacOSDate(m.date))
      const sender = m.is_from_me ? chalk.blue('Me') : (m.sender_name || m.sender_phone || 'Unknown')
      const isTarget = m.rowid === rowid
      const content = cleanText(m.text_extracted)

      if (isTarget) {
        console.log(chalk.yellow(`>>> #${m.rowid} · ${date} · ${sender}`))
        console.log(chalk.yellow('─'.repeat(60)))
      } else {
        console.log(`#${m.rowid} · ${date} · ${sender}`)
        console.log('─'.repeat(60))
      }

      if (content) {
        const displayContent = isTarget ? chalk.yellow(content) : content
        console.log(displayContent)
      } else {
        console.log(chalk.gray('(no content)'))
      }

      console.log('')
    }
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Message ROWID to show context for',
          parse: Number,
          placeholder: 'rowid',
        },
      ],
    },
    flags: {
      range: {
        kind: 'parsed',
        brief: 'Number of messages before and after',
        parse: Number,
        default: 5,
      },
      json: {
        kind: 'boolean',
        brief: 'Output as JSON',
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

export const messageCommands = buildRouteMap({
  routes: {
    list: messageList,
    get: messageGet,
    context: messageContext,
  },
  docs: {
    brief: 'Browse and view messages',
  },
})
