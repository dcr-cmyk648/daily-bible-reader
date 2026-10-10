import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {openJournal, confined, readPrivate, durableWrite, digest, jsonBytes, fault} from './service-supervisor-store.mjs';
import {preparationStatusCandidate} from './preparation-status.mjs';
import {forwardWindow, measuredBuffer, safeCode} from './service-supervisor-policy.mjs';
import {loadHenryPlan} from './mhc-priority.mjs';
import {liveHealthCredentialsFromStores, verifyLiveReading, verifyLiveHorizon, callLiveHealthBridge} from './live-horizon-health.mjs';
import {admitPublication} from './service-supervisor-publication-gates.mjs';
import {authorizePublicationScope} from './service-supervisor-scope.mjs';
import core from '../../app/shared/server-core.js';
import {verifyCurrentPublicationApproval} from './service-supervisor-approval.mjs';

const validId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(v);
const token = () => randomBytes(16).toString('hex');
const url = id => `https://drive.google.com/file/d/${id}/view`;
const metadataFields = 'id,mimeType,parents,permissions(id,type,role,emailAddress,domain),trashed';
const terminal = new Set(['complete', 'blocked']);
const parsed = bytes => {try {return JSON.parse(bytes);} catch {throw fault('SUPERVISOR_RAW_JSON_INVALID');}};
const equal = (a,b) => isDeepStrictEqual(a,b);

export function permissionsDigest(metadata) {
  if (!metadata || !Array.isArray(metadata.permissions) || !metadata.permissions.length ||
      metadata.permissions.some(p => !['user','group'].includes(p.type) || !['owner','organizer','fileOrganizer','writer','commenter','reader'].includes(p.role) ||
        !(typeof p.emailAddress==='string'&&p.emailAddress||typeof p.id==='string'&&p.id) || p.domain)) throw fault('SUPERVISOR_SHARING_UNSAFE');
  return digest(jsonBytes(metadata.permissions.map(p => ({principal:p.emailAddress?p.emailAddress.toLowerCase():p.id,type:p.type,role:p.role}))
    .sort((a,b) => a.principal.localeCompare(b.principal) || a.role.localeCompare(b.role))));
}
function verifyMetadata(value, expected) {
  if (!value || value.id !== expected.fileId || value.trashed === true || value.mimeType !== expected.mimeType ||
      !Array.isArray(value.parents) || !equal([...value.parents].sort(), [...expected.parents].sort()) ||
      permissionsDigest(value) !== expected.permissionsSha256) throw fault('SUPERVISOR_DRIVE_METADATA_CHANGED');
}
function requireResources(ctx) {
  const resources = ctx.config.publicationResources;
  if (!['B','C','D'].includes(ctx.config.stage) || !resources || !validId(resources.manifest?.fileId) || !validId(resources.folder?.fileId)) throw fault('SUPERVISOR_PUBLICATION_CONFIG_INVALID');
  return resources;
}
function states(events) {
  const values = new Map();
  for (const event of events) if (event.kind === 'publication_state') values.set(event.data.transaction.id, event.data.transaction);
  return values;
}
async function checkedTransaction(journal, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw fault('SUPERVISOR_TRANSACTION_INVALID');
  const state = states(await journal.load()).get(id);
  if (!state) throw fault('SUPERVISOR_TRANSACTION_MISSING');
  return structuredClone(state);
}
function compatible(ctx,t) {if(t.sourceRevision!==ctx.config.sourceRevision)throw fault('SUPERVISOR_TRANSACTION_REVISION_CHANGED');}
async function save(journal, lease, transaction, now) {
  await journal.append('publication_state', {transaction}, now, lease);
}
function publicResult(t) {
  return {schemaVersion:'service-supervisor-publication-result/v1', transactionId:t.id, role:t.role,sourceRevision:t.sourceRevision,
    readingId:t.readingId, kind:t.kind, component:t.component, outcome:t.phase,
    code:t.code||null, published:t.phase==='complete' && t.kind==='reading',
    manifestDelivered: Boolean(t.manifestReadback), heartbeatStored:Boolean(t.manifestReadback),
    heartbeatDelivered:t.phase==='complete'&&t.readerVisible===true, readerVisible:t.readerVisible===true,
    ...(t.workCompletion?{wakeId:t.workCompletion.wakeId,runComplete:t.phase==='complete',
      workOutcome:t.workCompletion.outcome,workCode:t.workCompletion.code}:{} )};
}
async function op(ctx, journal, lease, t, purpose, tool, args, now, details={}) {
  if(t.ordinal>=32)throw fault('SUPERVISOR_CONNECTOR_BUDGET_EXHAUSTED');
  const ordinal=t.ordinal+1;
  const operation={schemaVersion:'service-supervisor-connector-operation/v1',transactionId:t.id,
    operationId:`${t.id}:${ordinal}`,ordinal,sourceRevision:t.sourceRevision,purpose,tool,args,...details};
  const relative=`publications/${t.id}/operations/${ordinal}.json`;
  await durableWrite(ctx.stateRoot,relative,jsonBytes(operation));
  t.ordinal=ordinal;t.operation={id:operation.operationId,path:relative,sha256:digest(jsonBytes(operation)),dispatched:false,purpose};
  await save(journal,lease,t,now);
}
async function metadataOp(ctx,journal,lease,t,purpose,expected,now) {
  return op(ctx,journal,lease,t,purpose,'google_drive_get_file_metadata',{fileId:expected.fileId,fields:metadataFields},now);
}
async function fetchOp(ctx,journal,lease,t,purpose,fileId,now) {
  return op(ctx,journal,lease,t,purpose,'google_drive_fetch',{url:url(fileId),download_raw_file:true,include_base64:false},now,
    {rawBytesRequired:true,privateDownloadRoot:path.join(ctx.stateRoot,'publications',t.id,'downloads'),
      ...(purpose==='version_readback'?{expectedBytes:t.artifacts[t.index].bytes,expectedSha256:t.artifacts[t.index].sha256}:{})});
}
async function rawArtifact(ctx,t,name,bytes) {
  const relative=`publications/${t.id}/raw/${name}-${digest(bytes)}.bin`;
  await durableWrite(ctx.stateRoot,relative,bytes);
  return {path:relative,sha256:digest(bytes),bytes:bytes.length};
}
async function expectedBytes(ctx,t) {
  for(const artifact of t.artifacts) {
    const bytes=await readFile(await confined(ctx.stateRoot,artifact.snapshot,false));
    if(bytes.length!==artifact.bytes||digest(bytes)!==artifact.sha256) throw fault('SUPERVISOR_APPROVED_BYTES_CHANGED');
  }
  if(t.approval) {
    const bytes=await readFile(await confined(ctx.projectRoot,t.approval.path,false));
    if(digest(bytes)!==t.approval.sha256) throw fault('SUPERVISOR_APPROVAL_CHANGED');
  }
}
async function currentApproval(ctx,t,dependencies) {
  if(t.kind!=='reading')return null;
  return (dependencies.verifyApproval||verifyCurrentPublicationApproval)(ctx,t);
}
function important(manifest,t) {
  return {appConfigFileId:manifest.appConfigFileId,planFileId:manifest.planFileId,sourceRegistryFileId:manifest.sourceRegistryFileId,
    reading:t.readingId?manifest.readings[t.readingId]||null:null};
}
function checkManifest(manifest) {
  if(manifest.schemaVersion!=='private-manifest/v1'||!manifest.readings||Array.isArray(manifest.readings)||
    ![manifest.appConfigFileId,manifest.planFileId,manifest.sourceRegistryFileId].every(validId)) throw fault('SUPERVISOR_MANIFEST_INVALID');
  for(const value of Object.values(manifest.readings)) if(!value||![value.contentFileId,value.metadataFileId].every(validId)) throw fault('SUPERVISOR_MANIFEST_INVALID');
}
async function checkScope(ctx,t,now,{freshHistorical=false}={}) {
  const {plan,appConfig}=await loadHenryPlan(ctx.releaseRoot), window=forwardWindow(plan,appConfig,now);
  if(t.kind==='reading'&&!window.entries.some(e=>e.readingId===t.readingId)) {
    if(!['retained_henry','protocol_refresh'].includes(t.scope?.kind))throw fault('SUPERVISOR_PUBLICATION_SCOPE_CHANGED');
    if(freshHistorical) {
      const scope=await authorizePublicationScope(ctx,{readingId:t.readingId,component:t.component,...t.scope},now);
      if(!equal(scope,t.scope))throw fault('SUPERVISOR_PUBLICATION_SCOPE_CHANGED');
    }
  }
  return {plan,appConfig};
}
async function mergeCandidate(ctx,journal,lease,t,baselineBytes,now,dependencies={}) {
  const manifest=parsed(baselineBytes);checkManifest(manifest);
  await expectedBytes(ctx,t);await currentApproval(ctx,t,dependencies);await checkScope(ctx,t,now,{freshHistorical:true});
  if(t.kind==='reading') {
    const base=parsed(await readFile(await confined(ctx.stateRoot,t.original.path,false)));
    if(!equal(important(base,t),important(manifest,t))) throw fault('SUPERVISOR_SAME_READING_CONFLICT');
    const ids=Object.fromEntries(t.artifacts.map(a=>[a.slot,a.fileId]));
    manifest.readings[t.readingId]={...manifest.readings[t.readingId],contentFileId:ids.content,metadataFileId:ids.metadata};
    for(const [slot,key] of [['plan','planFileId'],['appConfig','appConfigFileId'],['sourceRegistry','sourceRegistryFileId']]) if(ids[slot]) manifest[key]=ids[slot];
  }
  // Merge this role's receipt into the current remote status. Never replace the
  // entire prior status or another lane's error using the Stage A candidate.
  const heartbeat={...t.heartbeat,lastOutcome:t.kind==='reading'?'running':t.heartbeat.lastOutcome};
  manifest.preparationStatus=preparationStatusCandidate(manifest.preparationStatus,{state:t.statusState,
    summary:t.summary,action:t.action,now:new Date(now).toISOString(),heartbeat});
  const bytes=jsonBytes(manifest), artifact=await rawArtifact(ctx,t,`manifest-candidate-${t.rebases}`,bytes);
  t.base=await rawArtifact(ctx,t,`manifest-baseline-${t.rebases}`,baselineBytes);t.candidate=artifact;
  await fetchOp(ctx,journal,lease,t,'manifest_before_update',requireResources(ctx).manifest.fileId,now);
}
async function uploadNext(ctx,journal,lease,t,now) {
  const artifact=t.artifacts[t.index];
  if(!artifact) return metadataOp(ctx,journal,lease,t,'manifest_final_metadata',requireResources(ctx).manifest,now);
  return op(ctx,journal,lease,t,'version_upload','google_drive_upload_file',{
    file_uri:await confined(ctx.stateRoot,artifact.snapshot,false),file_name:artifact.name,mime_type:artifact.mimeType,
    parent_folder_id:requireResources(ctx).folder.fileId},now,{expectedSha256:artifact.sha256,expectedBytes:artifact.bytes,write:true});
}

export async function beginPublication(ctx,{role,request=null,heartbeat=null,workCompletion=null,now=new Date()},dependencies={}) {
  const resources=requireResources(ctx);
  if(!['preparation','review-audit'].includes(role))throw fault('SUPERVISOR_ROLE_INVALID');
  if(workCompletion&&(request||!['C','D'].includes(ctx.config.stage)||!/^[a-f0-9]{32}$/.test(workCompletion.wakeId||'')||
    !['complete','checkpointed','blocked'].includes(workCompletion.outcome)||
    workCompletion.code!==null&&safeCode(workCompletion.code)!==workCompletion.code))throw fault('SUPERVISOR_WAKE_BINDING_CHANGED');
  const journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('publication',{now,durationMs:10*60*1000});
  try {
    const previous=[...states(await journal.load()).values()];
    if(previous.some(t=>!terminal.has(t.phase)))throw fault('SUPERVISOR_PUBLICATION_PENDING');
    if(request&&previous.some(t=>t.phase==='blocked'&&t.sourceRevision===ctx.config.sourceRevision&&t.readingId===request.readingId&&
      t.component===request.component&&t.approval?.sha256===request.approvalSha256))throw fault('SUPERVISOR_PUBLICATION_BLOCK_RETAINED');
    const id=token(),t={id,role,kind:request?'reading':'status',readingId:request?.readingId||null,component:request?.component||null,
      sourceRevision:ctx.config.sourceRevision,phase:'active',ordinal:0,index:0,rebases:0,artifacts:[],operation:null,code:null};
    if(workCompletion)t.workCompletion={wakeId:workCompletion.wakeId,outcome:workCompletion.outcome,code:workCompletion.code};
    const original=await readFile(await confined(ctx.projectRoot,'private-content/private-manifest.json',false));checkManifest(parsed(original));
    t.original=await rawArtifact(ctx,t,'original',original);
    if(request) {
      const admitted=await (dependencies.admit||admitPublication)(ctx,request,{now,transactionId:id});
      t.approval=admitted.approval;t.scope=admitted.scope||{kind:'forward'};t.approvalAuthority=admitted.approvalAuthority;
      for(const artifact of admitted.artifacts) {
        const bytes=await readFile(await confined(ctx.publicationInputRoot||ctx.projectRoot,artifact.path,false));
        if(digest(bytes)!==artifact.sha256||bytes.length!==artifact.bytes)throw fault('SUPERVISOR_APPROVED_BYTES_CHANGED');
        const snapshot=`publications/${id}/approved/${artifact.slot}.${artifact.mimeType==='text/markdown'?'md':'json'}`;
        await durableWrite(ctx.stateRoot,snapshot,bytes);t.artifacts.push({...artifact,snapshot,fileId:null});
      }
    }
    t.approvalAuthority=await currentApproval(ctx,t,dependencies);
    const receipt=heartbeat||{state:'running',summary:'Private publication verification in progress',action:'',
      heartbeat:{lane:role==='preparation'?'daily':'review',lastOutcome:'running',lastErrorCode:''}};
    // Validate receipt through the actual helper before generating any write.
    preparationStatusCandidate(parsed(original).preparationStatus,{...receipt,now:new Date(now).toISOString()});
    if(receipt.heartbeat?.lane!==(role==='preparation'?'daily':'review'))throw fault('SUPERVISOR_HEARTBEAT_LANE_INVALID');
    t.heartbeat=receipt.heartbeat;t.statusState=receipt.state;t.summary=receipt.summary;t.action=receipt.action;
    await checkScope(ctx,t,now);await save(journal,lease,t,now);
    await metadataOp(ctx,journal,lease,t,'manifest_metadata',resources.manifest,now);
    return await publicationHandoff(ctx,id);
  } finally {await journal.release(lease,now);}
}
export async function publicationHandoff(ctx,id) {
  const journal=await openJournal(ctx.stateRoot),t=await checkedTransaction(journal,id),result=publicResult(t);
  if(!t.operation||terminal.has(t.phase))return result;
  const bytes=await readFile(await confined(ctx.stateRoot,t.operation.path,false));
  if(digest(bytes)!==t.operation.sha256)throw fault('SUPERVISOR_OPERATION_CHANGED');
  return {...result,action:t.operation.dispatched?'await_receipt':'dispatch_required',operationPath:await confined(ctx.stateRoot,t.operation.path,false),
    operationId:t.operation.id,operationSha256:t.operation.sha256,...(t.operation.dispatched?{dispatchEpoch:t.operation.dispatchEpoch}:{})}; // Explicit connector handoff only; private IDs stay in its file.
}
export async function dispatchPublication(ctx,id,operationId,{now=new Date()}={},dependencies={}) {
  requireResources(ctx);const journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('publication',{now,durationMs:10*60*1000});
  let t;
  try {
    t=await checkedTransaction(journal,id);compatible(ctx,t);
    if(t.phase!=='active'||t.operation?.id!==operationId||t.operation.dispatched)throw fault('SUPERVISOR_DISPATCH_REPLAY_REFUSED');
    await expectedBytes(ctx,t);await checkScope(ctx,t,now);
    const bytes=await readFile(await confined(ctx.stateRoot,t.operation.path,false));
    if(digest(bytes)!==t.operation.sha256)throw fault('SUPERVISOR_OPERATION_CHANGED');
    if(parsed(bytes).write) {
      const authority=await currentApproval(ctx,t,dependencies);
      if(authority)await journal.append('publication_approval_revalidated',{transactionId:id,operationId,authority},now,lease);
      await checkScope(ctx,t,now,{freshHistorical:true});
    }
    t.operation.dispatched=true;t.operation.dispatchedAt=new Date(now).toISOString();t.operation.dispatchEpoch=lease.epoch;
    await save(journal,lease,t,now);
    return {schemaVersion:'service-supervisor-dispatch/v1',dispatchEpoch:lease.epoch,authorizedOperation:parsed(bytes),published:false};
  } catch(e) {
    if(t?.phase==='active'&&t.operation?.id===operationId&&!t.operation.dispatched&&
      !['SUPERVISOR_DISPATCH_REPLAY_REFUSED','SUPERVISOR_TRANSACTION_REVISION_CHANGED'].includes(e.code)) {
      t.phase='blocked';t.code=safeCode(e.code);await save(journal,lease,t,now);
    }
    throw e;
  } finally {await journal.release(lease,now);}
}

async function receiptBytes(ctx,t,receipt) {
  if(typeof receipt.rawPath!=='string'||typeof receipt.rawSha256!=='string')throw fault('SUPERVISOR_RAW_READBACK_REQUIRED');
  // Outer connector may materialize under its own scoped temp root. Copy the
  // actual byte file to the specified private download root before resume.
  const root=await confined(ctx.stateRoot,`publications/${t.id}/downloads`);
  const file=await confined(root,receipt.rawPath,false),bytes=await readFile(file);
  if(digest(bytes)!==receipt.rawSha256)throw fault('SUPERVISOR_RAW_READBACK_HASH_INVALID');
  return bytes;
}
export async function resumePublication(ctx,id,receipt,{now=new Date()}={},dependencies={}) {
  const resources=requireResources(ctx),journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('publication',{now,durationMs:10*60*1000});
  let t;
  try {
    t=await checkedTransaction(journal,id);compatible(ctx,t);
    if(t.phase!=='active'||t.operation?.id!==receipt.operationId||t.operation.sha256!==receipt.operationSha256||!t.operation.dispatched||
      t.operation.dispatchEpoch!==receipt.dispatchEpoch||!['success','error','denied','uncertain'].includes(receipt.outcome))
      throw fault('SUPERVISOR_RECEIPT_BINDING_INVALID');
    const receiptPath=`publications/${id}/receipts/${t.ordinal}.json`;
    await durableWrite(ctx.stateRoot,receiptPath,jsonBytes(receipt));
    if(receipt.outcome!=='success') {
      const operation=parsed(await readFile(await confined(ctx.stateRoot,t.operation.path,false)));
      if(!operation.write&&receipt.outcome==='error'&&receipt.code==='SUPERVISOR_CONNECTOR_TRANSPORT'&&
          (t.readRetries?.[operation.purpose]||0)<1) {
        t.readRetries={...t.readRetries,[operation.purpose]:1};
        await op(ctx,journal,lease,t,operation.purpose,operation.tool,operation.args,now,{rawBytesRequired:operation.rawBytesRequired===true});
        return await publicationHandoff(ctx,id);
      }
      t.phase=receipt.outcome==='denied'?'blocked':operation.write?'reconciliation_required':'blocked';
      t.code=receipt.outcome==='denied'?'SUPERVISOR_CONNECTOR_DENIED':t.phase==='reconciliation_required'?'SUPERVISOR_WRITE_OUTCOME_UNCERTAIN':'SUPERVISOR_CONNECTOR_FAILED';
      await save(journal,lease,t,now);return publicResult(t);
    }
    await expectedBytes(ctx,t);await checkScope(ctx,t,now);
    const purpose=t.operation.purpose;
    if(purpose==='manifest_metadata'||purpose==='manifest_final_metadata') {
      verifyMetadata(receipt.metadata,resources.manifest);
      if(purpose==='manifest_metadata'&&t.kind==='reading')await metadataOp(ctx,journal,lease,t,'folder_metadata',resources.folder,now);
      else await fetchOp(ctx,journal,lease,t,purpose==='manifest_metadata'?'manifest_initial':'manifest_merge',resources.manifest.fileId,now);
    } else if(purpose==='folder_metadata') {
      verifyMetadata(receipt.metadata,resources.folder);await fetchOp(ctx,journal,lease,t,'manifest_initial',resources.manifest.fileId,now);
    } else if(purpose==='manifest_initial') {
      const bytes=await receiptBytes(ctx,t,receipt),live=parsed(bytes),original=parsed(await readFile(await confined(ctx.stateRoot,t.original.path,false)));
      checkManifest(live);
      if(t.kind==='reading'&&!equal(important(original,t),important(live,t)))throw fault('SUPERVISOR_SAME_READING_CONFLICT');
      if(t.kind==='reading') {t.initial=await rawArtifact(ctx,t,'initial',bytes);await uploadNext(ctx,journal,lease,t,now);}
      else await mergeCandidate(ctx,journal,lease,t,bytes,now,dependencies);
    } else if(purpose==='version_upload') {
      if(!validId(receipt.fileId))throw fault('SUPERVISOR_UPLOAD_ID_MISSING');
      const artifact=t.artifacts[t.index];artifact.fileId=receipt.fileId;
      await metadataOp(ctx,journal,lease,t,'version_metadata',{fileId:artifact.fileId},now);
    } else if(purpose==='version_search') {
      const artifact=t.artifacts[t.index],files=receipt.files;
      if(!Array.isArray(files)||files.length!==1||!validId(files[0].id)||files[0].name!==artifact.name)throw fault('SUPERVISOR_UNCERTAIN_UPLOAD_NOT_UNIQUE');
      artifact.fileId=files[0].id;await metadataOp(ctx,journal,lease,t,'version_metadata',{fileId:artifact.fileId},now);
    } else if(purpose==='version_metadata') {
      const artifact=t.artifacts[t.index];verifyMetadata(receipt.metadata,{fileId:artifact.fileId,mimeType:artifact.mimeType,
        parents:[resources.folder.fileId],permissionsSha256:resources.folder.permissionsSha256});
      await fetchOp(ctx,journal,lease,t,'version_readback',artifact.fileId,now);
    } else if(purpose==='version_readback') {
      const bytes=await receiptBytes(ctx,t,receipt),artifact=t.artifacts[t.index];
      if(bytes.length!==artifact.bytes||digest(bytes)!==artifact.sha256)throw fault('SUPERVISOR_VERSION_READBACK_MISMATCH');
      artifact.readback=await rawArtifact(ctx,t,artifact.slot,bytes);t.index++;await uploadNext(ctx,journal,lease,t,now);
    } else if(purpose==='manifest_merge')await mergeCandidate(ctx,journal,lease,t,await receiptBytes(ctx,t,receipt),now,dependencies);
    else if(purpose==='manifest_before_update') {
      const bytes=await receiptBytes(ctx,t,receipt),base=await readFile(await confined(ctx.stateRoot,t.base.path,false));
      if(!bytes.equals(base)) {
        if(++t.rebases>2)throw fault('SUPERVISOR_MANIFEST_REBASE_EXHAUSTED');
        await mergeCandidate(ctx,journal,lease,t,bytes,now,dependencies);
      } else {
        await op(ctx,journal,lease,t,'manifest_update','google_drive_update_file',{fileId:resources.manifest.fileId,
          file_uri:await confined(ctx.stateRoot,t.candidate.path,false),mime_type:resources.manifest.mimeType},now,
          {write:true,expectedSha256:t.candidate.sha256,expectedBytes:t.candidate.bytes,baselineSha256:t.base.sha256});
      }
    } else if(purpose==='manifest_update') {
      if(receipt.fileId!==resources.manifest.fileId)throw fault('SUPERVISOR_UPLOAD_ID_MISSING');
      await metadataOp(ctx,journal,lease,t,'manifest_after_metadata',resources.manifest,now);
    } else if(purpose==='manifest_after_metadata') {
      verifyMetadata(receipt.metadata,resources.manifest);await fetchOp(ctx,journal,lease,t,'manifest_readback',resources.manifest.fileId,now);
    } else if(purpose==='manifest_readback') {
      const bytes=await receiptBytes(ctx,t,receipt);
      if(bytes.length!==t.candidate.bytes||digest(bytes)!==t.candidate.sha256)throw fault('SUPERVISOR_MANIFEST_READBACK_MISMATCH');
      t.manifestReadback=await rawArtifact(ctx,t,'manifest-confirmed',bytes);t.operation=null;t.phase='health_pending';await save(journal,lease,t,now);
      return await finishHealth(ctx,journal,lease,t,now,dependencies);
    } else throw fault('SUPERVISOR_OPERATION_PURPOSE_INVALID');
    return await publicationHandoff(ctx,id);
  } catch(e) {
    if(t&&t.phase==='active') {
      // Invalid/binding receipts never consume the outstanding operation. After
      // pointer dispatch every failure retains a reconciliation debt.
      if(e.code==='SUPERVISOR_RECEIPT_BINDING_INVALID')throw e;
      t.phase=['manifest_update','manifest_after_metadata','manifest_readback','version_search'].includes(t.operation?.purpose)?'reconciliation_required':'blocked';
      t.code=safeCode(e.code);await save(journal,lease,t,now);
    }
    throw e;
  } finally {await journal.release(lease,now);}
}

async function defaultHealth(ctx,t,now) {
  const config=await readPrivate(ctx.releaseRoot,'config/pages-pwa-public.json'),codes=await readPrivate(ctx.projectRoot,'private-content/reader-codes.json');
  const credentials=liveHealthCredentialsFromStores(config,codes),options={now,fetchImpl:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(45000)})};
  const named=t.kind==='reading'?await verifyLiveReading(credentials,t.readingId,options):null;
  const payload=t.kind==='reading'?await callLiveHealthBridge(credentials,'getReadingPayloads',[credentials.readerCode,[t.readingId]],options):null;
  const health=await verifyLiveHorizon(credentials,options);
  const bootstrap=await callLiveHealthBridge(credentials,'getBootstrapData',[credentials.readerCode],options);
  const commentary=payload?.payloads?.[t.readingId]?.commentary||payload?.payloads?.[t.readingId]?.metadata;
  const payloadBinding=commentary?{contentSha256:commentary.generation?.contentHash,commentaryVersion:commentary.commentaryVersion,
    runtimeSha256:(commentary.verseCommentaries||(commentary.verseCommentary?[commentary.verseCommentary]:[])).map(r=>digest(jsonBytes(r)))}:null;
  return {named,health,preparationStatus:bootstrap.preparationStatus,payloadBinding};
}
async function finishHealth(ctx,journal,lease,t,now,dependencies) {
  // An exact raw manifest is published before health. Failure leaves an honest
  // verification debt; it never rolls a newer remote pointer back to old bytes.
  try {
    const approvalAuthority=await currentApproval(ctx,t,dependencies);
    const proof=await (dependencies.health||defaultHealth)(ctx,t,now),{plan,appConfig}=await checkScope(ctx,t,now);
    measuredBuffer(plan,appConfig,proof.health,now);
    const expected=parsed(await readFile(await confined(ctx.stateRoot,t.candidate.path,false))).preparationStatus;
    const expectedStatus=core.preparationServiceStatus({preparationStatus:expected},{authorId:'dustin'});
    const actualStatus=core.preparationServiceStatus({preparationStatus:proof.preparationStatus},{authorId:'dustin'});
    const visible=Boolean(expectedStatus)&&equal(actualStatus,expectedStatus);
    if(t.kind==='reading'&&(proof.named?.readingId!==t.readingId||proof.named.status!=='ready'||
      (t.component==='henry'||approvalAuthority?.henry)&&proof.named.henryLayerStatus!=='complete'))throw fault('SUPERVISOR_NAMED_HEALTH_FAILED');
    if(t.kind==='reading') {
      const metadata=parsed(await readFile(await confined(ctx.stateRoot,t.artifacts.find(a=>a.slot==='metadata').snapshot,false)));
      const binding={contentSha256:metadata.generation?.contentHash,commentaryVersion:metadata.commentaryVersion,
        runtimeSha256:(metadata.verseCommentaries||(metadata.verseCommentary?[metadata.verseCommentary]:[])).map(r=>digest(jsonBytes(r)))};
      if(!equal(proof.payloadBinding,binding))throw fault('SUPERVISOR_LIVE_PAYLOAD_BINDING_FAILED');
    }
    const local=await readFile(await confined(ctx.projectRoot,'private-content/private-manifest.json',false));
    const original=await readFile(await confined(ctx.stateRoot,t.original.path,false));
    const delivered=await readFile(await confined(ctx.stateRoot,t.manifestReadback.path,false));
    if(!equal(parsed(local),parsed(original))&&!equal(parsed(local),parsed(delivered)))throw fault('SUPERVISOR_LOCAL_MIRROR_CHANGED');
    t.health=await rawArtifact(ctx,t,'health',jsonBytes(proof));t.readerVisible=visible;t.phase='complete';
    t.code=visible?null:'SUPERVISOR_HEARTBEAT_NOT_READER_VISIBLE';
    await durableWrite(ctx.projectRoot,'private-content/private-manifest.json',await readFile(await confined(ctx.stateRoot,t.manifestReadback.path,false)),{immutable:false});
    if(t.kind==='reading') {
      const metadata=t.artifacts.find(a=>a.slot==='metadata');
      const receipt={schemaVersion:t.component==='henry'?'mhc-manager-publication-result/v1':'supervisor-reading-publication-result/v1',
        readingId:t.readingId,status:'published_verified',metadataReadback:'exact_bytes',manifestReadback:'exact_bytes',
        liveReadingStatus:proof.named.status,henryLayerStatus:proof.named.henryLayerStatus,metadataFileId:metadata.fileId,
        payloadSha256:metadata.sha256,transactionId:t.id,healthSha256:t.health.sha256,verifiedAt:new Date(now).toISOString()};
      await durableWrite(ctx.stateRoot,`publications/${t.id}/publication-receipt.json`,jsonBytes(receipt));
      if(t.component==='henry')await durableWrite(ctx.projectRoot,`private-content/automation/staging/${t.readingId}/manager-publication-result.json`,jsonBytes(receipt),{immutable:false});
      if(t.component==='daily'&&approvalAuthority?.henry&&proof.named.henryLayerStatus==='complete') {
        const nativeReceipt={...receipt,schemaVersion:'mhc-manager-publication-result/v1',publicationComponent:'daily',
          approvedSha256:approvalAuthority.henry.approvedSha256,inputSha256:approvalAuthority.henry.inputSha256};
        await durableWrite(ctx.projectRoot,`private-content/automation/staging/${t.readingId}/manager-publication-result.json`,jsonBytes(nativeReceipt),{immutable:false});
        if(dependencies.reconcileDailyHenry)await dependencies.reconcileDailyHenry(ctx,t,nativeReceipt,now);
        else {
          const {verifiedHenryContext}=await import('./service-supervisor-henry.mjs'),binding=await verifiedHenryContext(ctx);
          await binding.runner.withRunnerLock(binding.native,()=>binding.service.reviewWorkOrderV2(binding.native,now));
          const {loadJob}=await import('./mhc-v2-store.mjs'),nativeJob=await loadJob(await confined(binding.native.jobRoot,t.readingId,false));
          if(nativeJob.state.phase!=='published')throw fault('SUPERVISOR_DAILY_HENRY_RECONCILIATION_PENDING');
        }
        await journal.append('daily_henry_publication_verified',{transactionId:t.id,readingId:t.readingId,receiptSha256:digest(jsonBytes(nativeReceipt)),
          approvedSha256:approvalAuthority.henry.approvedSha256,inputSha256:approvalAuthority.henry.inputSha256},now,lease);
      }
    }
    await save(journal,lease,t,now);return publicResult(t);
  } catch(e) {t.phase='health_pending';t.code=safeCode(e.code||'SUPERVISOR_LIVE_HEALTH_FAILED');await save(journal,lease,t,now);return publicResult(t);}
}
export async function retryPublicationHealth(ctx,id,{now=new Date()}={},dependencies={}) {
  requireResources(ctx);const journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('publication',{now,durationMs:10*60*1000});
  try {
    const t=await checkedTransaction(journal,id);compatible(ctx,t);if(t.phase!=='health_pending')throw fault('SUPERVISOR_HEALTH_RETRY_PHASE_INVALID');
    await expectedBytes(ctx,t);await metadataOp(ctx,journal,lease,{...t,phase:'active'},'manifest_after_metadata',requireResources(ctx).manifest,now);
    return await publicationHandoff(ctx,id); // Always reconcile exact remote bytes again before health, never trust old delivery.
  } finally {await journal.release(lease,now);}
}
export async function reconcilePublication(ctx,id,{now=new Date()}={}) {
  const resources=requireResources(ctx),journal=await openJournal(ctx.stateRoot),lease=await journal.acquire('publication',{now,durationMs:10*60*1000});
  try {
    const t=await checkedTransaction(journal,id);compatible(ctx,t);
    if(t.phase!=='reconciliation_required')throw fault('SUPERVISOR_RECONCILIATION_PHASE_INVALID');
    await expectedBytes(ctx,t);t.phase='active';
    if(['manifest_update','manifest_after_metadata','manifest_readback'].includes(t.operation?.purpose))
      await metadataOp(ctx,journal,lease,t,'manifest_after_metadata',resources.manifest,now);
    else if(['version_upload','version_search'].includes(t.operation?.purpose)) {
      const artifact=t.artifacts[t.index];
      await op(ctx,journal,lease,t,'version_search','google_drive_search',{special_filter_query_str:
        `'${resources.folder.fileId}' in parents and name = '${artifact.name}' and trashed = false`,topn:3,best_effort_fetch:false},now);
    } else throw fault('SUPERVISOR_RECONCILIATION_PHASE_INVALID');
    return await publicationHandoff(ctx,id);
  } finally {await journal.release(lease,now);}
}
export async function pendingPublication(ctx) {
  const journal=await openJournal(ctx.stateRoot),pending=[...states(await journal.load()).values()].filter(t=>!terminal.has(t.phase));
  if(pending.length>1)throw fault('SUPERVISOR_MULTIPLE_PUBLICATIONS_PENDING');
  return pending[0]?publicationHandoff(ctx,pending[0].id):null;
}
export async function materializePublicationReceipt(ctx,id,nativeResultPath) {
  requireResources(ctx);const journal=await openJournal(ctx.stateRoot),t=await checkedTransaction(journal,id);compatible(ctx,t);
  if(t.phase!=='active'||!t.operation?.dispatched)throw fault('SUPERVISOR_RECEIPT_BINDING_INVALID');
  if(!nativeResultPath.startsWith(`publications/${id}/connector-results/`))throw fault('SUPERVISOR_CONNECTOR_RESULT_PATH_INVALID');
  const bytes=await readFile(await confined(ctx.stateRoot,t.operation.path,false));
  if(digest(bytes)!==t.operation.sha256)throw fault('SUPERVISOR_OPERATION_CHANGED');
  const {connectorReceipt}=await import('./service-supervisor-connector.mjs');
  const receipt=await connectorReceipt(await readPrivate(ctx.stateRoot,nativeResultPath),parsed(bytes),{
    operationSha256:t.operation.sha256,dispatchEpoch:t.operation.dispatchEpoch,
    downloadRoot:await confined(ctx.stateRoot,`publications/${id}/downloads`)});
  const relative=`publications/${id}/materialized-receipts/${t.ordinal}.json`;
  await durableWrite(ctx.stateRoot,relative,jsonBytes(receipt));
  return {transactionId:id,receiptPath:relative,receiptSha256:digest(jsonBytes(receipt)),published:false};
}
