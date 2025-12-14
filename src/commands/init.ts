import { Command } from '@oclif/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import {
  getDatabase,
  getShadowDbPath,
  getShadowMsgDir,
  initializeSchema,
  isDatabaseInitialized,
} from '../services/database.js'

export default class Init extends Command {
  static description = 'Initialize ShadowMSG database'

  static examples = [
    '<%= config.bin %> init',
  ]

  async run(): Promise<void> {
    const shadowDir = getShadowMsgDir()
    const shadowDbPath = getShadowDbPath()

    if (isDatabaseInitialized()) {
      this.log(chalk.yellow('Database already initialized at:'))
      this.log(`  ${shadowDbPath}`)
      this.log('')
      this.log('Run ' + chalk.cyan('sm sync') + ' to update messages.')
      return
    }

    this.log('Initializing ShadowMSG...')
    this.log('')

    // Create directory if needed
    if (!fs.existsSync(shadowDir)) {
      fs.mkdirSync(shadowDir, { recursive: true })
      this.log(chalk.green('✓') + ` Created ${shadowDir}`)
    }

    // Initialize database schema
    const db = getDatabase()
    initializeSchema(db)
    this.log(chalk.green('✓') + ` Created database at ${shadowDbPath}`)

    this.log('')
    this.log(chalk.green('Initialization complete!'))
    this.log('')
    this.log('Next steps:')
    this.log(`  1. Run ${chalk.cyan('sm sync')} to sync messages`)
    this.log(`  2. Run ${chalk.cyan('sm search "keyword"')} to search`)
  }
}
