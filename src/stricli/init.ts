// @ts-nocheck
import { buildCommand } from '@stricli/core'
import chalk from 'chalk'
import * as fs from 'node:fs'
import {
  getDatabase,
  getShadowDbPath,
  getShadowMsgDir,
  initializeSchema,
  isDatabaseInitialized,
} from '../services/database.js'

export const initCommand = buildCommand({
  docs: {
    brief: 'Initialize ShadowMSG database',
  },
  func() {
    const shadowDir = getShadowMsgDir()
    const shadowDbPath = getShadowDbPath()

    if (isDatabaseInitialized()) {
      console.log(chalk.yellow('Database already initialized at:'))
      console.log(`  ${shadowDbPath}`)
      console.log('')
      console.log('Run ' + chalk.cyan('sm sync') + ' to update messages.')
      return
    }

    console.log('Initializing ShadowMSG...')
    console.log('')

    // Create directory if needed
    if (!fs.existsSync(shadowDir)) {
      fs.mkdirSync(shadowDir, { recursive: true })
      console.log(chalk.green('✓') + ` Created ${shadowDir}`)
    }

    // Initialize database schema
    const db = getDatabase()
    initializeSchema(db)
    console.log(chalk.green('✓') + ` Created database at ${shadowDbPath}`)

    console.log('')
    console.log(chalk.green('Initialization complete!'))
    console.log('')
    console.log('Next steps:')
    console.log(`  1. Run ${chalk.cyan('sm sync')} to sync messages`)
    console.log(`  2. Run ${chalk.cyan('sm search "keyword"')} to search`)
  },
  parameters: {},
})
