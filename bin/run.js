#!/usr/bin/env bun

import { run } from '@stricli/core'
import { app } from '../src/app.js'

run(app, process.argv.slice(2), { process })
