// @ts-nocheck
import { buildCommand, buildRouteMap } from '@stricli/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import * as readline from 'node:readline'

const PLIST_LABEL = 'com.shadowmsg.push'
const PLIST_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = path.join(PLIST_DIR, `${PLIST_LABEL}.plist`)
const LOG_PATH = path.join(os.homedir(), '.shadowmsg', 'push.log')
const PKG_NAME = '@home/shadowmsg'

// --- Interactive prompts ---

function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const suffix = defaultValue ? ` (${defaultValue})` : ''
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

async function promptRequired(question: string, defaultValue?: string): Promise<string> {
  while (true) {
    const answer = await prompt(question, defaultValue)
    if (answer) return answer
    console.log(chalk.red('  This field is required.'))
  }
}

// --- Path resolution ---

function resolveBunxPath(): string {
  try {
    return execSync('which bunx', { encoding: 'utf-8' }).trim()
  } catch {
    throw new Error('bunx not found. Install Bun: brew install oven-sh/bun/bun')
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// --- Plist generation ---

function generatePlist(options: {
  url: string
  apiKey: string
  host?: string
  interval: number
  pkgSpec: string
}): string {
  const bunxPath = resolveBunxPath()

  const envEntries: string[] = [
    `        <key>SHADOWMSG_PUSH_URL</key>`,
    `        <string>${escapeXml(options.url)}</string>`,
    `        <key>SHADOWMSG_PUSH_API_KEY</key>`,
    `        <string>${escapeXml(options.apiKey)}</string>`,
  ]
  if (options.host) {
    envEntries.push(
      `        <key>SHADOWMSG_PUSH_HOST</key>`,
      `        <string>${escapeXml(options.host)}</string>`,
    )
  }
  envEntries.push(
    `        <key>HOME</key>`,
    `        <string>${os.homedir()}</string>`,
    `        <key>PATH</key>`,
    `        <string>${path.dirname(bunxPath)}:/usr/local/bin:/usr/bin:/bin</string>`,
  )

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${escapeXml(bunxPath)}</string>
        <string>${escapeXml(options.pkgSpec)}</string>
        <string>push</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${os.homedir()}</string>
    <key>EnvironmentVariables</key>
    <dict>
${envEntries.join('\n')}
    </dict>
    <key>StartInterval</key>
    <integer>${options.interval}</integer>
    <key>StandardOutPath</key>
    <string>${LOG_PATH}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_PATH}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
`
}

// --- Commands ---

const installService = buildCommand({
  docs: {
    brief: 'Install launchd service for periodic push',
  },
  async func(flags) {
    if (fs.existsSync(PLIST_PATH)) {
      console.log(chalk.yellow('Service already installed.') + ' Uninstall first:')
      console.log(`  ${chalk.cyan('sm service uninstall')}`)
      process.exit(1)
    }

    // Resolve values: flags > env > interactive prompt
    const isInteractive = !flags.url && !process.env.SHADOWMSG_PUSH_URL

    let url = flags.url || process.env.SHADOWMSG_PUSH_URL || ''
    let apiKey = flags['api-key'] || process.env.SHADOWMSG_PUSH_API_KEY || ''
    let host = flags.host || process.env.SHADOWMSG_PUSH_HOST || ''
    let interval = flags.interval
    let version = flags.version || ''

    if (isInteractive) {
      console.log(chalk.bold('Push Service Setup'))
      console.log('─'.repeat(40))
      console.log('')
    }

    if (!url) url = await promptRequired('Push API URL')
    if (!apiKey) apiKey = await promptRequired('API key')
    if (!host && isInteractive) {
      host = await prompt('Host header (optional, for reverse proxy)')
    }
    if (isInteractive) {
      const intervalStr = await prompt('Push interval in seconds', '1800')
      interval = parseInt(intervalStr, 10) || 1800
    }

    // Verify bunx is available
    const bunxPath = resolveBunxPath()

    // Package spec: @home/shadowmsg or @home/shadowmsg@0.2.0
    const pkgSpec = version ? `${PKG_NAME}@${version}` : PKG_NAME

    // Show summary
    console.log('')
    console.log(chalk.bold('Configuration:'))
    console.log(`  URL:      ${chalk.cyan(url)}`)
    if (host) console.log(`  Host:     ${chalk.cyan(host)}`)
    console.log(`  Interval: ${chalk.cyan(`${interval}s`)} (${Math.round(interval / 60)} min)`)
    console.log(`  Package:  ${chalk.cyan(pkgSpec)}`)
    console.log(`  bunx:     ${bunxPath}`)
    console.log(`  Log:      ${LOG_PATH}`)
    console.log('')

    if (isInteractive) {
      const confirm = await prompt('Install service? (Y/n)', 'Y')
      if (confirm.toLowerCase() === 'n') {
        console.log('Cancelled.')
        return
      }
    }

    const plist = generatePlist({
      url,
      apiKey,
      host: host || undefined,
      interval,
      pkgSpec,
    })

    // Ensure directories
    fs.mkdirSync(PLIST_DIR, { recursive: true })
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })

    // Write plist
    fs.writeFileSync(PLIST_PATH, plist)
    console.log(chalk.green('✓') + ` Wrote ${PLIST_PATH}`)

    // Load service
    try {
      execSync(`launchctl load ${PLIST_PATH}`, { stdio: 'pipe' })
      console.log(chalk.green('✓') + ' Service loaded')
    } catch (e) {
      console.error(chalk.red('Failed to load service:') + ' ' + (e as Error).message)
      console.log('Try manually: ' + chalk.cyan(`launchctl load ${PLIST_PATH}`))
      process.exit(1)
    }

    console.log('')
    console.log(chalk.green('Push service installed!'))
    console.log('')
    console.log('  ' + chalk.cyan('sm service status') + '      — check status & recent log')
    console.log('  ' + chalk.cyan('sm service uninstall') + '   — remove service')
  },
  parameters: {
    flags: {
      url: {
        kind: 'parsed',
        parse: String,
        brief: 'Push API endpoint URL',
        optional: true,
      },
      'api-key': {
        kind: 'parsed',
        parse: String,
        brief: 'Push API key',
        optional: true,
      },
      host: {
        kind: 'parsed',
        parse: String,
        brief: 'Host header for reverse proxy',
        optional: true,
      },
      interval: {
        kind: 'parsed',
        parse: Number,
        brief: 'Push interval in seconds (default: 1800 = 30 min)',
        default: 1800,
      },
      version: {
        kind: 'parsed',
        parse: String,
        brief: 'Pin package version (e.g. 0.2.0)',
        optional: true,
      },
    },
  },
})

const uninstallService = buildCommand({
  docs: {
    brief: 'Uninstall launchd push service',
  },
  func() {
    if (!fs.existsSync(PLIST_PATH)) {
      console.log('Service not installed.')
      return
    }

    try {
      execSync(`launchctl unload ${PLIST_PATH}`, { stdio: 'pipe' })
      console.log(chalk.green('✓') + ' Service unloaded')
    } catch {
      // May already be unloaded
    }

    fs.unlinkSync(PLIST_PATH)
    console.log(chalk.green('✓') + ` Removed ${PLIST_PATH}`)
  },
  parameters: {},
})

const serviceStatus = buildCommand({
  docs: {
    brief: 'Show push service status',
  },
  func() {
    console.log('')
    console.log(chalk.bold('Push Service Status'))
    console.log('─'.repeat(50))

    if (!fs.existsSync(PLIST_PATH)) {
      console.log(`  Installed: ${chalk.red('no')}`)
      console.log('')
      console.log(`  Run ${chalk.cyan('sm service install')} to set up.`)
      console.log('')
      return
    }

    console.log(`  Installed: ${chalk.green('yes')}`)
    console.log(`  Plist:     ${PLIST_PATH}`)

    // Parse plist for config summary
    const plistContent = fs.readFileSync(PLIST_PATH, 'utf-8')
    const urlMatch = plistContent.match(/SHADOWMSG_PUSH_URL<\/key>\s*<string>([^<]+)/)
    const hostMatch = plistContent.match(/SHADOWMSG_PUSH_HOST<\/key>\s*<string>([^<]+)/)
    const intervalMatch = plistContent.match(/<key>StartInterval<\/key>\s*<integer>(\d+)/)
    const pkgMatch = plistContent.match(/@home\/shadowmsg[^<]*/)

    if (urlMatch) console.log(`  URL:       ${urlMatch[1]}`)
    if (hostMatch) console.log(`  Host:      ${hostMatch[1]}`)
    if (pkgMatch) console.log(`  Package:   ${pkgMatch[0]}`)
    if (intervalMatch) {
      const secs = parseInt(intervalMatch[1])
      console.log(`  Interval:  ${secs}s (${Math.round(secs / 60)} min)`)
    }

    // launchctl status
    try {
      const output = execSync(`launchctl list ${PLIST_LABEL} 2>&1`, { encoding: 'utf-8' })
      const pidMatch = output.match(/"PID"\s*=\s*(\d+)/)
      const exitMatch = output.match(/"LastExitStatus"\s*=\s*(\d+)/)

      console.log(`  Loaded:    ${chalk.green('yes')}`)
      if (pidMatch) {
        console.log(`  Running:   ${chalk.green('yes')} (PID ${pidMatch[1]})`)
      } else {
        console.log(`  Running:   ${chalk.gray('no (waiting for next interval)')}`)
      }
      if (exitMatch) {
        const code = parseInt(exitMatch[1])
        const color = code === 0 ? chalk.green : chalk.red
        console.log(`  Last exit: ${color(code.toString())}`)
      }
    } catch {
      console.log(`  Loaded:    ${chalk.yellow('no')}`)
      console.log(`  Try: ${chalk.cyan(`launchctl load ${PLIST_PATH}`)}`)
    }

    // Log tail
    console.log('')
    if (fs.existsSync(LOG_PATH)) {
      const stat = fs.statSync(LOG_PATH)
      const sizeKb = (stat.size / 1024).toFixed(1)
      console.log(chalk.bold('Recent log') + chalk.gray(` (${LOG_PATH}, ${sizeKb} KB)`))

      const log = fs.readFileSync(LOG_PATH, 'utf-8')
      const lines = log.trim().split('\n')
      const tail = lines.slice(-10)
      for (const line of tail) {
        console.log(`  ${line}`)
      }
    } else {
      console.log(chalk.gray('No log file yet (service has not run).'))
    }

    console.log('')
  },
  parameters: {},
})

export const serviceCommands = buildRouteMap({
  routes: {
    install: installService,
    uninstall: uninstallService,
    status: serviceStatus,
  },
  docs: {
    brief: 'Manage push launchd service',
  },
})
