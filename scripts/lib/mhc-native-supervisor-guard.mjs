import {lstat,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {assertCanonicalPath} from './mhc-native-paths.mjs';
import {digest,jsonBytes} from './service-supervisor-store.mjs';

export const nativeSourceGuardVersion='native-source-exclusion/v1';

const phases=new Set(['ready','dispatched','captured','prepared','complete','failed']);
const terminal=new Set(['complete','failed']);
const blocked=code=>Object.assign(new Error(code),{code,stage:'native_source_exclusion'});

// Read the canonical peer journal without its mkdir/lock/append constructor.
// Only genuine absence of the supervisor directory permits standalone use.
export async function assertNativeWriterAllowed({projectRoot,runtimeRoot}={}) {
  if(!projectRoot&&runtimeRoot&&path.basename(runtimeRoot)==='mhc-runtime'&&
    path.basename(path.dirname(runtimeRoot))==='automation'&&path.basename(path.dirname(path.dirname(runtimeRoot)))==='private-content')
    projectRoot=path.resolve(runtimeRoot,'../../..');
  if(!projectRoot)return; // Standalone lock users have no canonical project binding.
  const supervisorRoot=path.join(projectRoot,'private-content/automation/service-supervisor');
  let transactions;
  try {
    await assertCanonicalPath(projectRoot,supervisorRoot,{allowMissing:true});
    const supervisor=await lstat(supervisorRoot).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!supervisor)return;
    if(!supervisor.isDirectory())throw Error('Invalid supervisor directory');
    const stateRoot=await assertCanonicalPath(projectRoot,path.join(supervisorRoot,'state'));
    const eventsRoot=await assertCanonicalPath(projectRoot,path.join(stateRoot,'events'));
    const names=(await readdir(eventsRoot)).sort();
    if(names.some(name=>!/^\d{9}\.json(?:\.tmp-[a-f0-9]{32})?$/.test(name)))throw Error('Invalid event file');
    const committed=names.filter(name=>/^\d{9}\.json$/.test(name));
    transactions=new Map();let previous='0'.repeat(64);
    for(const [index,name] of committed.entries()) {
      const file=await assertCanonicalPath(projectRoot,path.join(eventsRoot,name));
      if(!(await lstat(file)).isFile())throw Error('Invalid event entry');
      const event=JSON.parse(await readFile(file,'utf8')),{sha256,...body}=event;
      if(name!==`${String(index+1).padStart(9,'0')}.json`||body.schemaVersion!=='service-supervisor-event/v1'||
        body.sequence!==index+1||body.previous!==previous||digest(jsonBytes(body))!==sha256||
        !/^[a-z][a-z_]{1,63}$/.test(body.kind)||!Number.isFinite(Date.parse(body.at))||
        !body.data||typeof body.data!=='object'||Array.isArray(body.data))throw Error('Invalid event chain');
      previous=sha256;
      if(body.kind==='native_source_state') {
        const transaction=body.data.transaction;
        if(!transaction||transaction.schemaVersion!=='native-source-transaction/v1'||
          !/^[a-f0-9]{32}$/.test(transaction.id)||!/^[a-f0-9]{32}$/.test(transaction.jobId)||
          !/^[a-f0-9]{32}$/.test(transaction.executionId)||!phases.has(transaction.phase)||
          !transaction.receipt||typeof transaction.receipt.path!=='string'||path.isAbsolute(transaction.receipt.path)||
          transaction.receipt.path.split(/[\\/]/).some(part=>part==='..'||part==='')||!/^[a-f0-9]{64}$/.test(transaction.receipt.sha256)||
          !Number.isSafeInteger(transaction.cursor)||!Number.isSafeInteger(transaction.totalSources)||
          transaction.cursor<0||transaction.totalSources<0||transaction.cursor>transaction.totalSources)throw Error('Invalid source transaction');
        transactions.set(transaction.id,transaction.phase);
      }
    }
    if(JSON.stringify((await readdir(eventsRoot)).sort())!==JSON.stringify(names))throw Error('Journal changed during read');
  } catch {throw blocked('V2_SUPERVISOR_JOURNAL_UNVERIFIABLE');}
  // Check each transaction: another terminal transaction cannot hide a pending one.
  if([...transactions.values()].some(phase=>!terminal.has(phase)))throw blocked('V2_NATIVE_SOURCE_TRANSACTION_PENDING');
}
