// @ts-nocheck
import { buildCommand } from '@stricli/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import { getDatabase, isDatabaseInitialized, getLastSyncAt, getShadowDbPath } from '../services/database.js'
import { autoSyncIfNeeded } from '../utils/auto-sync.js'

function formatMacDate(nanoseconds: number): string {
  const MACOS_EPOCH = new Date('2001-01-01T00:00:00Z').getTime()
  const milliseconds = Math.floor(nanoseconds / 1_000_000)
  const date = new Date(MACOS_EPOCH + milliseconds)
  return date.toLocaleDateString('ko-KR')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function showOverallStats(db: ReturnType<typeof getDatabase>, json: boolean): void {
  const totalMessages = (db.query(`SELECT COUNT(*) as count FROM message WHERE deleted_at IS NULL`).get() as { count: number }).count
  const totalHandles = (db.query(`SELECT COUNT(*) as count FROM handle`).get() as { count: number }).count
  const totalContacts = (db.query(`SELECT COUNT(*) as count FROM contact`).get() as { count: number }).count
  const totalAliases = (db.query(`SELECT COUNT(*) as count FROM sender_alias`).get() as { count: number }).count

  const received = (db.query(`SELECT COUNT(*) as count FROM message WHERE is_from_me = 0 AND deleted_at IS NULL`).get() as { count: number }).count
  const sent = (db.query(`SELECT COUNT(*) as count FROM message WHERE is_from_me = 1 AND deleted_at IS NULL`).get() as { count: number }).count

  const dateRange = db.query(`
    SELECT
      MIN(date) as min_date,
      MAX(date) as max_date
    FROM message WHERE deleted_at IS NULL
  `).get() as { min_date: number; max_date: number }

  const lastSync = getLastSyncAt()
  const dbPath = getShadowDbPath()
  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0

  const stats = {
    messages: {
      total: totalMessages,
      received,
      sent,
    },
    handles: totalHandles,
    contacts: totalContacts,
    aliases: totalAliases,
    dateRange: {
      from: dateRange.min_date ? formatMacDate(dateRange.min_date) : null,
      to: dateRange.max_date ? formatMacDate(dateRange.max_date) : null,
    },
    lastSync: lastSync?.toISOString() || null,
    dbSizeBytes: dbSize,
  }

  if (json) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  console.log('')
  console.log(chalk.bold('ShadowMSG Statistics'))
  console.log('─'.repeat(40))
  console.log('')
  console.log(chalk.bold('Messages:'))
  console.log(`  Total:     ${chalk.cyan(totalMessages.toLocaleString())}`)
  console.log(`  Received:  ${chalk.cyan(received.toLocaleString())}`)
  console.log(`  Sent:      ${chalk.cyan(sent.toLocaleString())}`)
  console.log('')
  console.log(chalk.bold('Data:'))
  console.log(`  Handles:   ${chalk.cyan(totalHandles.toLocaleString())}`)
  console.log(`  Contacts:  ${chalk.cyan(totalContacts.toLocaleString())}`)
  console.log(`  Aliases:   ${chalk.cyan(totalAliases.toLocaleString())}`)
  console.log('')
  console.log(chalk.bold('Date Range:'))
  console.log(`  From: ${stats.dateRange.from || 'N/A'}`)
  console.log(`  To:   ${stats.dateRange.to || 'N/A'}`)
  console.log('')
  console.log(chalk.bold('Database:'))
  console.log(`  Size:      ${formatBytes(dbSize)}`)
  console.log(`  Last Sync: ${lastSync ? lastSync.toLocaleString() : 'Never'}`)
  console.log('')
}

function showYearlyStats(db: ReturnType<typeof getDatabase>, json: boolean): void {
  const stats = db.query(`
    SELECT
      strftime('%Y', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') AS year,
      COUNT(*) AS total,
      SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) AS received,
      SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) AS sent
    FROM message
    WHERE deleted_at IS NULL
    GROUP BY year
    ORDER BY year
  `).all() as Array<{ year: string; total: number; received: number; sent: number }>

  if (json) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  console.log('')
  console.log(chalk.bold('Yearly Statistics'))
  console.log('─'.repeat(50))
  console.log('')
  console.log('  ' + 'Year'.padEnd(6) + 'Total'.padStart(10) + 'Received'.padStart(10) + 'Sent'.padStart(10))
  console.log('  ' + '─'.repeat(6) + '─'.repeat(10) + '─'.repeat(10) + '─'.repeat(10))

  for (const s of stats) {
    console.log(
      `  ${s.year.padEnd(6)}${s.total.toLocaleString().padStart(10)}${s.received.toLocaleString().padStart(10)}${s.sent.toLocaleString().padStart(10)}`
    )
  }
  console.log('')
}

function showMonthlyStats(db: ReturnType<typeof getDatabase>, year: number | undefined, json: boolean): void {
  let sql = `
    SELECT
      strftime('%Y-%m', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') AS month,
      COUNT(*) AS total,
      SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) AS received,
      SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) AS sent
    FROM message
    WHERE deleted_at IS NULL
  `

  const params: string[] = []
  if (year) {
    sql += ` AND strftime('%Y', date/1000000000+strftime('%s','2001-01-01'), 'unixepoch', 'localtime') = ?`
    params.push(String(year))
  }

  sql += ` GROUP BY month ORDER BY month DESC LIMIT 24`

  const stats = db.query(sql).all(...params) as Array<{ month: string; total: number; received: number; sent: number }>

  if (json) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  console.log('')
  console.log(chalk.bold(year ? `Monthly Statistics (${year})` : 'Monthly Statistics (last 24 months)'))
  console.log('─'.repeat(55))
  console.log('')
  console.log('  ' + 'Month'.padEnd(10) + 'Total'.padStart(10) + 'Received'.padStart(10) + 'Sent'.padStart(10))
  console.log('  ' + '─'.repeat(10) + '─'.repeat(10) + '─'.repeat(10) + '─'.repeat(10))

  for (const s of stats) {
    console.log(
      `  ${s.month.padEnd(10)}${s.total.toLocaleString().padStart(10)}${s.received.toLocaleString().padStart(10)}${s.sent.toLocaleString().padStart(10)}`
    )
  }
  console.log('')
}

export const statsCommand = buildCommand({
  docs: {
    brief: 'Show message statistics',
  },
  async func(flags) {
    if (!isDatabaseInitialized()) {
      console.error('Database not initialized. Run ' + chalk.cyan('sm init') + ' first.')
      process.exit(1)
    }

    await autoSyncIfNeeded(flags['no-sync'])

    const db = getDatabase()

    if (flags.yearly) {
      showYearlyStats(db, flags.json)
    } else if (flags.monthly) {
      showMonthlyStats(db, flags.year, flags.json)
    } else {
      showOverallStats(db, flags.json)
    }
  },
  parameters: {
    flags: {
      yearly: {
        kind: 'boolean',
        brief: 'Show yearly statistics',
        default: false,
      },
      monthly: {
        kind: 'boolean',
        brief: 'Show monthly statistics',
        default: false,
      },
      year: {
        kind: 'parsed',
        brief: 'Filter by year (for monthly stats)',
        parse: Number,
        optional: true,
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
