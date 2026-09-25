const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const app = require("../app/frontend/app.js");
const core = require("../app/shared/server-core.js");
const entries = Array.from({length: 12}, (_, i) => ({readingId: `FABRICATED-${i}`, dayIndex: i + 1}));

test("publication gaps are visible without fetching study payloads and ignore selected future dates", () => {
  const r = app.publicationReadiness(entries, {status: "active", calendarDayIndex: 3}, new Set(entries.slice(0, 6).map(e => e.readingId)));
  assert.equal(r.state, "warning"); assert.equal(r.target, 8); assert.equal(r.consecutiveReady, 4);
  assert.equal(r.nextGapEntry, entries[6]); assert.equal(r.readyThroughEntry, entries[5]);
});
test("missing today or tomorrow is critical, complete and terminal windows are not", () => {
  assert.equal(app.publicationReadiness(entries, {status:"active",calendarDayIndex:3}, new Set()).state,"critical");
  assert.equal(app.publicationReadiness(entries,{status:"active",calendarDayIndex:3},new Set(entries.map(e=>e.readingId))).state,"green");
  assert.equal(app.publicationReadiness(entries,{status:"pilot_complete",calendarDayIndex:13},new Set()).target,0);
});
const status = {schemaVersion:"preparation-status/v1",state:"approval_required",updatedAt:"2026-09-24T12:00:00Z",summary:"FABRICATED repair awaits approval.",action:"Approve the reviewed code repair."};
test("approval details are owner-only, bounded and optional", () => {
  assert.equal(core.preparationServiceStatus({preparationStatus:status},{authorId:"shane"}),null);
  assert.equal(core.preparationServiceStatus({}, {authorId:"dustin"}),null);
  const result=core.preparationServiceStatus({preparationStatus:{...status,privateFileId:"fabricated-secret"}},{authorId:"dustin"});
  assert.deepEqual(result,status);
  assert.equal(core.preparationServiceStatus({preparationStatus:{...status,updatedAt:"bad"}},{authorId:"dustin"}),null);
});
test("approval stays red even with a complete downloaded window; resolution clears it", () => {
  const source=fs.readFileSync(require.resolve("../app/frontend/app.js"),"utf8");
  const nodes=Object.fromEntries(["contentReadinessAlert","contentReadinessTitle","contentReadinessMessage"].map(id=>[id,{dataset:{},setAttribute(){}}]));
  const state={bootstrap:{preparationStatus:status}};
  const box={state,element:id=>nodes[id],contentDiagnosticsArePrivateToOwner:()=>true};
  vm.createContext(box);vm.runInContext(source.slice(source.indexOf("  function renderContentReadiness("),source.indexOf("  function renderSelectedDay(")),box);
  box.renderContentReadiness({state:"green",target:8});
  assert.equal(nodes.contentReadinessAlert.hidden,false);assert.equal(nodes.contentReadinessAlert.dataset.state,"approval");
  assert.match(nodes.contentReadinessMessage.textContent,/BibleApp Manager/);
  state.bootstrap.preparationStatus={...status,state:"ready"};box.renderContentReadiness({state:"green",target:8});
  assert.equal(nodes.contentReadinessAlert.hidden,true);
});
