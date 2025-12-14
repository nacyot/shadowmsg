import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../../services/database.js'
import { fromMacOSDate, formatDate } from '../../utils/date-formatter.js'
import { cleanText } from '../../utils/text-cleaner.js'

export default class MessageGet extends BaseCommand {
  static description = 'Get a specific message by ROWID'

  static examples = [
    '<%= config.bin %> message get 44201',
    '<%= config.bin %> message get 44201 --json',
  ]

  static args = {
    rowid: Args.integer({
      description: 'Message ROWID',
      required: true,
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MessageGet)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const message = db.prepare(`
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
    `).get(args.rowid) as {
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
    } | undefined

    if (!message) {
      this.error(`Message #${args.rowid} not found`)
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
      this.log(JSON.stringify(output, null, 2))
      return
    }

    const date = formatDate(fromMacOSDate(message.date))
    const sender = message.sender_name || message.sender_phone || 'Unknown'
    const phone = message.sender_phone || ''
    const service = message.service || 'SMS'

    this.log('')
    this.log(`Message #${message.rowid}`)
    this.log('─'.repeat(40))
    this.log(`  Date:    ${date}`)
    this.log(`  From:    ${sender}${phone && sender !== phone ? ` (${phone})` : ''}`)
    this.log(`  Service: ${service}`)
    if (message.cache_has_attachments) {
      this.log(`  Attachments: Yes`)
    }
    this.log('')

    if (content) {
      this.log(content)
    } else {
      this.log(chalk.gray('(no content)'))
    }

    this.log('')
    this.log('─'.repeat(40))
  }
}
