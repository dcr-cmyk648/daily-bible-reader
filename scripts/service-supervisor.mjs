#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {supervisorContext, runSupervisor, supervisorStatus} from './lib/service-supervisor.mjs';
import {safeCode} from './lib/service-supervisor-policy.mjs';
import {fault, readPrivate, openJournal} from './lib/service-supervisor-store.mjs';

async function main() {
  const args = process.argv.slice(2), command = args.shift();
  let role, extra={};
  if (command === 'tick' && args.length === 2 && args[0] === '--role') role = args[1];
  else if (command.startsWith('publication-')) {
    for(let i=0;i<args.length;i+=2) {
      if(!['--role','--request','--transaction','--operation','--receipt','--native-result'].includes(args[i])||!args[i+1]||extra[args[i]])throw fault('SUPERVISOR_ARGUMENTS_INVALID');
      extra[args[i]]=args[i+1];
    }
  } else if (command !== 'status' || args.length) throw fault('SUPERVISOR_ARGUMENTS_INVALID');
  const configPath = process.env.BIBLEAPP_SUPERVISOR_CONFIG, releaseRoot = process.env.BIBLEAPP_SUPERVISOR_RELEASE;
  if (!configPath || !releaseRoot || !path.isAbsolute(configPath) || !path.isAbsolute(releaseRoot)) throw fault('SUPERVISOR_INSTALLED_LAUNCHER_REQUIRED');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const ctx = await supervisorContext(config, releaseRoot);
  let result;
  if(command.startsWith('publication-')||command==='tick'&&config.stage==='B') {
    const publisher=await import('./lib/service-supervisor-publication.mjs');
    if(config.stage!=='B')throw fault('SUPERVISOR_PUBLICATION_CONFIG_INVALID');
    if(command==='publication-start'&&Object.keys(extra).length===2&&extra['--role']&&extra['--request']) {
      result=await publisher.beginPublication(ctx,{role:extra['--role'],request:await readPrivate(ctx.projectRoot,extra['--request'])});
    } else if(command==='publication-handoff'&&Object.keys(extra).length===1&&extra['--transaction'])result=await publisher.publicationHandoff(ctx,extra['--transaction']);
    else if(command==='publication-dispatch'&&Object.keys(extra).length===2&&extra['--transaction']&&extra['--operation'])
      result=await publisher.dispatchPublication(ctx,extra['--transaction'],extra['--operation']);
    else if(command==='publication-resume'&&Object.keys(extra).length===2&&extra['--transaction']&&extra['--receipt'])
      result=await publisher.resumePublication(ctx,extra['--transaction'],await readPrivate(ctx.stateRoot,extra['--receipt']));
    else if(command==='publication-receipt'&&Object.keys(extra).length===2&&extra['--transaction']&&extra['--native-result'])
      result=await publisher.materializePublicationReceipt(ctx,extra['--transaction'],extra['--native-result']);
    else if(command==='publication-reconcile'&&Object.keys(extra).length===1&&extra['--transaction'])result=await publisher.reconcilePublication(ctx,extra['--transaction']);
    else if(command==='publication-health'&&Object.keys(extra).length===1&&extra['--transaction'])result=await publisher.retryPublicationHealth(ctx,extra['--transaction']);
    else if(command==='tick') {
      result=await publisher.pendingPublication(ctx);
      if(!result) {
        const observation=await runSupervisor(ctx,{role});
        const events=await (await openJournal(ctx.stateRoot)).load(),staged=events.findLast(e=>e.kind==='status_staged'&&e.data.role===role);
        if(!staged)throw fault('SUPERVISOR_STATUS_STAGING_FAILED');
        const status=(await readPrivate(ctx.stateRoot,staged.data.candidate)).preparationStatus;
        const lane=role==='preparation'?'daily':'review';
        result=await publisher.beginPublication(ctx,{role,heartbeat:{state:status.state,summary:status.summary,action:status.action,
          heartbeat:{lane,lastOutcome:observation.outcome==='blocked'?'blocked':observation.forwardComplete?'no_op':'running',
            lastErrorCode:observation.code||'',...(observation.buffer?{buffer:observation.buffer}:{})}}});
      }
    } else throw fault('SUPERVISOR_ARGUMENTS_INVALID');
  } else result=command === 'status' ? await supervisorStatus(ctx) : await runSupervisor(ctx, {role});
  process.stdout.write(JSON.stringify(result) + '\n');
  if (['blocked','reconciliation_required','health_pending'].includes(result.outcome)) process.exitCode = 1;
}
main().catch(e => {process.stdout.write(JSON.stringify({schemaVersion: 'service-supervisor-error/v1', code: safeCode(e.code),
  outcome: 'blocked', published: false}) + '\n'); process.exitCode = 1;});
