import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {gen24OwnerInspectionScript} from '../scripts/lib/mhc-gen24-recovery.mjs';

const literal=s=>"'"+s.replaceAll("'","''")+"'",sha=b=>createHash('sha256').update(b).digest('hex');
const source=gen24OwnerInspectionScript(),bootstrap=source.slice(0,source.indexOf('function Get-Gen24Processes')),imageHelper=source.slice(source.indexOf('function Get-Gen24ConsoleImage'),source.indexOf('$gen24First=@('));
test('native dependency bootstrap has no environment/policy mutation or ambient hash/signature invocation',()=>{
  assert.ok(bootstrap.includes('Microsoft.PowerShell.Core\\Import-Module -Name $manifest'));
  assert.ok(bootstrap.includes('$command.ScriptBlock.File'));assert.ok(bootstrap.includes('$command.ImplementingType.Assembly'));
  assert.ok(imageHelper.includes("& (Get-Gen24BoundNativeCommand 'hash')"));assert.ok(imageHelper.includes("& (Get-Gen24BoundNativeCommand 'signature')"));
  assert.doesNotMatch(source,/\$env:PSModulePath\s*=|Set-ExecutionPolicy|ExecutionPolicy Bypass|Import-Module -Name ['"]Microsoft\.PowerShell/);
});

// Linux CI retains the portable evaluator suite. Windows-only qualification is
// one explicit skip on Linux; on Windows each subcase launches a fresh PS5.1
// process directly from Node. No JSON, mock or dependency warm-up precedes the
// production bootstrap. Only controlled private shadows and native modules enter
// this child's module path. No native runner/diagnose/recovery command is invoked.
test('cold Node to Windows PowerShell 5.1 dependency qualification',{skip:process.platform!=='win32',timeout:120000},async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'gen24-native-modules-FABRICATED-')),parentModulePath=process.env.PSModulePath;
  t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));assert.match(path.basename(root),/^gen24-native-modules-FABRICATED-/);await rm(root,{recursive:true,force:true});});
  const shadows=path.join(root,'shadows'),spoofs=path.join(root,'spoofs'),marker=path.join(root,'shadow-loaded.txt'),called=path.join(root,'shadow-command-called.txt'),files=[];
  async function module(base,name,kind){
    const dir=path.join(base,name);await mkdir(dir,{recursive:true});const psd=path.join(dir,name+'.psd1'),psm=path.join(dir,name+'.psm1');
    const command=name.endsWith('Utility')?'Get-FileHash':'Get-AuthenticodeSignature';
    const text=kind==='absent'?`[IO.File]::AppendAllText(${literal(marker)},'controlled-shadow-loaded;')\nMicrosoft.PowerShell.Core\\Export-ModuleMember -Function @()`:`function ${command} { [IO.File]::AppendAllText(${literal(called)},'UNSAFE-CALL;');throw 'FABRICATED_SHADOW_COMMAND_EXECUTED' }\nMicrosoft.PowerShell.Core\\Export-ModuleMember -Function ${literal(command)}`;
    // Data-only shadows load under the existing execution policy. Advertised
    // exports are absent; no unsigned fixture script is executed or bypassed.
    const manifest=`@{ModuleVersion='7.0.0.0';GUID='00000000-0000-4000-8000-000000000007';FunctionsToExport=@(${literal(command)});CmdletsToExport=@();AliasesToExport=@()${kind==='broken_types'?";TypesToProcess=@('FABRICATED-MISSING.types.ps1xml')":''}}`;
    await writeFile(psd,manifest);await writeFile(psm,text);files.push({path:psd,hash:sha(manifest)},{path:psm,hash:sha(text)});return psd;
  }
  await module(shadows,'Microsoft.PowerShell.Utility','absent');await module(shadows,'Microsoft.PowerShell.Security','broken_types');
  const spoofUtility=await module(spoofs,'Microsoft.PowerShell.Utility','spoof'),spoofSecurity=await module(spoofs,'Microsoft.PowerShell.Security','spoof');
  const nativeModules=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules'),env={...process.env,PSModulePath:shadows+';'+nativeModules};
  function run(program){const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',program],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2*1024*1024,env});assert.equal(r.error,undefined);return r;}
  const block=body=>`$ErrorActionPreference='Stop';try{${body}\n[Console]::WriteLine('UNEXPECTED_PASS')}catch{[Console]::WriteLine('BLOCK|'+$_.FullyQualifiedErrorId+'|'+$_.Exception.Message)}`;
  function expectBlock(program,reason=/GEN24_NATIVE_/){const r=run(program);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/BLOCK\|/);assert.match(r.stdout,reason);assert.doesNotMatch(r.stdout,/UNEXPECTED_PASS/);assert.equal(existsSync(called),false);}
  await t.test('old cold path reproduces unavailable Get-FileHash',()=>{
    const r=run(block("Get-FileHash -LiteralPath ([IO.Path]::Combine([Environment]::GetFolderPath('Windows'),'System32','conhost.exe')) -Algorithm SHA256")+"\n$m=Microsoft.PowerShell.Core\\Get-Module Microsoft.PowerShell.Utility;[Console]::WriteLine('VERSION|'+$m.Version);[Console]::WriteLine('MODULE|'+$m.Path)");assert.equal(r.status,0);assert.match(r.stdout,/BLOCK\|.*CommandNotFound/);assert.match(r.stdout,/VERSION\|7\.0\.0\.0/);assert.ok(r.stdout.toLowerCase().includes(path.win32.join(shadows,'Microsoft.PowerShell.Utility','Microsoft.PowerShell.Utility.psd1').toLowerCase()));assert.equal(existsSync(marker),false);
  });
  await t.test('Utility alone leaves signature autoload blocked',()=>{
    const r=run(block("Microsoft.PowerShell.Core\\Import-Module -Name ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop\nGet-AuthenticodeSignature -LiteralPath ([IO.Path]::Combine([Environment]::GetFolderPath('Windows'),'System32','conhost.exe'))")+"\n$candidates=@(Microsoft.PowerShell.Core\\Get-Module -ListAvailable Microsoft.PowerShell.Security);[Console]::WriteLine('MODULE|'+$candidates[0].Path)");assert.equal(r.status,0);assert.match(r.stdout,/BLOCK\|.*CouldNotAutoloadMatchingModule/);assert.match(r.stdout,/Get-AuthenticodeSignature/);assert.ok(r.stdout.toLowerCase().includes(path.win32.join(shadows,'Microsoft.PowerShell.Security','Microsoft.PowerShell.Security.psd1').toLowerCase()));
  });
  await t.test('corrected exact bootstrap binds native origins and real read-only image evidence',()=>{
    const program=bootstrap+imageHelper+`
$rows=@([pscustomobject]@{pid=$PID;parent_pid=1;name='powershell.exe'},[pscustomobject]@{pid=2;parent_pid=1;name='conhost.exe'})
$image=Get-Gen24ConsoleImage $rows
$origins=@(foreach($key in @('hash','signature','json')){$b=$script:Gen24NativeBindings[$key];[pscustomobject]@{key=$key;module=$b.spec.module;version=$b.spec.version;manifest=$b.spec.manifest;origin=$b.origin;type=$b.command.CommandType.ToString()}})
[pscustomobject]@{scope='metadata only, fabricated eligibility, real image; no native diagnosis';image=$image;origins=$origins;home=$script:Gen24NativeHome;powershell_version=$PSVersionTable.PSVersion.ToString()} | & (Get-Gen24BoundNativeCommand 'json') -Depth 5 -Compress`;
    const r=run(program);assert.equal(r.status,0,r.stderr);const q=JSON.parse(r.stdout);assert.ok(q.image);assert.equal(q.image.signature_status,'Valid');assert.equal(q.image.is_os_binary,true);assert.equal(q.image.microsoft_organization,true);assert.match(q.image.sha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(q.origins.map(x=>[x.key,x.version,x.type]),[['hash','3.1.0.0','Function'],['signature','3.0.0.0','Cmdlet'],['json','3.1.0.0','Cmdlet']]);
    for(const origin of q.origins)assert.equal(origin.manifest.toLowerCase(),path.win32.join(q.home,'Modules',origin.module,origin.module+'.psd1').toLowerCase());
    assert.equal(q.origins[0].origin.toLowerCase(),path.win32.join(q.home,'Modules','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Utility.psm1').toLowerCase());
    assert.ok(q.powershell_version.startsWith('5.1.'));t.diagnostic(JSON.stringify({coldNodePs51:true,powershellVersion:q.powershell_version,controlledVersion7Shadows:true,verifiedNativeOrigins:3,realImageSignature:q.image.signature_status,nativeDiagnosis:false}));
  });
  for(const name of ['Utility','Security']){
    await t.test(`missing native ${name} manifest fails closed`,()=>{
      const altered=bootstrap.replace(`module='Microsoft.PowerShell.${name}';commands=`,`module='Microsoft.PowerShell.${name}.FABRICATED_MISSING';commands=`);assert.notEqual(altered,bootstrap);expectBlock(block(altered),/GetAttributes|GEN24_NATIVE_PATH/);
    });
    await t.test(`failed native ${name} import fails closed`,()=>{
      const anchor='$loaded=@(Microsoft.PowerShell.Core\\Import-Module -Name $manifest -PassThru -ErrorAction Stop)',altered=bootstrap.replace(anchor,`if($dependency.module -eq 'Microsoft.PowerShell.${name}'){throw 'FABRICATED_NATIVE_IMPORT_FAILURE'}\n${anchor}`);assert.notEqual(altered,bootstrap);expectBlock(block(altered),/FABRICATED_NATIVE_IMPORT_FAILURE/);
    });
  }
  for(const [label,command] of [['hash','Get-FileHash'],['signature','Get-AuthenticodeSignature']]){
    await t.test(`missing native ${label} export fails closed`,()=>{const altered=bootstrap.replace(`name='${command}'`,`name='FABRICATED_MISSING_${command}'`);assert.notEqual(altered,bootstrap);expectBlock(block(altered),/FABRICATED_MISSING_/);});
    await t.test(`post-binding ambient ${label} replacement never executes`,()=>expectBlock(block(bootstrap+`\nfunction ${command} { [IO.File]::AppendAllText(${literal(called)},'UNSAFE-CALL;');throw 'FABRICATED' }\n& (Get-Gen24BoundNativeCommand '${label}') -LiteralPath 'FABRICATED'`)));
    await t.test(`same Source name from a fabricated module cannot replace trusted ${label} command`,()=>expectBlock(block(bootstrap+`\n$fake=Microsoft.PowerShell.Core\\New-Module -Name '${label==='hash'?'Microsoft.PowerShell.Utility':'Microsoft.PowerShell.Security'}' -ScriptBlock { function ${command} { [IO.File]::AppendAllText(${literal(called)},'UNSAFE-CALL;');throw 'FABRICATED' };Microsoft.PowerShell.Core\\Export-ModuleMember -Function '${command}' };Microsoft.PowerShell.Core\\Import-Module $fake -Force\n& (Get-Gen24BoundNativeCommand '${label}') -LiteralPath 'FABRICATED'`)));
  }
  await t.test('changed stored command definition fails closed',()=>expectBlock(block(bootstrap+"\n$script:Gen24NativeBindings['hash'].definition='FABRICATED_CHANGED_DEFINITION'\nGet-Gen24BoundNativeCommand 'hash'"),/GEN24_NATIVE_BINDING_CHANGED/));
  for(const [label,mutation] of [['manifest path',`$script:Gen24NativeBindings['hash'].spec.manifest=${literal(spoofUtility)}`],['module version',"$script:Gen24NativeBindings['hash'].spec.version='7.0.0.0'"],['module root',`$script:Gen24NativeHome=${literal(root)}`]])await t.test(`spoofed ${label} binding metadata fails closed`,()=>expectBlock(block(bootstrap+'\n'+mutation+"\n& (Get-Gen24BoundNativeCommand 'hash') -LiteralPath 'FABRICATED'")));
  await t.test('Source strings on a non-CommandInfo object are not proof',()=>expectBlock(block(bootstrap+"\n$fake=[pscustomobject]@{CommandType='Function';ModuleName='Microsoft.PowerShell.Utility';Module=$script:Gen24NativeBindings['hash'].command.Module}\nGet-Gen24CommandOrigin $fake $script:Gen24NativeBindings['hash'].spec")));
  assert.equal(existsSync(marker),false);assert.equal(existsSync(called),false);assert.equal(process.env.PSModulePath,parentModulePath);
  for(const f of files)assert.equal(sha(await readFile(f.path)),f.hash,'Controlled user module was modified');
});
