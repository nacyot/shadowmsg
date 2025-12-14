import { Command, Flags } from '@oclif/core'
import { getDatabase, shouldAutoSync } from './services/database.js'
import { syncAll } from './services/sync.js'

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'no-sync': Flags.boolean({
      description: 'Skip auto-sync before command execution',
      default: false,
    }),
  }

  protected async autoSyncIfNeeded(noSync: boolean): Promise<void> {
    if (noSync) return

    const db = getDatabase()
    if (shouldAutoSync(db)) {
      this.log('Auto-syncing...')
      await syncAll(db)
    }
  }
}
