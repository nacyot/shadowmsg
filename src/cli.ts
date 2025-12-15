#!/usr/bin/env bun
// @ts-nocheck - Stricli types not fully compatible with strict mode
import { run } from '@stricli/core'
import { app } from './app.js'

run(app, process.argv.slice(2), { process })
