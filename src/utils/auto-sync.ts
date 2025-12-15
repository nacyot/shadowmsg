import { getDatabase, shouldAutoSync } from '../services/database.js'
import { syncAll } from '../services/sync.js'

export async function autoSyncIfNeeded(noSync: boolean): Promise<void> {
  if (noSync) return

  const db = getDatabase()
  if (shouldAutoSync(db)) {
    console.log('Auto-syncing...')
    await syncAll(db)
  }
}
