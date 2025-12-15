// @ts-nocheck
import { buildCommand, buildRouteMap } from '@stricli/core'
import chalk from 'chalk'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'
import { autoSyncIfNeeded } from '../utils/auto-sync.js'

const contactList = buildCommand({
  docs: {
    brief: 'List contacts synced from AddressBook',
  },
  func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const db = getDatabase()

    let sql: string
    if (flags['with-count']) {
      sql = `
        SELECT
          c.phone_normalized,
          c.name,
          c.organization,
          COUNT(m.ROWID) as message_count
        FROM contact c
        LEFT JOIN handle h ON c.phone_normalized = h.id
        LEFT JOIN message m ON h.ROWID = m.handle_id AND m.deleted_at IS NULL
        GROUP BY c.phone_normalized
        ORDER BY message_count DESC, c.name
        LIMIT ?
      `
    } else {
      sql = `
        SELECT phone_normalized, name, organization
        FROM contact
        ORDER BY name
        LIMIT ?
      `
    }

    const contacts = db.query(sql).all(flags.limit) as Array<{
      phone_normalized: string
      name: string
      organization: string | null
      message_count?: number
    }>

    if (flags.json) {
      console.log(JSON.stringify(contacts, null, 2))
      return
    }

    if (contacts.length === 0) {
      console.log(chalk.yellow('No contacts synced'))
      console.log('')
      console.log('Run ' + chalk.cyan('sm sync') + ' to sync contacts from AddressBook.')
      return
    }

    console.log('')
    console.log(chalk.bold('Contacts'))
    console.log('─'.repeat(60))

    for (const c of contacts) {
      const name = c.name.trim() || c.organization || '(unnamed)'
      const org = c.organization && c.name.trim() ? chalk.gray(` (${c.organization})`) : ''
      const count = flags['with-count'] ? chalk.cyan(` [${c.message_count}]`) : ''

      console.log(`  ${c.phone_normalized.padEnd(15)} ${name}${org}${count}`)
    }

    console.log('')
    console.log(`Total: ${contacts.length} contact(s)`)
  },
  parameters: {
    flags: {
      'with-count': {
        kind: 'boolean',
        brief: 'Include message count for each contact',
        default: false,
      },
      limit: {
        kind: 'parsed',
        brief: 'Maximum results',
        parse: Number,
        default: 50,
      },
      json: {
        kind: 'boolean',
        brief: 'Output as JSON',
        default: false,
      },
    },
  },
})

const contactSearch = buildCommand({
  docs: {
    brief: 'Search contacts by name or organization',
  },
  func(flags, query: string) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const db = getDatabase()

    const contacts = db.query(`
      SELECT
        c.phone_normalized,
        c.name,
        c.organization,
        COUNT(m.ROWID) as message_count
      FROM contact c
      LEFT JOIN handle h ON c.phone_normalized = h.id
      LEFT JOIN message m ON h.ROWID = m.handle_id AND m.deleted_at IS NULL
      WHERE c.name LIKE ? OR c.organization LIKE ?
      GROUP BY c.phone_normalized
      ORDER BY message_count DESC
    `).all(`%${query}%`, `%${query}%`) as Array<{
      phone_normalized: string
      name: string
      organization: string | null
      message_count: number
    }>

    if (flags.json) {
      console.log(JSON.stringify(contacts, null, 2))
      return
    }

    if (contacts.length === 0) {
      console.log(chalk.yellow(`No contacts found matching "${query}"`))
      return
    }

    console.log('')
    console.log(chalk.bold(`Contacts matching "${query}"`))
    console.log('─'.repeat(60))

    for (const c of contacts) {
      const name = c.name.trim() || c.organization || '(unnamed)'
      const org = c.organization && c.name.trim() ? chalk.gray(` (${c.organization})`) : ''

      console.log(`  ${c.phone_normalized.padEnd(15)} ${name}${org} ${chalk.cyan(`[${c.message_count}]`)}`)
    }

    console.log('')
    console.log(`Found: ${contacts.length} contact(s)`)
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Search query (name or organization)',
          parse: String,
          placeholder: 'query',
        },
      ],
    },
    flags: {
      json: {
        kind: 'boolean',
        brief: 'Output as JSON',
        default: false,
      },
    },
  },
})

const contactStats = buildCommand({
  docs: {
    brief: 'Show message statistics by contact',
  },
  async func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const stats = db.query(`
      SELECT
        COALESCE(sa.alias, NULLIF(TRIM(c.name), ''), c.organization, h.id) as sender,
        h.id as phone,
        COUNT(*) as total,
        SUM(CASE WHEN m.is_from_me = 0 THEN 1 ELSE 0 END) as received,
        SUM(CASE WHEN m.is_from_me = 1 THEN 1 ELSE 0 END) as sent
      FROM message m
      JOIN handle h ON m.handle_id = h.ROWID
      LEFT JOIN contact c ON h.id = c.phone_normalized
      LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
      WHERE m.deleted_at IS NULL
      GROUP BY h.id
      ORDER BY total DESC
      LIMIT ?
    `).all(flags.top) as Array<{
      sender: string
      phone: string
      total: number
      received: number
      sent: number
    }>

    if (flags.json) {
      console.log(JSON.stringify(stats, null, 2))
      return
    }

    if (stats.length === 0) {
      console.log(chalk.yellow('No message statistics available'))
      return
    }

    console.log('')
    console.log(chalk.bold(`Top ${flags.top} contacts by message count`))
    console.log('─'.repeat(70))
    console.log('')
    console.log('  ' + 'Sender'.padEnd(20) + 'Total'.padStart(8) + 'Recv'.padStart(8) + 'Sent'.padStart(8))
    console.log('  ' + '─'.repeat(20) + '─'.repeat(8) + '─'.repeat(8) + '─'.repeat(8))

    for (const s of stats) {
      const sender = (s.sender || s.phone).slice(0, 18).padEnd(20)
      console.log(
        `  ${sender}${s.total.toString().padStart(8)}${s.received.toString().padStart(8)}${s.sent.toString().padStart(8)}`
      )
    }

    console.log('')
  },
  parameters: {
    flags: {
      top: {
        kind: 'parsed',
        brief: 'Show top N contacts',
        parse: Number,
        default: 10,
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

export const contactCommands = buildRouteMap({
  routes: {
    list: contactList,
    search: contactSearch,
    stats: contactStats,
  },
  docs: {
    brief: 'View synced contacts',
  },
})
