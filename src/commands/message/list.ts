import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'
import { fromMacOSDate, formatDate, formatDateShort, daysAgo, startOfDay, endOfDay, toMacOSDate } from '../../utils/date-formatter.js'
import { cleanText } from '../../utils/text-cleaner.js'

export default class MessageList extends BaseCommand {
  static description = 'List and browse messages'

  static examples = [
    '<%= config.bin %> message list',
    '<%= config.bin %> message list --limit 50',
    '<%= config.bin %> message list --from "Amazon"',
    '<%= config.bin %> message list --days 7',
    '<%= config.bin %> message list --date 2024-11-29',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum results',
      default: 20,
    }),
    offset: Flags.integer({
      description: 'Skip first N results',
      default: 0,
    }),
    before: Flags.integer({
      description: 'Show messages before this ROWID (cursor pagination)',
    }),
    after: Flags.integer({
      description: 'Show messages after this ROWID (cursor pagination)',
    }),
    date: Flags.string({
      description: 'Show messages from specific date (YYYY-MM-DD)',
    }),
    since: Flags.string({
      description: 'Show messages since date (YYYY-MM-DD)',
    }),
    until: Flags.string({
      description: 'Show messages until date (YYYY-MM-DD)',
    }),
    days: Flags.integer({
      description: 'Show messages from last N days',
    }),
    from: Flags.string({
      char: 'f',
      description: 'Filter by sender (phone, alias, or contact name)',
    }),
    sent: Flags.boolean({
      description: 'Show only messages sent by me',
      default: false,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
    short: Flags.boolean({
      description: 'One-line summary format',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(MessageList)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

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

    // Cursor pagination
    if (flags.before) {
      sql += ` AND m.ROWID < ?`
      params.push(flags.before)
    }
    if (flags.after) {
      sql += ` AND m.ROWID > ?`
      params.push(flags.after)
    }

    // Date filters
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

    // Sender filter
    if (flags.from) {
      sql += ` AND (h.id LIKE ? OR sa.alias LIKE ? OR c.name LIKE ?)`
      const fromPattern = `%${flags.from}%`
      params.push(fromPattern, fromPattern, fromPattern)
    }

    // Sent by me
    if (flags.sent) {
      sql += ` AND m.is_from_me = 1`
    }

    // Order and pagination
    if (flags.after) {
      sql += ` ORDER BY m.date ASC`
    } else {
      sql += ` ORDER BY m.date DESC`
    }

    sql += ` LIMIT ? OFFSET ?`
    params.push(flags.limit, flags.offset)

    const results = db.query(sql).all(...params) as Array<{
      rowid: number
      guid: string
      handle_id: number
      date: number
      is_from_me: number
      text_extracted: string | null
      cache_has_attachments: number
      sender_phone: string | null
      sender_name: string | null
      service: string | null
    }>

    // Reverse if we used after (to maintain newest-first order)
    if (flags.after) {
      results.reverse()
    }

    if (flags.json) {
      this.outputJson(results)
    } else if (flags.short) {
      this.outputShort(results)
    } else {
      this.outputFull(results)
    }
  }

  private outputJson(results: Array<Record<string, unknown>>): void {
    const output = results.map((r) => ({
      rowid: r.rowid,
      sent_at: fromMacOSDate(r.date as number).toISOString(),
      sender: r.sender_name,
      phone: r.sender_phone,
      service: r.service || 'SMS',
      content: cleanText(r.text_extracted as string | null),
      is_from_me: r.is_from_me === 1,
    }))
    this.log(JSON.stringify(output, null, 2))
  }

  private outputShort(results: Array<Record<string, unknown>>): void {
    if (results.length === 0) {
      this.log(chalk.yellow('No messages found'))
      return
    }

    for (const r of results) {
      const date = formatDateShort(fromMacOSDate(r.date as number))
      const sender = ((r.sender_name || r.sender_phone || 'Unknown') as string).slice(0, 12).padEnd(12)
      const cleaned = cleanText(r.text_extracted as string | null) || ''
      const content = cleaned.replace(/\n/g, ' ').slice(0, 50)

      this.log(`#${r.rowid}  ${date}  ${sender}  ${content}...`)
    }
  }

  private outputFull(results: Array<Record<string, unknown>>): void {
    if (results.length === 0) {
      this.log(chalk.yellow('No messages found'))
      return
    }

    this.log(`Found ${chalk.cyan(results.length.toString())} messages:`)
    this.log('')

    for (const r of results) {
      const date = formatDate(fromMacOSDate(r.date as number))
      const sender = (r.sender_name || r.sender_phone || 'Unknown') as string
      const service = (r.service || 'SMS') as string
      const content = cleanText(r.text_extracted as string | null)

      this.log(`#${r.rowid} · ${date} · ${sender} · ${service}`)
      this.log('─'.repeat(60))

      if (content) {
        this.log(content)
      } else {
        this.log(chalk.gray('(no content)'))
      }

      this.log('')
    }
  }
}
