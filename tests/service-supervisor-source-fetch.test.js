const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const modules=Promise.all([import('../scripts/lib/service-supervisor-source-fetch.mjs'),import('../scripts/lib/service-supervisor-contracts.mjs'),
  import('../scripts/lib/service-supervisor-exec.mjs')]);
const url='https://example.invalid/FABRICATED-source',addresses=async()=>[{address:'93.184.216.34',family:4}],
  answer={status:200,mimeType:'text/html',bytes:Buffer.from('<p>FABRICATED source &amp; evidence.</p><script>FABRICATED excluded</script>')};
test('anonymous source proof hashes exact bytes, normalizes text and validates DNS on every redirect',async()=>{
  const [fetcher]=await modules;let count=0;
  const proof=await fetcher.fetchLawfulSource(url,{resolve:addresses,fetch:async()=>{count++;return answer;}});
  assert.equal(count,1);assert.equal(proof.returnedContent,'FABRICATED source & evidence.');assert.equal(proof.rawBodyStored,false);
  assert.notEqual(proof.contentSha256,proof.normalizedTextSha256);
  for(const address of ['127.0.0.1','10.1.1.1','172.16.0.1','169.254.169.254','192.168.0.1','100.64.0.1','::1','fc00::1'])
    assert.equal(fetcher.publicAddress(address),false);
  await assert.rejects(fetcher.fetchLawfulSource(url,{resolve:async()=>[{address:'127.0.0.1',family:4}],fetch:async()=>answer}),/PRIVATE_ADDRESS/);
  await assert.rejects(fetcher.fetchLawfulSource(url,{resolve:addresses,fetch:async()=>({status:302,location:'https://docs.google.com/FABRICATED'})}),/URL_INVALID/);
  await assert.rejects(fetcher.fetchLawfulSource('https://api.example.invalid/v1/FABRICATED',{resolve:addresses}),/URL_INVALID/);
  await assert.rejects(fetcher.fetchLawfulSource(url,{resolve:addresses,fetch:async()=>({...answer,mimeType:'application/pdf'})}),/ACCESS_UNAVAILABLE/);
});
test('absolute deadline cancels stalled DNS and a streaming response even while data arrives',async()=>{
  const [fetcher]=await modules;let dnsAborted=false,streamAborted=false,ticks=0;
  const started=Date.now();
  await assert.rejects(fetcher.fetchLawfulSource(url,{deadline:Date.now()+35,resolve:(_,{signal})=>new Promise(()=>{
    signal.addEventListener('abort',()=>{dnsAborted=true;},{once:true});})}),/TRANSPORT_TIMEOUT/);
  assert.equal(dnsAborted,true);assert.ok(Date.now()-started<1000);
  await assert.rejects(fetcher.fetchLawfulSource(url,{deadline:Date.now()+35,resolve:addresses,fetch:(_u,_a,{signal})=>new Promise(()=>{
    const timer=setInterval(()=>ticks++,2);signal.addEventListener('abort',()=>{clearInterval(timer);streamAborted=true;},{once:true});})}),/TRANSPORT_TIMEOUT/);
  assert.equal(streamAborted,true);assert.ok(ticks>0);const stopped=ticks;await new Promise(r=>setTimeout(r,10));assert.equal(ticks,stopped);
});
test('completed CLI opens are discovery only; exact anonymously fetched excerpts admit consultation',async()=>{
  const [fetcher,,executor]=await modules,item={id:'FABRICATED-page',type:'web_search',action:{type:'open_page',url},results:[{url,snippet:'FABRICATED snippet'}]};
  const events=[{type:'thread.started',thread_id:'FABRICATED-thread'},{type:'item.started',item:{...item,action:{type:'other'},results:undefined}},
    {type:'item.completed',item},{type:'turn.completed'}].map(JSON.stringify).join('\n');
  const discovery=executor.analyzeChildEvents(events,{kind:'daily-research',sourceAccessMode:'bounded_https'});
  assert.equal(discovery.opened[0].returnedContent,null);
  const output={records:[{source:{sourceId:'FABRICATED-source',summaryUseStatus:'consulted'},accessedUrl:url,evidenceExcerpt:'FABRICATED source & evidence.',limitations:[]}]};
  const evidence=await fetcher.verifiedResearchSources(output,discovery.opened,{fetchSource:value=>fetcher.fetchLawfulSource(value,{resolve:addresses,fetch:async()=>answer})});
  assert.equal(evidence.at(-1).eventId,item.id);assert.equal(output.records[0].source.accessMethod.includes('anonymous HTTPS'),true);
  await assert.rejects(fetcher.verifiedResearchSources(structuredClone(output),[],{fetchSource:async()=>{throw Error('must not run');}}),/NOT_OPENED/);
  const wrong=structuredClone(output);wrong.records[0].evidenceExcerpt='FABRICATED invented prose';
  await assert.rejects(fetcher.verifiedResearchSources(wrong,discovery.opened,{fetchSource:value=>fetcher.fetchLawfulSource(value,{resolve:addresses,fetch:async()=>answer})}),/BINDING_FAILED/);
});
test('provider contracts use fully typed required wrappers; strict source validation remains local',async()=>{
  const [,contracts]=await modules,sourceSchema=JSON.parse(await fs.readFile(path.join(__dirname,'../schemas/source.schema.json'))),
    packet={readingId:'FABRICATED-reading'},schemas=[contracts.researchContract(packet,sourceSchema),contracts.synthesisContract(packet),contracts.independentReviewContract(packet)];
  function inspect(node){if(!node||typeof node!=='object')return;
    if(node.const!==undefined)assert.ok(node.type);assert.equal(node.uniqueItems,undefined);
    if(node.type==='object'){assert.equal(node.additionalProperties,false);assert.deepEqual(node.required,Object.keys(node.properties));}
    for(const child of Object.values(node))if(Array.isArray(child))child.forEach(inspect);else inspect(child);
  }
  schemas.forEach(inspect);assert.equal(schemas[0].properties.records.items.properties.sourceJson.type,'string');
  const output={schemaVersion:'daily-research/v1',readingId:packet.readingId,inputSha256:schemas[0].properties.inputSha256.const,
    status:'complete',records:[{sourceJson:'{}',eventId:null,accessedUrl:url,evidenceExcerpt:'FABRICATED',claimNotes:[],
      inclusionReason:'FABRICATED',independenceKey:'FABRICATED',limitations:[]}],claims:[],representedCategories:[],missingCategories:[],stoppingReason:'FABRICATED',limitations:[]};
  assert.throws(()=>contracts.decodeResearch(output,{packet,sourceSchema}),/Research source record/);
});
