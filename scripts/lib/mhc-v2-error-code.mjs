// Emit complete protocol identifiers only; never extract a prefix from a raw
// message, path, stack or provider response. Digits are part of GEN24 codes.
export function safeV2ErrorCode(error){
  const message=error?.message;
  return typeof message==='string'&&/^V2_[A-Z0-9_]+$/.exec(message)?.[0]===message?message:'V2_CONTROLLER_FAILURE';
}
