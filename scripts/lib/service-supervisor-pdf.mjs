import {spawn} from 'node:child_process';
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertCanonicalPath} from './mhc-native-paths.mjs';
import {digest,fault} from './service-supervisor-store.mjs';

export const PDF_VERSION='6.10.0',PDF_PACKAGE_SHA='47b3f5a16613a2a7898e649f1dcd1a08a9069b2118bc460efb17b9fa8d407476';
export const PDF_LIMITS=Object.freeze({bytes:2*1024*1024,pages:32,decodedBytes:4*1024*1024,textBytes:512*1024,outputBytes:1024*1024,timeoutMs:5000});
const script=fileURLToPath(new URL('./service-supervisor-pdf-extractor.py',import.meta.url));
export async function extractSourcePdf(bytes,binding,{deadline=Date.now()+PDF_LIMITS.timeoutMs,signal}={}) {
  if(!binding||!path.isAbsolute(binding.pythonExecutable)||binding.pypdfVersion!==PDF_VERSION||binding.packageSha256!==PDF_PACKAGE_SHA||
    !/^[a-f0-9]{64}$/.test(binding.executableSha256)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>PDF_LIMITS.bytes||
    !bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw fault('SUPERVISOR_SOURCE_PDF_CONFIGURATION_OR_INPUT_INVALID');
  try {
    await assertCanonicalPath(path.parse(binding.pythonExecutable).root,binding.pythonExecutable);
    if(!(await lstat(binding.pythonExecutable)).isFile()||digest(await readFile(binding.pythonExecutable))!==binding.executableSha256)
      throw fault('SUPERVISOR_SOURCE_PDF_EXECUTABLE_CHANGED');
  } catch {throw fault('SUPERVISOR_SOURCE_PDF_EXECUTABLE_CHANGED');}
  const remaining=Math.min(PDF_LIMITS.timeoutMs,deadline-Date.now());
  if(remaining<=0||signal?.aborted)throw fault('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT');
  // Isolated Python omits cwd/user site and secrets. Only the Windows loader's
  // system directory is supplied. No shell, raw file or external PDF decoder.
  const env=process.platform==='win32'?{SystemRoot:process.env.SystemRoot||process.env.SYSTEMROOT,WINDIR:process.env.WINDIR}:{};
  // -B prevents writes but alone still reads existing .pyc files. An absent
  // prefix forces source loading, so the verified .py tree is the parsed code.
  const cachePrefix=path.join(path.dirname(script),'.pdf-no-bytecode');
  try{await lstat(cachePrefix);throw fault('SUPERVISOR_SOURCE_PDF_BYTECODE_REFUSED');}
  catch(error){if(error.code!=='ENOENT')throw fault('SUPERVISOR_SOURCE_PDF_BYTECODE_REFUSED');}
  const output=await boundedPdfProcess(binding.pythonExecutable,['-I','-B','-X',`pycache_prefix=${cachePrefix}`,script],bytes,{remaining,signal,env});
  let result;try{result=JSON.parse(output);}catch{throw fault('SUPERVISOR_SOURCE_PDF_EXTRACTION_FAILED');}
  if(result.status!=='ok')throw fault('SUPERVISOR_SOURCE_PDF_EXTRACTION_FAILED');
  if(typeof result.text!=='string'||!result.text.trim()||Buffer.byteLength(result.text)>PDF_LIMITS.textBytes||result.method!=='pypdf-plain/v1'||
    result.version!==PDF_VERSION||result.packageSha256!==PDF_PACKAGE_SHA||!Number.isSafeInteger(result.pages)||result.pages<1||result.pages>PDF_LIMITS.pages||
    !Number.isSafeInteger(result.decodedBytes)||result.decodedBytes<0||result.decodedBytes>PDF_LIMITS.decodedBytes||
    result.extractedTextSha256!==digest(Buffer.from(result.text)))throw fault('SUPERVISOR_SOURCE_PDF_PROOF_INVALID');
  const {text,status,...extraction}=result;
  return {text,extraction:{...extraction,pythonExecutableSha256:binding.executableSha256,extractorSha256:digest(await readFile(script)),limits:PDF_LIMITS}};
}
// Separate bounded transport permits local tests with a harmless Node process;
// production extraction calls it only after executable/configuration checks.
export async function boundedPdfProcess(executable,args,bytes,{remaining=PDF_LIMITS.timeoutMs,signal,env={}}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{env,cwd:path.dirname(script),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    let chunks=[],count=0,stderr=0,failure=null;
    const stop=code=>{failure ||= fault(code);child.kill();};
    const cancel=()=>stop('SUPERVISOR_SOURCE_TRANSPORT_TIMEOUT'),timer=setTimeout(cancel,remaining);
    signal?.addEventListener('abort',cancel,{once:true});
    child.stdout.on('data',chunk=>{count+=chunk.length;if(count>PDF_LIMITS.outputBytes)stop('SUPERVISOR_SOURCE_PDF_OUTPUT_LIMIT');else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{stderr+=chunk.length;if(stderr>8192)stop('SUPERVISOR_SOURCE_PDF_DIAGNOSTIC_LIMIT');});
    child.stdin.on('error',()=>stop('SUPERVISOR_SOURCE_PDF_EXTRACTION_FAILED'));
    child.on('error',()=>stop('SUPERVISOR_SOURCE_PDF_EXTRACTION_FAILED'));
    child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);
      if(failure||code!==0)reject(failure||fault('SUPERVISOR_SOURCE_PDF_EXTRACTION_FAILED'));else resolve(Buffer.concat(chunks));});
    child.stdin.end(bytes);
  });
}
