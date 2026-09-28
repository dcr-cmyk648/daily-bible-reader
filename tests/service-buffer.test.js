const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../scripts/lib/service-buffer.mjs');
const baseline = () => ({status:'ready',effectiveDate:'2026-09-28',target:8,
  readingIds:Array.from({length:8},(_,i)=>`FABRICATED-${i}`),missingPreparedReadingIds:[],
  missingPayloadReadingIds:[],componentFailures:[],currentHorizonHenryLayer:{status:'complete',
    completeCount:8,fallbackReadingIds:[],unavailableReadingIds:[]}});
test('a fallback can keep a devotional readable but cannot satisfy the service buffer',async()=>{
  const {serviceBufferReport}=await modulePromise,h=baseline();
  h.currentHorizonHenryLayer={status:'debt',completeCount:1,fallbackReadingIds:h.readingIds.slice(1),unavailableReadingIds:[]};
  const r=serviceBufferReport(h);
  assert.equal(r.status,'not_ready');assert.equal(r.devotionalFutureDays,7);
  assert.equal(r.completeFutureDays,0);assert.equal(r.nextHenryReadingId,'FABRICATED-1');
});
test('an unpublished T+7 and an earlier Henry gap remain distinct actionable debts',async()=>{
  const {serviceBufferReport}=await modulePromise,h=baseline();h.status='not_ready';
  h.missingPreparedReadingIds=['FABRICATED-7'];h.missingPayloadReadingIds=['FABRICATED-7'];
  h.componentFailures=[{readingId:'FABRICATED-7',missingComponentIds:['metadata']}];
  h.currentHorizonHenryLayer={status:'unavailable',fallbackReadingIds:['FABRICATED-2'],unavailableReadingIds:['FABRICATED-7']};
  const r=serviceBufferReport(h);assert.equal(r.devotionalFutureDays,6);assert.equal(r.completeFutureDays,1);
  assert.equal(r.nextDailyReadingId,'FABRICATED-7');assert.equal(r.nextHenryReadingId,'FABRICATED-2');
});
test('complete readings, introduction days and a shortened final horizon count correctly',async()=>{
  const {serviceBufferReport}=await modulePromise,h=baseline();h.currentHorizonHenryLayer.completeCount=7;
  assert.equal(serviceBufferReport(h).completeFutureDays,7);assert.equal(serviceBufferReport(h).status,'ready');
  h.readingIds=h.readingIds.slice(0,3);h.target=3;assert.equal(serviceBufferReport(h).completeFutureDays,2);
});
test('missing health evidence never produces a green completion',async()=>{
  const {serviceBufferReport}=await modulePromise,h=baseline();delete h.currentHorizonHenryLayer;
  assert.equal(serviceBufferReport(h).status,'not_ready');assert.equal(serviceBufferReport(h).completeFutureDays,0);
  assert.equal(serviceBufferReport({status:'error'}).measurementComplete,false);
});
