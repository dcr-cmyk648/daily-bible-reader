import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeLaunchOutput} from '../scripts/lib/mhc-native-launch-result.mjs';

for(const code of ['EPERM','ENOENT'])test(`launcher exposes fabricated ${code} as stdout-only typed failure without private diagnostics`,()=>{
  const output=nativeLaunchOutput({status:null,signal:null,error:Object.assign(new Error('FABRICATED PRIVATE command/environment'),{code,spawnargs:['FABRICATED PRIVATE arguments']}),stdout:'FABRICATED PRIVATE child output',stderr:'FABRICATED PRIVATE child error'});
  const result=JSON.parse(output.stdout);
  assert.equal(output.exitCode,1);assert.equal(output.stderr,'');assert.equal(result.action,'launch_failed');assert.equal(result.state,'blocked');
  assert.equal(result.stage,'runtime_launch');assert.equal(result.code,'MHC_NATIVE_CHILD_SPAWN_FAILED');assert.equal(result.spawnErrorCode,code);
  assert.equal(result.exitStatus,null);assert.equal(result.signal,null);assert.equal(result.dispatchOutcome,'unverified');
  assert.ok(!output.stdout.includes('FABRICATED PRIVATE'));
});
test('signal termination remains visible without claiming no dispatch or emitting interrupted child bytes',()=>{
  const output=nativeLaunchOutput({status:null,signal:'SIGTERM',stdout:'FABRICATED PRIVATE interrupted result',stderr:'FABRICATED PRIVATE error'}),result=JSON.parse(output.stdout);
  assert.equal(output.exitCode,1);assert.equal(output.stderr,'');assert.equal(result.code,'MHC_NATIVE_CHILD_SIGNALLED');assert.equal(result.signal,'SIGTERM');
  assert.equal(result.exitStatus,null);assert.equal(result.spawnErrorCode,null);assert.equal(result.dispatchOutcome,'unverified');assert.ok(!output.stdout.includes('FABRICATED PRIVATE'));
});
test('normal structured no-work and controller failure results pass through with their actual status and bytes',()=>{
  for(const [status,result]of [[0,{action:'none',state:'forward_preparation_pending'}],[1,{action:'none',state:'blocked',code:'V2_CONTROLLER_FAILURE'}]]){
    const stdout=JSON.stringify(result)+'\n',stderr='FABRICATED ordinary diagnostic\n';
    assert.deepEqual(nativeLaunchOutput({status,signal:null,stdout,stderr}),{stdout,stderr,exitCode:status});
  }
});
test('missing status and a silent nonzero exit are typed failures; arbitrary codes and signals cannot leak strings',()=>{
  const missing=JSON.parse(nativeLaunchOutput({status:null,signal:null}).stdout);assert.equal(missing.code,'MHC_NATIVE_CHILD_STATUS_MISSING');
  const silent=JSON.parse(nativeLaunchOutput({status:7,signal:null,stdout:'',stderr:''}).stdout);assert.equal(silent.code,'MHC_NATIVE_CHILD_EXITED_WITHOUT_RESULT');assert.equal(silent.exitStatus,7);
  const unknown=JSON.parse(nativeLaunchOutput({status:null,error:{code:'FABRICATED PRIVATE code'},signal:'FABRICATED PRIVATE signal'}).stdout);
  assert.equal(unknown.spawnErrorCode,'UNKNOWN');assert.equal(unknown.signal,'UNKNOWN');assert.ok(!JSON.stringify(unknown).includes('FABRICATED PRIVATE'));
});
