const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const modules=Promise.all([import('../scripts/lib/service-supervisor-pdf.mjs'),import('../scripts/lib/service-supervisor-source-fetch.mjs'),
  import('../scripts/lib/service-supervisor-store.mjs')]);
const python='C:/Users/rowla/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const pythonSha='372c2eae555b344520bf147be0096e009069aeca4e7f78d6aecea6d53158056a';
// Fabricated in-memory PDF, never a fetched work or saved source body.
function fabricatedPdf({pages=1,filter='',stream='BT /F1 12 Tf 10 100 Td (FABRICATED local PDF evidence.) Tj ET',trailer=''}={}) {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${4+i} 0 R`).join(' ')}] /Count ${pages} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',...Array(pages).fill('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(4+pages)+' 0 R >>'),
    `<< /Length ${Buffer.byteLength(stream)} ${filter} >>\nstream\n${stream}\nendstream`];
  let text='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('');
  text+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(text);
}
async function binding(t) {
  const [pdf,,store]=await modules;
  try{if(store.digest(await fs.readFile(python))!==pythonSha){t.skip('Exact bundled Windows Python unavailable; portable refusal tests still run.');return null;}}
  catch(error){if(error.code==='ENOENT'){t.skip('Bundled Windows Python unavailable; portable refusal tests still run.');return null;}throw error;}
  return {pythonExecutable:python,executableSha256:pythonSha,pypdfVersion:pdf.PDF_VERSION,packageSha256:pdf.PDF_PACKAGE_SHA};
}
test('HTML normalization decodes curly punctuation without changing literal punctuation',async()=>{
  const [,fetcher]=await modules,text=fetcher.plainSourceText(Buffer.from('<p>FABRICATED &ldquo;quote&rdquo; &rsquo; &lsquo; &ndash; &mdash; &hellip;</p>'),'text/html');
  assert.equal(text,'FABRICATED “quote” ’ ‘ – — …');assert.equal(text.includes('"quote"'),false);
});
test('PDF MIME still refuses absent configuration; byte/signature/version/package/executable checks run before parser',async()=>{
  const [pdf,fetcher]=await modules,bytes=fabricatedPdf(),resolve=async()=>[{address:'93.184.216.34',family:4}],fetch=async()=>({status:200,mimeType:'application/pdf',bytes}),
    config={pythonExecutable:process.execPath,executableSha256:'0'.repeat(64),pypdfVersion:pdf.PDF_VERSION,packageSha256:pdf.PDF_PACKAGE_SHA};
  await assert.rejects(fetcher.fetchLawfulSource('https://example.invalid/FABRICATED.pdf',{resolve,fetch}),/ACCESS_UNAVAILABLE/);
  for(const [data,configPatch]of [[Buffer.from('FABRICATED wrong signature'),{}],[Buffer.alloc(pdf.PDF_LIMITS.bytes+1),{}],
    [bytes,{pypdfVersion:'FABRICATED wrong version'}],[bytes,{packageSha256:'0'.repeat(64)}]])
    await assert.rejects(pdf.extractSourcePdf(data,{...config,...configPatch}),/CONFIGURATION_OR_INPUT_INVALID/);
  await assert.rejects(pdf.extractSourcePdf(bytes,config),/EXECUTABLE_CHANGED/);
});
test('actual pinned local PDF parser admits literal fabricated text, hashes and extraction metadata from stdin',async t=>{
  const config=await binding(t);if(!config)return;const [pdf,fetcher,store]=await modules,bytes=fabricatedPdf({pages:2}),
    extraction=await pdf.extractSourcePdf(bytes,config);assert.equal(extraction.extraction.pages,2);assert.ok(extraction.text.includes('FABRICATED local PDF evidence.'));
  assert.equal(extraction.extraction.extractedTextSha256,store.digest(Buffer.from(extraction.text)));
  assert.equal(extraction.extraction.pythonExecutableSha256,pythonSha);
  const proof=await fetcher.fetchLawfulSource('https://example.invalid/FABRICATED.pdf',{pdfExtractor:config,
    resolve:async()=>[{address:'93.184.216.34',family:4}],fetch:async()=>({status:200,mimeType:'application/pdf',bytes})});
  assert.equal(proof.contentSha256,store.digest(bytes));assert.equal(proof.mimeType,'application/pdf');assert.equal(proof.rawBodyStored,false);
  assert.equal(proof.normalization,'pypdf-plain-whitespace/v1');assert.equal(proof.extraction.pages,2);
  assert.ok(proof.extraction.decodedBytes>0&&proof.extraction.decodedBytes<proof.extraction.limits.decodedBytes);
  assert.equal(proof.extraction.limits.pages,32);
  assert.equal(proof.normalizedTextSha256,store.digest(Buffer.from(proof.returnedContent)));
  assert.equal(Object.values(proof).some(v=>Buffer.isBuffer(v)),false);
  const contracts=await import('../scripts/lib/service-supervisor-contracts.mjs'),fetchBinding=await import('../scripts/lib/service-supervisor-source-binding.mjs'),
    sources=['one','two'].map(id=>({sourceId:`FABRICATED-${id}`,title:`FABRICATED ${id}`,authorOrOrganization:'FABRICATED author',edition:'FABRICATED edition',
      urlOrCitation:`https://example.invalid/FABRICATED-${id}`,summaryUseStatus:'consulted',includedReadings:[],rightsStatus:'copyrighted',license:'FABRICATED restricted',
      rawTextStorageAllowed:false,accessDate:'2026-10-10',accessMethod:'FABRICATED verified local test'})),
    records=sources.map(source=>({source,accessedUrl:source.urlOrCitation,evidenceExcerpt:'FABRICATED local PDF evidence.',claimNotes:[],limitations:[]})),
    sourceEvidence=sources.map(source=>({...proof,url:source.urlOrCitation,sourceId:source.sourceId,citationBinding:{kind:'exact_url',
      sourceWorkSha256:fetchBinding.sourceWorkBinding(source),urlOrCitation:source.urlOrCitation,accessedUrl:source.urlOrCitation}})),
    admission=contracts.admitResearch({status:'complete',records,claims:[],representedCategories:[],missingCategories:[],stoppingReason:'FABRICATED',limitations:[]},
      {packet:{readingId:'FABRICATED'},sourceEvidence,decoded:true});
  assert.deepEqual(admission.evidence[0].extraction,proof.extraction);assert.equal(admission.evidence[0].returnedContent,undefined);
});
test('actual local parser refuses encrypted/too-many-page/unsupported-decoder/malformed/oversized-decoded PDFs',async t=>{
  const config=await binding(t);if(!config)return;const [pdf]=await modules;
  for(const bytes of [fabricatedPdf({pages:33}),fabricatedPdf({filter:'/Filter /JBIG2Decode'}),
    fabricatedPdf({trailer:'/Encrypt << /Filter /Standard /V 1 /R 2 /Length 40 /O (FABRICATED) /U (FABRICATED) /P -4 >>'}),
    Buffer.from('%PDF-FABRICATED malformed'),fabricatedPdf({pages:32,stream:' '.repeat(150000)})])
    await assert.rejects(pdf.extractSourcePdf(bytes,config),/EXTRACTION_FAILED/);
  await assert.rejects(pdf.extractSourcePdf(fabricatedPdf(),config,{deadline:Date.now()-1}),/TRANSPORT_TIMEOUT/);
});
test('parser process output, diagnostic and deadline caps discard unsafe diagnostics and kill only owned process',async()=>{
  const [pdf]=await modules;
  for(const [body,code]of [[`process.stdout.write('x'.repeat(1100000))`,'OUTPUT_LIMIT'],[`process.stderr.write('x'.repeat(9000))`,'DIAGNOSTIC_LIMIT'],
    [`setInterval(()=>{},1000)`,'TRANSPORT_TIMEOUT'],[`process.exit(1)`,'EXTRACTION_FAILED']]) {
    await assert.rejects(pdf.boundedPdfProcess(process.execPath,['-e',body],fabricatedPdf(),{remaining:1500}),new RegExp(code));
  }
});
test('actual pinned parser audit refuses subprocess, socket and file-write attempts without creating an artifact',async t=>{
  const config=await binding(t);if(!config)return;const [pdf]=await modules,script=path.resolve(__dirname,'../scripts/lib/service-supervisor-pdf-extractor.py'),
    target=path.resolve(__dirname,'FABRICATED-PDF-WRITE-MUST-NOT-EXIST'),program=`import runpy,sys,socket,subprocess\nmodule=runpy.run_path(${JSON.stringify(script)})\nsys.addaudithook(module['deny_side_effects'])\ncount=0\nfor action in [lambda: socket.socket(),lambda: subprocess.run([sys.executable,'-I','-c','pass']),lambda: open(${JSON.stringify(target)},'wb')]:\n try: action()\n except PermissionError: count+=1\nprint(count)\n`;
  const output=await pdf.boundedPdfProcess(config.pythonExecutable,['-I','-B','-c',program],Buffer.alloc(0),
    {env:process.platform==='win32'?{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}:{}});
  assert.equal(output.toString().trim(),'3');await assert.rejects(fs.stat(target),{code:'ENOENT'});
});
