// @ts-nocheck
import { buildCommand, buildRouteMap } from '@stricli/core'
import chalk from 'chalk'
import { getDatabase, isDatabaseInitialized } from '../services/database.js'
import { autoSyncIfNeeded } from '../utils/auto-sync.js'

const senderList = buildCommand({
  docs: {
    brief: 'List sender aliases',
  },
  func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const db = getDatabase()

    const aliases = db
      .query(`SELECT phone_normalized, alias, created_at FROM sender_alias ORDER BY created_at DESC`)
      .all() as Array<{
      phone_normalized: string
      alias: string
      created_at: string
    }>

    if (flags.json) {
      console.log(JSON.stringify(aliases, null, 2))
      return
    }

    if (aliases.length === 0) {
      console.log(chalk.yellow('No aliases registered'))
      console.log('')
      console.log('Use ' + chalk.cyan('sm sender add <phone> <alias>') + ' to add one.')
      return
    }

    console.log('')
    console.log(chalk.bold('Sender Aliases'))
    console.log('─'.repeat(50))

    for (const alias of aliases) {
      console.log(`  ${alias.phone_normalized.padEnd(15)} → ${alias.alias}`)
    }

    console.log('')
    console.log(`Total: ${aliases.length} alias(es)`)
  },
  parameters: {
    flags: {
      json: {
        kind: 'boolean',
        brief: 'Output as JSON',
        default: false,
      },
    },
  },
})

const senderAdd = buildCommand({
  docs: {
    brief: 'Add a sender alias',
  },
  func(flags, phone: string, alias: string) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const db = getDatabase()

    // Normalize phone number
    let normalizedPhone = phone.replace(/[^\d+]/g, '')
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '+82' + normalizedPhone.slice(1)
    }
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone
    }

    const existing = db
      .query(`SELECT alias FROM sender_alias WHERE phone_normalized = ?`)
      .get(normalizedPhone) as { alias: string } | undefined

    if (existing) {
      db.query(`UPDATE sender_alias SET alias = ? WHERE phone_normalized = ?`)
        .run(alias, normalizedPhone)
      console.log(chalk.green('✓') + ` Updated alias: ${normalizedPhone} → ${alias}`)
    } else {
      db.query(`INSERT INTO sender_alias (phone_normalized, alias) VALUES (?, ?)`)
        .run(normalizedPhone, alias)
      console.log(chalk.green('✓') + ` Added alias: ${normalizedPhone} → ${alias}`)
    }
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Phone number (normalized format: +82...)',
          parse: String,
          placeholder: 'phone',
        },
        {
          brief: 'Alias name to display',
          parse: String,
          placeholder: 'alias',
        },
      ],
    },
    flags: {},
  },
})

const senderRemove = buildCommand({
  docs: {
    brief: 'Remove a sender alias',
  },
  func(flags, phone: string) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    const db = getDatabase()

    // Normalize phone number
    let normalizedPhone = phone.replace(/[^\d+]/g, '')
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '+82' + normalizedPhone.slice(1)
    }
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone
    }

    const existing = db
      .query(`SELECT alias FROM sender_alias WHERE phone_normalized = ?`)
      .get(normalizedPhone) as { alias: string } | undefined

    if (!existing) {
      console.error(`No alias found for ${normalizedPhone}`)
      process.exit(1)
    }

    db.query(`DELETE FROM sender_alias WHERE phone_normalized = ?`).run(normalizedPhone)
    console.log(chalk.green('✓') + ` Removed alias for ${normalizedPhone} (was: ${existing.alias})`)
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Phone number to remove alias for',
          parse: String,
          placeholder: 'phone',
        },
      ],
    },
    flags: {},
  },
})

const senderSuggest = buildCommand({
  docs: {
    brief: 'Suggest phone numbers that could use aliases',
  },
  async func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    const suggestions = db
      .query(
        `SELECT
          h.id as phone,
          COUNT(*) as message_count,
          MAX(m.text_extracted) as sample_message
        FROM message m
        JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN sender_alias sa ON h.id = sa.phone_normalized
        LEFT JOIN contact c ON h.id = c.phone_normalized
        WHERE sa.phone_normalized IS NULL
          AND c.phone_normalized IS NULL
          AND m.deleted_at IS NULL
          AND m.is_from_me = 0
        GROUP BY h.id
        ORDER BY message_count DESC
        LIMIT ?`
      )
      .all(flags.limit) as Array<{
      phone: string
      message_count: number
      sample_message: string | null
    }>

    if (flags.json) {
      console.log(JSON.stringify(suggestions, null, 2))
      return
    }

    if (suggestions.length === 0) {
      console.log(chalk.green('✓') + ' All frequent senders have aliases!')
      return
    }

    console.log('')
    console.log(chalk.bold('Suggested senders to add aliases for:'))
    console.log('─'.repeat(60))
    console.log('')

    for (const s of suggestions) {
      const sample = (s.sample_message || '')
        .replace(/\n/g, ' ')
        .slice(0, 40)

      console.log(`${s.phone.padEnd(15)} ${chalk.gray(`(${s.message_count} messages)`)}`)
      if (sample) {
        console.log(`  ${chalk.gray(sample)}...`)
      }
      console.log('')
    }

    console.log('Use ' + chalk.cyan('sm sender add <phone> <alias>') + ' to add an alias.')
  },
  parameters: {
    flags: {
      limit: {
        kind: 'parsed',
        brief: 'Maximum suggestions',
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

export const senderCommands = buildRouteMap({
  routes: {
    list: senderList,
    add: senderAdd,
    remove: senderRemove,
    suggest: senderSuggest,
  },
  docs: {
    brief: 'Manage sender aliases',
  },
})
