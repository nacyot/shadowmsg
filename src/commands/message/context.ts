import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'
import { fromMacOSDate, formatDate } from '../../utils/date-formatter.js'
import { cleanText } from '../../utils/text-cleaner.js'

export default class MessageContext extends BaseCommand {
  static description = 'Show messages around a specific message (conversation context)'

  static examples = [
    '<%= config.bin %> message context 44201',
    '<%= config.bin %> message context 44201 --range 10',
  ]

  static args = {
    rowid: Args.integer({
      description: 'Message ROWID to show context for',
      required: true,
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    range: Flags.integer({
      char: 'r',
      description: 'Number of messages before and after',
      default: 5,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MessageContext)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    // Get the target message to find its handle_id
    const target = db.prepare(`
      SELECT handle_id, date FROM message WHERE ROWID = ?
    `).get(args.rowid) as { handle_id: number; date: number } | undefined

    if (!target) {
      this.error(`Message #${args.rowid} not found`)
    }

    // Get messages before and after with the same handle_id
    const messages = db.prepare(`
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
    `).all(target.handle_id, args.rowid, args.rowid) as Array<{
      rowid: number
      date: number
      is_from_me: number
      text_extracted: string | null
      sender_phone: string | null
      sender_name: string | null
      service: string | null
    }>

    // Find the index of target message
    const targetIndex = messages.findIndex(m => m.rowid === args.rowid)
    if (targetIndex === -1) {
      this.error(`Message #${args.rowid} not found in context`)
    }

    // Slice to get range around target
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
        is_target: m.rowid === args.rowid,
      }))
      this.log(JSON.stringify(output, null, 2))
      return
    }

    this.log('')
    this.log(chalk.bold(`Conversation context around #${args.rowid}`))
    this.log('─'.repeat(60))
    this.log('')

    for (const m of contextMessages) {
      const date = formatDate(fromMacOSDate(m.date))
      const sender = m.is_from_me ? chalk.blue('Me') : (m.sender_name || m.sender_phone || 'Unknown')
      const isTarget = m.rowid === args.rowid
      const content = cleanText(m.text_extracted)

      if (isTarget) {
        this.log(chalk.yellow(`>>> #${m.rowid} · ${date} · ${sender}`))
        this.log(chalk.yellow('─'.repeat(60)))
      } else {
        this.log(`#${m.rowid} · ${date} · ${sender}`)
        this.log('─'.repeat(60))
      }

      if (content) {
        const displayContent = isTarget ? chalk.yellow(content) : content
        this.log(displayContent)
      } else {
        this.log(chalk.gray('(no content)'))
      }

      this.log('')
    }
  }
}
