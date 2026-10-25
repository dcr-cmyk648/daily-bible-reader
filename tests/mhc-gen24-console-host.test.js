import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {evaluateGen24Owners} from '../scripts/lib/mhc-gen24-recovery.mjs';

// Pure fabricated process/CIM evidence. No filesystem, native process, provider
// or clock execution is needed; Windows path semantics also run on Linux CI.
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
  const used=new Set([process.pid,process.ppid]);let n=990000;const allocate=()=>{while(used.has(++n)){}used.add(n);return n;};
  const shell=allocate(),inspector=allocate(),host=allocate(),other=allocate(),projectRoot=path.join(os.tmpdir(),'FABRICATED_GEN24_OWNER_PROJECT'),runtimeRoot=path.join(projectRoot,'private-content/automation/mhc-runtime'),releaseRoot=path.join(runtimeRoot,'FABRICATED_RELEASE'),ctx={projectRoot,runtimeRoot,releaseRoot,launcher:path.join(runtimeRoot,'launcher.mjs')};
  const windows='C:\\FABRICATED_WINDOWS',imagePath=windows+'\\System32\\conhost.exe',born='2026-01-01T00:00:10.000Z';
  const row=(pid,parent_pid,name,command_line,created_at=born)=>({pid,parent_pid,name,command_line,created_at});
  const rows=[row(shell,0,'pwsh.exe',`pwsh -Command node "${ctx.launcher}"`,'2026-01-01T00:00:00.000Z'),row(process.ppid,shell,'node.exe',`node "${ctx.launcher}"`,'2026-01-01T00:00:05.000Z'),row(process.pid,process.ppid,'node.exe',`node "${path.join(releaseRoot,'scripts/mhc-native-runner.mjs')}"`),row(inspector,process.pid,'powershell.exe','FABRICATED CIM INSPECTOR','2026-01-01T00:00:12.000Z'),{...row(host,process.pid,'conhost.exe',`\\??\\${imagePath} 0x4`,'2026-01-01T00:00:10.004Z'),executable_path:imagePath}];
  const image={windows_directory:windows,path:imagePath,path_no_reparse_points:true,stable_file:true,sha256:'b'.repeat(64),bytes:12345,last_write_utc:'2025-01-01T00:00:00.000Z',signature_status:'Valid',signature_type:'Catalog',is_os_binary:true,signer_name:'Microsoft Windows',microsoft_organization:true};
  return {ctx,shell,inspector,host,other,imagePath,image,data:{inspector_pid:inspector,first:structuredClone(rows),second:structuredClone(rows),first_console_host_image:structuredClone(image),second_console_host_image:structuredClone(image)}};
}
const inspect=f=>evaluateGen24Owners(f.ctx,f.data),hostRow=(f,rows)=>rows.find(r=>r.pid===f.host);
function blocked(f){let result;try{result=inspect(f);}catch(e){assert.match(e.message,/V2_GEN24_RECOVERY_OWNER_UNVERIFIABLE/);return;}assert.equal(result.quiescent,false);}

test('verified startup console host belongs only to the strict native invocation and hashes binary bytes separately from path text',()=>{
  const f=fixture(),result=inspect(f);assert.equal(result.quiescent,true);assert.equal(result.unknown,false);assert.equal(result.observed_race,false);assert.deepEqual(result.processes,[]);assert.equal(result.console_hosts.length,1);
  assert.equal(result.console_hosts[0].image_sha256,f.image.sha256);assert.equal(result.console_hosts[0].executable_path_sha256,sha(f.imagePath));assert.notEqual(result.console_hosts[0].image_sha256,result.console_hosts[0].executable_path_sha256);
  assert.ok(!JSON.stringify(result).includes(f.imagePath));assert.ok(!JSON.stringify(result).includes(f.ctx.projectRoot));
});
for(const prefix of ['', '\\??\\','\\\\?\\'])for(const quoted of [false,true])test(`exact console image token supports native prefix ${JSON.stringify(prefix)}, quoted=${quoted}`,()=>{
  const f=fixture();for(const rows of [f.data.first,f.data.second])hostRow(f,rows).command_line=`${quoted?'"':''}${prefix}${f.imagePath}${quoted?'"':''} 0x4`;assert.equal(inspect(f).quiescent,true);
});
test('verified Windows Publisher OS identity and Authenticode signature are supported',()=>{const f=fixture();for(const image of [f.data.first_console_host_image,f.data.second_console_host_image]){image.signer_name='Microsoft Windows Publisher';image.signature_type='Authenticode';}assert.equal(inspect(f).quiescent,true);});
for(const [key,value] of [['path_no_reparse_points',false],['stable_file',false],['signature_status','UnknownError'],['signature_status','Valid\n'],['signature_type','None'],['is_os_binary',false],['signer_name','Microsoft Corporation'],['signer_name','Microsoft Windows Evil'],['microsoft_organization',false],['sha256',null],['sha256','b'.repeat(64)+'\n'],['sha256','B'.repeat(64)],['bytes',0],['bytes',1.5],['last_write_utc','FABRICATED invalid date'],['windows_directory','C:\\FABRICATED_WINDOWS\\..\\FABRICATED_WINDOWS'],['windows_directory','\\\\FABRICATED_SERVER\\Windows'],['path','C:\\FABRICATED_SPOOF\\conhost.exe']])test(`untrusted console image ${key}=${JSON.stringify(value)} is blocked`,()=>{
  const f=fixture();for(const image of [f.data.first_console_host_image,f.data.second_console_host_image])image[key]=value;blocked(f);
});
for(const mode of ['missing_image','missing_field','missing_executable','spoof_executable','aliased_executable','alternate_stream','older_than_runner','late_host','after_inspector','unreadable_command','wrong_image_token','headless','client_program','extra_argument','newline','invalid_handle','zero_handle','oversized_handle','two_hosts','descendant','opaque_descendant','non_console_child'])test(`console host ${mode} cannot acquire an invocation exemption`,()=>{
  const f=fixture();for(const [rows,imageKey] of [[f.data.first,'first_console_host_image'],[f.data.second,'second_console_host_image']]){const host=hostRow(f,rows);
    if(mode==='missing_image')delete f.data[imageKey];
    if(mode==='missing_field')delete f.data[imageKey].signature_status;
    if(mode==='missing_executable')delete host.executable_path;
    if(mode==='spoof_executable')host.executable_path='C:\\FABRICATED_SPOOF\\conhost.exe';
    if(mode==='aliased_executable')host.executable_path=f.imagePath.replace('\\System32\\','\\System32\\..\\System32\\');
    if(mode==='alternate_stream')host.executable_path=f.imagePath+':FABRICATED';
    if(mode==='older_than_runner')host.created_at='2026-01-01T00:00:09.999Z';
    if(mode==='late_host')host.created_at='2026-01-01T00:00:11.001Z';
    if(mode==='after_inspector'){host.created_at='2026-01-01T00:00:10.500Z';rows.find(r=>r.pid===f.inspector).created_at='2026-01-01T00:00:10.100Z';}
    if(mode==='unreadable_command')host.command_line=null;
    if(mode==='wrong_image_token')host.command_line='C:\\FABRICATED_SPOOF\\conhost.exe 0x4';
    if(mode==='headless')host.command_line=`${f.imagePath} --headless`;
    if(mode==='client_program')host.command_line=`${f.imagePath} --headless cmd.exe`;
    if(mode==='extra_argument')host.command_line+=' FABRICATED';
    if(mode==='newline')host.command_line+='\n';
    if(mode==='invalid_handle')host.command_line=`${f.imagePath} 0xG`;
    if(mode==='zero_handle')host.command_line=`${f.imagePath} 0x0`;
    if(mode==='oversized_handle')host.command_line=`${f.imagePath} 0x${'f'.repeat(17)}`;
    if(mode==='two_hosts')rows.push({...host,pid:f.other});
    if(['descendant','opaque_descendant'].includes(mode))rows.push({pid:f.other,parent_pid:f.host,name:'codex.exe',command_line:mode==='descendant'?'FABRICATED child':null,created_at:'2026-01-01T00:00:10.500Z'});
    if(mode==='non_console_child')host.name='cmd.exe';
  }blocked(f);
});
for(const mode of ['parent','creation','command','image_path','binary_hash','image_size','image_last_write','signature','host_disappears','host_appears'])test(`console observation race ${mode} remains blocked and unknown`,()=>{
  const f=fixture(),row=hostRow(f,f.data.second);
  if(mode==='parent')row.parent_pid=f.shell;
  if(mode==='creation')row.created_at='2026-01-01T00:00:10.005Z';
  if(mode==='command')row.command_line=`${f.imagePath} 0x8`;
  if(mode==='image_path')row.executable_path=row.executable_path.toLowerCase();
  if(mode==='binary_hash')f.data.second_console_host_image.sha256='c'.repeat(64);
  if(mode==='image_size')f.data.second_console_host_image.bytes++;
  if(mode==='image_last_write')f.data.second_console_host_image.last_write_utc='2025-01-02T00:00:00.000Z';
  if(mode==='signature')f.data.second_console_host_image.signature_type='Authenticode';
  if(mode==='host_disappears')f.data.second=f.data.second.filter(r=>r.pid!==f.host);
  if(mode==='host_appears')f.data.first=f.data.first.filter(r=>r.pid!==f.host);
  const result=inspect(f);assert.equal(result.quiescent,false);assert.equal(result.unknown,true);assert.equal(result.observed_race,true);
});
for(const mode of ['hidden_shell','wrong_launcher','opaque_sibling','critical_sibling','extra_child','protected_history','critical_race'])test(`console recognition preserves ${mode} owner barrier`,()=>{
  const f=fixture();for(const rows of [f.data.first,f.data.second]){
    if(mode==='hidden_shell')rows.find(r=>r.pid===f.shell).command_line=null;
    if(mode==='wrong_launcher')rows.find(r=>r.pid===process.ppid).command_line='FABRICATED different launcher';
    if(mode==='opaque_sibling'||mode==='critical_sibling')rows.push({pid:f.other,parent_pid:f.shell,name:'node.exe',command_line:mode==='opaque_sibling'?null:'FABRICATED opaque sibling',created_at:'2026-01-01T00:00:10.000Z'});
    if(mode==='extra_child')rows.push({pid:f.other,parent_pid:process.pid,name:'cmd.exe',command_line:'FABRICATED extra child',created_at:'2026-01-01T00:00:10.000Z'});
    if(mode==='protected_history')rows.push({pid:f.other,parent_pid:0,name:'pwsh.exe',command_line:`FABRICATED ${path.join(f.ctx.projectRoot,'private-content/automation/mhc-v2/LTP-0009-GEN-004')}`,created_at:'2026-01-01T00:00:10.000Z'});
  }
  if(mode==='critical_race')f.data.second.push({pid:f.other,parent_pid:0,name:'node.exe',command_line:'FABRICATED unrelated critical process appeared',created_at:'2026-01-01T00:00:10.000Z'});blocked(f);
});
