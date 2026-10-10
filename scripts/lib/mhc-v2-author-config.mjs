// Lane names are retained for installed automation compatibility. Only this
// primary value changes; the existing fallback is not replaced or expanded.
export const AUTHOR_MODEL = 'gpt-6-luna';
export const LEGACY_MODELS = {spark:'gpt-5.3-codex-spark',luna:'gpt-5.6-luna'};
export function configuredModels(ctx) {
  const primary=ctx.config?.author_model??AUTHOR_MODEL;
  if(![AUTHOR_MODEL,LEGACY_MODELS.spark].includes(primary))throw Error('V2_AUTHOR_CONFIGURATION_INVALID');
  return {spark:primary,luna:LEGACY_MODELS.luna};
}
export const jobModels=job=>job.state.models??LEGACY_MODELS;
export const authorEffort=lane=>lane==='spark'?'medium':'low';
