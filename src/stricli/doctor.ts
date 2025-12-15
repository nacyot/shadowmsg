// @ts-nocheck
import { buildCommand } from '@stricli/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {
  getShadowMsgDir,
  getShadowDbPath,
  getSourceDbPath,
  findAddressBookDbs,
  isDatabaseInitialized,
  getLastSyncAt,
} from '../services/database.js'

interface CheckResult {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

export const doctorCommand = buildCommand({
  docs: {
    brief: 'Check ShadowMSG configuration and health',
  },
  func() {
    console.log('')
    console.log(chalk.bold('ShadowMSG Doctor'))
    console.log('─'.repeat(50))
    console.log('')

    const checks: CheckResult[] = []

    // Check 1: ShadowMSG directory
    const shadowDir = getShadowMsgDir()
    if (fs.existsSync(shadowDir)) {
      checks.push({
        name: 'ShadowMSG directory',
        status: 'ok',
        message: shadowDir,
      })
    } else {
      checks.push({
        name: 'ShadowMSG directory',
        status: 'warning',
        message: `Not found: ${shadowDir}. Run 'sm init' to create.`,
      })
    }

    // Check 2: Shadow database
    const shadowDbPath = getShadowDbPath()
    if (isDatabaseInitialized()) {
      const stats = fs.statSync(shadowDbPath)
      checks.push({
        name: 'Shadow database',
        status: 'ok',
        message: `${shadowDbPath} (${formatBytes(stats.size)})`,
      })
    } else if (fs.existsSync(shadowDbPath)) {
      checks.push({
        name: 'Shadow database',
        status: 'warning',
        message: `Exists but not initialized: ${shadowDbPath}`,
      })
    } else {
      checks.push({
        name: 'Shadow database',
        status: 'warning',
        message: `Not found. Run 'sm init' to create.`,
      })
    }

    // Check 3: Source Messages database
    const sourceDbPath = getSourceDbPath()
    if (fs.existsSync(sourceDbPath)) {
      try {
        fs.accessSync(sourceDbPath, fs.constants.R_OK)
        checks.push({
          name: 'Messages database',
          status: 'ok',
          message: sourceDbPath,
        })
      } catch {
        checks.push({
          name: 'Messages database',
          status: 'error',
          message: `No read access: ${sourceDbPath}. Enable Full Disk Access for your terminal.`,
        })
      }
    } else {
      checks.push({
        name: 'Messages database',
        status: 'error',
        message: `Not found: ${sourceDbPath}`,
      })
    }

    // Check 4: AddressBook databases
    const addressBookDbs = findAddressBookDbs()
    if (addressBookDbs.length > 0) {
      checks.push({
        name: 'AddressBook databases',
        status: 'ok',
        message: `Found ${addressBookDbs.length} source(s)`,
      })
    } else {
      checks.push({
        name: 'AddressBook databases',
        status: 'warning',
        message: 'No AddressBook databases found. Contacts will not be synced.',
      })
    }

    // Check 5: Last sync
    const lastSync = getLastSyncAt()
    if (lastSync) {
      const ago = formatTimeAgo(lastSync)
      const status = Date.now() - lastSync.getTime() > 24 * 60 * 60 * 1000 ? 'warning' : 'ok'
      checks.push({
        name: 'Last sync',
        status,
        message: `${lastSync.toLocaleString()} (${ago})`,
      })
    } else {
      checks.push({
        name: 'Last sync',
        status: 'warning',
        message: `Never synced. Run 'sm sync' to sync messages.`,
      })
    }

    // Check 6: Bun version
    const bunVersion = typeof Bun !== 'undefined' ? Bun.version : 'N/A'
    checks.push({
      name: 'Bun version',
      status: 'ok',
      message: bunVersion,
    })

    // Check 7: Platform
    const platform = os.platform()
    if (platform === 'darwin') {
      checks.push({
        name: 'Platform',
        status: 'ok',
        message: `macOS ${os.release()}`,
      })
    } else {
      checks.push({
        name: 'Platform',
        status: 'error',
        message: `${platform} (requires macOS)`,
      })
    }

    // Display results
    for (const check of checks) {
      const icon = check.status === 'ok'
        ? chalk.green('✓')
        : check.status === 'warning'
          ? chalk.yellow('⚠')
          : chalk.red('✗')

      console.log(`${icon} ${check.name}`)
      console.log(`  ${chalk.gray(check.message)}`)
      console.log('')
    }

    // Summary
    const errors = checks.filter(c => c.status === 'error').length
    const warnings = checks.filter(c => c.status === 'warning').length

    console.log('─'.repeat(50))
    if (errors > 0) {
      console.log(chalk.red(`${errors} error(s), ${warnings} warning(s)`))
      console.log('')
      console.log('Fix the errors above before using ShadowMSG.')
    } else if (warnings > 0) {
      console.log(chalk.yellow(`${warnings} warning(s)`))
      console.log('')
      console.log('ShadowMSG should work, but consider addressing the warnings.')
    } else {
      console.log(chalk.green('All checks passed!'))
    }
    console.log('')
  },
  parameters: {},
})
