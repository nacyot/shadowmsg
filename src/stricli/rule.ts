// @ts-nocheck
import { buildCommand, buildRouteMap } from '@stricli/core'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'

// Embedded guide content (since we can't rely on filesystem in binary)
const SHADOWMSG_GUIDE = `# ShadowMSG CLI Guide

A macOS Messages CLI tool for searching and browsing your message history.

## Quick Start

\`\`\`bash
sm init          # Initialize database
sm sync          # Sync messages from Messages.app
sm search "keyword"  # Search messages
\`\`\`

## Common Commands

### Search Messages
\`\`\`bash
sm search "hello"                    # Basic search
sm search "payment" --from "Amazon"  # Filter by sender
sm search "order" --after "2024-01-01" --json  # Date filter with JSON output
\`\`\`

### Browse Messages
\`\`\`bash
sm message list                  # List recent messages
sm message list --days 7         # Last 7 days
sm message get 12345             # Get specific message
sm message context 12345         # Show conversation context
\`\`\`

### Manage Sender Aliases
\`\`\`bash
sm sender list                   # List aliases
sm sender add "+1234567890" "Amazon"  # Add alias
sm sender suggest                # Suggest unaliased senders
\`\`\`

### Statistics
\`\`\`bash
sm stats                         # Overall statistics
sm stats --yearly                # Yearly breakdown
sm contact stats --top 20        # Top contacts
\`\`\`

### SQL Queries
\`\`\`bash
sm query "SELECT COUNT(*) FROM message"  # Raw SQL
sm query --saved by-sender               # Saved queries
\`\`\`

## Troubleshooting

Run \`sm doctor\` to check your setup.
`

const ruleAdd = buildCommand({
  docs: {
    brief: 'Copy ShadowMSG CLI guide to your project',
  },
  async func(flags, destPath: string) {
    const destinationPath = path.resolve(destPath)

    try {
      const dir = path.dirname(destinationPath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(destinationPath, SHADOWMSG_GUIDE)

      console.log(chalk.green(`✓ ShadowMSG guide copied to ${destPath}`))
    } catch (error) {
      console.error(`Failed to copy: ${error instanceof Error ? error.message : 'Unknown error'}`)
      process.exit(1)
    }
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [
        {
          brief: 'Path where to copy the ShadowMSG guide',
          parse: String,
          placeholder: 'path',
        },
      ],
    },
    flags: {},
  },
})

export const ruleCommands = buildRouteMap({
  routes: {
    add: ruleAdd,
  },
  docs: {
    brief: 'Manage ShadowMSG rules',
  },
})
