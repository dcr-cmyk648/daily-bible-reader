#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {supervisorContext, runSupervisor, supervisorStatus} from './lib/service-supervisor.mjs';
import {safeCode} from './lib/service-supervisor-policy.mjs';
import {fault, readPrivate, openJournal,durableWrite,jsonBytes,digest,confined} from './lib/service-supervisor-store.mjs';

async function main() {
  const args = process.argv.slice(2), command = args.shift();
  let role, extra={};
  if (command === 'tick' && args.length === 2 && args[0] === '--role') role = args[1];
  else if(command==='diagnose-genesis16-source'&&args.length===2&&args[0]==='--receipt')extra={receiptPath:args[1]};
  else if(command==='continue-genesis16-sources'&&args.length===2&&args[0]==='--receipt')extra={receiptPath:args[1]};
  else if(command==='revalidate-genesis16-research'&&args.length===2&&args[0]==='--receipt')extra={receiptPath:args[1]};
  else if(command==='recover-genesis16-preflight'&&args.length===6&&args[0]==='--job'&&args[2]==='--blocked-event'&&args[4]==='--packet-sha256')
    extra={jobId:args[1],blockedEventSha256:args[3],packetSha256:args[5]};
  else if(['authorize-genesis15-review','genesis15-review-snapshot'].includes(command)&&args.length===2&&
    args[0]===(command==='authorize-genesis15-review'?'--receipt':'--output'))extra[args[0]]=args[1];
  else if (command.startsWith('publication-')) {
    for(let i=0;i<args.length;i+=2) {
      if(!['--role','--request','--transaction','--operation','--receipt','--native-result'].includes(args[i])||!args[i+1]||extra[args[i]])throw fault('SUPERVISOR_ARGUMENTS_INVALID');
      extra[args[i]]=args[i+1];
    }
  } else if (!['status','compatibility'].includes(command) || args.length) throw fault('SUPERVISOR_ARGUMENTS_INVALID');
  const configPath = process.env.BIBLEAPP_SUPERVISOR_CONFIG, releaseRoot = process.env.BIBLEAPP_SUPERVISOR_RELEASE;
  if (!configPath || !releaseRoot || !path.isAbsolute(configPath) || !path.isAbsolute(releaseRoot)) throw fault('SUPERVISOR_INSTALLED_LAUNCHER_REQUIRED');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const ctx = await supervisorContext(config, releaseRoot);
  let result;
  if(command==='continue-genesis16-sources') {
    result=await (await import('./lib/service-supervisor-source-continuation.mjs')).continueGenesis16Sources(ctx,extra);
  } else if(command==='diagnose-genesis16-source') {
    result=await (await import('./lib/service-supervisor-source-diagnostic.mjs')).diagnoseGenesis16Source(ctx,extra);
  } else if(command==='revalidate-genesis16-research') {
    result=await (await import('./lib/service-supervisor-research-revalidation.mjs')).revalidateGenesis16Research(ctx,extra);
  } else if(command==='recover-genesis16-preflight') {
    result=await (await import('./lib/service-supervisor-preflight-recovery.mjs')).recoverGenesis16Preflight(ctx,extra);
  } else if(['authorize-genesis15-review','genesis15-review-snapshot'].includes(command)) {
    const {verifiedHenryContext}=await import('./lib/service-supervisor-henry.mjs'),binding=await verifiedHenryContext(ctx),
      operator=await import('./lib/service-supervisor-operator-review.mjs'),
      relative=value=>path.isAbsolute(value)?path.relative(ctx.projectRoot,value):value;
    if(command==='authorize-genesis15-review') {
      const receiptPath=relative(extra['--receipt']);
      if(!receiptPath.replaceAll('\\','/').startsWith('private-content/automation/service-supervisor/'))throw fault('SUPERVISOR_OPERATOR_REVIEW_SNAPSHOT_PATH_INVALID');
      await (await import('./lib/service-supervisor-runtime.mjs')).assertNoWriters(ctx.projectRoot,ctx.stateRoot);
      const receiptBytes=await readFile(await confined(ctx.projectRoot,receiptPath,false));
      result=await operator.authorizeGenesis15Review(ctx,JSON.parse(receiptBytes),{binding,receiptBytes});
    } else result=await operator.writeGenesis15ReviewSnapshot(ctx,{binding,output:relative(extra['--output']).replaceAll('\\','/')});
  } else if(command.startsWith('publication-')||command==='tick'&&['B','C','D'].includes(config.stage)) {
    const publisher=await import('./lib/service-supervisor-publication.mjs');
    if(!['B','C','D'].includes(config.stage))throw fault('SUPERVISOR_PUBLICATION_CONFIG_INVALID');
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
        let work;
        if(['C','D'].includes(config.stage)) {
          const worker=await import('./lib/service-supervisor-work.mjs');work=await worker.runStageC(ctx,{role});
          if(work.action==='publish_required') {
            result=await publisher.beginPublication(ctx,{role,request:await readPrivate(ctx.projectRoot,work.requestPath)});
            await worker.bindWakePublication(ctx,work.wakeId,result.transactionId);
            result={...result,wakeId:work.wakeId,runComplete:false};
          }
        }
        if(!result) {
        const observation=await runSupervisor(ctx,{role,wakeId:work?.wakeId});
        const events=await (await openJournal(ctx.stateRoot)).load(),staged=events.findLast(e=>e.kind==='status_staged'&&e.data.role===role);
        if(!staged)throw fault('SUPERVISOR_STATUS_STAGING_FAILED');
        const status=(await readPrivate(ctx.stateRoot,staged.data.candidate)).preparationStatus;
        const lane=role==='preparation'?'daily':'review';
        const blocked=work?.outcome==='blocked'||observation.outcome==='blocked',code=work?.code||observation.code||'',
          ownedSuccess=observation.verifiedCompletedReadingIds?.length>0&&status.lanes?.[lane]?.lastOutcome==='success';
        result=await publisher.beginPublication(ctx,{role,...(work?{workCompletion:{wakeId:work.wakeId,outcome:work.outcome,code:work.code}}:{}),heartbeat:{state:blocked?'blocked':status.state,
          summary:work?.outcome==='blocked'?`Preparation blocked: ${code}`:status.summary,
          action:blocked?'Open BibleApp Manager in Codex':status.action,
          heartbeat:{lane,lastOutcome:ownedSuccess?'success':blocked?'blocked':observation.forwardComplete?'no_op':'running',
            lastErrorCode:ownedSuccess?'':code,...(observation.buffer?{buffer:observation.buffer}:{})}}});
        }
      }
    } else throw fault('SUPERVISOR_ARGUMENTS_INVALID');
  } else if(command==='compatibility') {
    const {fourLaneCompatibility}=await import('./lib/service-supervisor-compatibility.mjs'),report=await fourLaneCompatibility(ctx),bytes=jsonBytes(report),
      reportSha256=digest(bytes),reportPath=await durableWrite(ctx.stateRoot,`compatibility/${reportSha256}.json`,bytes);
    result={schemaVersion:report.schemaVersion,reportPath,reportSha256,rollbackSafe:report.rollbackSafe,
      oldDailyAuthorAllowed:report.oldDailyAuthorAllowed,parkedDailyJobs:report.daily.filter(j=>j.disposition==='park_no_replay').length,
      nativeJobs:report.henry.length,published:false};
  } else result=command === 'status' ? await supervisorStatus(ctx) : await runSupervisor(ctx, {role});
  process.stdout.write(JSON.stringify(result) + '\n');
  if (['blocked','reconciliation_required','health_pending'].includes(result.outcome)) process.exitCode = 1;
}
main().catch(e => {process.stdout.write(JSON.stringify({schemaVersion: 'service-supervisor-error/v1', code: safeCode(e.code),
  outcome: 'blocked', published: false}) + '\n'); process.exitCode = 1;});
