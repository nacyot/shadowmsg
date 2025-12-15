// @ts-nocheck - Stricli types not fully compatible with strict mode
import {
  buildApplication,
  buildCommand,
  buildRouteMap,
  type CommandContext,
} from '@stricli/core'

// Import command implementations
import { initCommand } from './stricli/init.js'
import { searchCommand } from './stricli/search.js'
import { queryCommand } from './stricli/query.js'
import { statsCommand } from './stricli/stats.js'
import { doctorCommand } from './stricli/doctor.js'
import { syncCommands } from './stricli/sync.js'
import { messageCommands } from './stricli/message.js'
import { senderCommands } from './stricli/sender.js'
import { contactCommands } from './stricli/contact.js'
import { ruleCommands } from './stricli/rule.js'

export interface AppContext extends CommandContext {
  readonly process: NodeJS.Process
}

const routes = buildRouteMap({
  routes: {
    init: initCommand,
    search: searchCommand,
    query: queryCommand,
    stats: statsCommand,
    doctor: doctorCommand,
    sync: syncCommands,
    message: messageCommands,
    sender: senderCommands,
    contact: contactCommands,
    rule: ruleCommands,
  },
  docs: {
    brief: 'ShadowMSG - macOS Messages CLI',
  },
})

export const app = buildApplication(routes, {
  name: 'shadowmsg',
  versionInfo: {
    currentVersion: '0.1.1',
  },
})
