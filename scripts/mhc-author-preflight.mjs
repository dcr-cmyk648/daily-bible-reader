#!/usr/bin/env node
// Availability only: no selection, source packet, authoring or publication.
import path from 'node:path';
import {authorPreflight} from './lib/mhc-v2-author-session.mjs';
const args=process.argv.slice(2),at=args.indexOf('--codex-executable');
if(at<0||!args[at+1])throw Error('Usage: node scripts/mhc-author-preflight.mjs --codex-executable ABSOLUTE_PATH');
const privateRoot=path.join(process.cwd(),'private-content');
const result=await authorPreflight({projectRoot:process.cwd(),privateRoot,runtimeRoot:path.join(privateRoot,'automation/mhc-runtime'),config:{}},{codexExecutable:args[at+1]});
const {options,mcpNames,...receipt}=result;
process.stdout.write(JSON.stringify(receipt)+'\n');
if(receipt.state!=='available')process.exitCode=1;
