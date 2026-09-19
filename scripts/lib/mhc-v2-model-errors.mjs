// Only an explicit provider refusal for the exact Spark model permits this
// availability handoff. Generic transport, auth, quota and local failures do not.
export function sparkModelUnavailable(result) {
  return exactProviderRefusal(result,"The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account.");
}
export function modelRequiresNewClient(result,model) {
  if(!['gpt-5.3-codex-spark','gpt-5.6-luna'].includes(model))return false;
  return exactProviderRefusal(result,`The '${model}' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.`);
}
function exactProviderRefusal(result,message) {
  if (result.status !== 1 || result.error) return false;
  let events;
  try { events = String(result.stdout || '').trim().split('\n').filter(Boolean).map(JSON.parse); }
  catch { return false; }
  const allowed = new Set(['thread.started', 'turn.started', 'error', 'turn.failed', 'item.completed']);
  if (events.some(e => !e || !allowed.has(e.type) || (e.type === 'item.completed' && e.item?.type !== 'error'))) return false;
  const failures = events.filter(e => e.type === 'turn.failed');
  if (failures.length !== 1) return false;
  try {
    const refusal = JSON.parse(failures[0].error.message);
    return refusal.type === 'error' && refusal.status === 400 &&
      refusal.error?.type === 'invalid_request_error' &&
      refusal.error.message === message;
  } catch { return false; }
}
