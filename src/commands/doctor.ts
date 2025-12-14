import { Command } from '@oclif/core'
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

export default class Doctor extends Command {
  static description = 'Check ShadowMSG configuration and health'

  static examples = ['<%= config.bin %> doctor']

  async run(): Promise<void> {
    this.log('')
    this.log(chalk.bold('ShadowMSG Doctor'))
    this.log('─'.repeat(50))
    this.log('')

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
        message: `${shadowDbPath} (${this.formatBytes(stats.size)})`,
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
      const ago = this.formatTimeAgo(lastSync)
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

    // Check 6: Node.js version
    const nodeVersion = process.version
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10)
    if (majorVersion >= 18) {
      checks.push({
        name: 'Node.js version',
        status: 'ok',
        message: nodeVersion,
      })
    } else {
      checks.push({
        name: 'Node.js version',
        status: 'error',
        message: `${nodeVersion} (requires >= 18)`,
      })
    }

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

      this.log(`${icon} ${check.name}`)
      this.log(`  ${chalk.gray(check.message)}`)
      this.log('')
    }

    // Summary
    const errors = checks.filter(c => c.status === 'error').length
    const warnings = checks.filter(c => c.status === 'warning').length

    this.log('─'.repeat(50))
    if (errors > 0) {
      this.log(chalk.red(`${errors} error(s), ${warnings} warning(s)`))
      this.log('')
      this.log('Fix the errors above before using ShadowMSG.')
    } else if (warnings > 0) {
      this.log(chalk.yellow(`${warnings} warning(s)`))
      this.log('')
      this.log('ShadowMSG should work, but consider addressing the warnings.')
    } else {
      this.log(chalk.green('All checks passed!'))
    }
    this.log('')
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  private formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
    return `${Math.floor(seconds / 86400)} days ago`
  }
}
