import {digest,jsonBytes} from './service-supervisor-store.mjs';
export function sourceWorkBinding(source) {
  const fields=['sourceId','title','authorOrOrganization','edition','urlOrCitation','rightsStatus','license'];
  return digest(jsonBytes(Object.fromEntries(fields.map(k=>[k,source[k]]))));
}
