import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default class RuleAdd extends Command {
  static override args = {
    path: Args.string({
      description: 'Path where to copy the ShadowMSG guide',
      required: true,
    }),
  }

  static override description = 'Copy ShadowMSG CLI guide to your project'

  static override examples = ['<%= config.bin %> <%= command.id %> .rules/shadowmsg.md']

  public async run(): Promise<void> {
    const { args } = await this.parse(RuleAdd)

    const sourcePath = path.join(__dirname, '../../../docs/SHADOWMSG_GUIDE.md')
    const destinationPath = path.resolve(args.path)

    try {
      const content = await fs.readFile(sourcePath, 'utf8')

      const dir = path.dirname(destinationPath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(destinationPath, content)

      this.log(chalk.green(`✓ ShadowMSG guide copied to ${args.path}`))
    } catch (error) {
      this.error(`Failed to copy: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
