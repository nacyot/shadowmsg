import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { BaseCommand } from '../base-command.js'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'
import { searchMessages, SearchResult } from '../services/search.js'
import { fromMacOSDate, formatDate, formatDateShort } from '../utils/date-formatter.js'
import { cleanText } from '../utils/text-cleaner.js'

export default class Search extends BaseCommand {
  static description = 'Search messages'

  static examples = [
    '<%= config.bin %> search "hello"',
    '<%= config.bin %> search "order" --from "+1234567890"',
    '<%= config.bin %> search "payment" --after "2024-01-01" --json',
    '<%= config.bin %> search "delivery confirmed"',
  ]

  static args = {
    query: Args.string({
      description: 'Search keyword (space-separated terms are ANDed)',
      required: true,
    }),
  }

  static flags = {
    ...BaseCommand.baseFlags,
    from: Flags.string({
      char: 'f',
      description: 'Filter by sender (phone or alias)',
    }),
    after: Flags.string({
      description: 'Filter messages after date (ISO 8601)',
    }),
    before: Flags.string({
      description: 'Filter messages before date (ISO 8601)',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum results',
      default: 20,
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
    const { args, flags } = await this.parse(Search)

    if (!isDatabaseInitialized()) {
      this.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
    }

    await this.autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const result = searchMessages(db, args.query, {
      from: flags.from,
      after: flags.after ? new Date(flags.after) : undefined,
      before: flags.before ? new Date(flags.before) : undefined,
      limit: flags.limit,
    })

    if (flags.json) {
      this.outputJson(result)
    } else if (flags.short) {
      this.outputShort(result)
    } else {
      this.outputFull(result)
    }
  }

  private outputJson(result: SearchResult): void {
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
    this.log(JSON.stringify(output, null, 2))
  }

  private outputShort(result: SearchResult): void {
    const { messages, total, limit } = result

    if (messages.length === 0) {
      this.log(chalk.yellow('No messages found'))
      return
    }

    // Show count info
    if (total > messages.length) {
      this.log(chalk.gray(`Showing ${messages.length} of ${total} results (limit: ${limit})`))
    } else {
      this.log(chalk.gray(`Found ${total} results`))
    }
    this.log('')

    for (const r of messages) {
      const date = formatDateShort(fromMacOSDate(r.date))
      const sender = (r.sender_name || r.sender_phone || 'Unknown').slice(0, 12).padEnd(12)
      const cleaned = cleanText(r.text_extracted) || ''
      const content = cleaned.replace(/\n/g, ' ').slice(0, 50)

      this.log(`#${r.rowid}  ${date}  ${sender}  ${content}...`)
    }
  }

  private outputFull(result: SearchResult): void {
    const { messages, total, limit } = result

    if (messages.length === 0) {
      this.log(chalk.yellow('No messages found'))
      return
    }

    // Show count info with distinction between total and displayed
    if (total > messages.length) {
      this.log(`Found ${chalk.cyan(total.toString())} messages, showing ${chalk.cyan(messages.length.toString())} (use ${chalk.gray('--limit')} to see more)`)
    } else {
      this.log(`Found ${chalk.cyan(total.toString())} messages`)
    }
    this.log('')

    for (let i = 0; i < messages.length; i++) {
      const r = messages[i]
      const date = formatDate(fromMacOSDate(r.date))
      const sender = r.sender_name || r.sender_phone || 'Unknown'
      const service = r.service || 'SMS'
      const content = cleanText(r.text_extracted)

      // Message header with box drawing
      this.log(chalk.blue('┌─') + chalk.gray(` #${r.rowid} · ${date} · ${sender} · ${service}`))

      if (content) {
        // Indent content for better readability
        const lines = content.split('\n')
        for (const line of lines) {
          this.log(chalk.blue('│ ') + line)
        }
      } else {
        this.log(chalk.blue('│ ') + chalk.gray('(no content)'))
      }

      this.log(chalk.blue('└─'))

      // Add extra spacing between messages
      if (i < messages.length - 1) {
        this.log('')
      }
    }
  }
}
