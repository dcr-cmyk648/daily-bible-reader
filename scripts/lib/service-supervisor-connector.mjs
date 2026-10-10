import {confined,durableWrite,digest,fault} from './service-supervisor-store.mjs';

// Connected tools normalize Google's field names. Keep this one explicit
// projection; missing sharing/parents/identity evidence never becomes default
// "private" merely because a files.get action succeeded.
export function connectorData(result) {
  if(result?.isError)throw fault('SUPERVISOR_CONNECTOR_FAILED');
  const value=result?.structuredContent;
  if(!value||typeof value!=='object'||Array.isArray(value))throw fault('SUPERVISOR_CONNECTOR_RESULT_INVALID');
  return value;
}
export function connectorMetadata(result) {
  const value=connectorData(result);
  if(typeof value.id!=='string'||typeof value.mime_type!=='string'||!Array.isArray(value.parent_ids)||
    !Array.isArray(value.permissions)||value.source_visibility_status!=='permission_metadata_available')throw fault('SUPERVISOR_CONNECTOR_METADATA_INCOMPLETE');
  return {id:value.id,mimeType:value.mime_type,parents:value.parent_ids,permissions:value.permissions,
    ...(typeof value.trashed==='boolean'?{trashed:value.trashed}:{})};
}
export async function materializeRawReference(result,{root,relative,maxBytes=1024*1024,fetchImpl=fetch}={}) {
  const data=connectorData(result),reference=data.file_uri;
  if(!reference||typeof reference!=='object'||typeof reference.download_url!=='string'||typeof reference.file_id!=='string'||
    !Number.isSafeInteger(data.file_size_bytes)||data.file_size_bytes<1||data.file_size_bytes>maxBytes||
    !Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>8*1024*1024)throw fault('SUPERVISOR_RAW_REFERENCE_INVALID');
  const url=new URL(reference.download_url),match=/^\/files\/([0-9a-f-]{36})\/raw$/.exec(url.pathname);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!/^[-a-z0-9]+\.oaiusercontent\.com$/i.test(url.hostname)||
      !match||reference.file_id!==`sediment://file_${match[1].replaceAll('-','')}`)throw fault('SUPERVISOR_RAW_REFERENCE_ORIGIN_INVALID');
  // This is the connector's already returned scoped byte reference, not a
  // Google/OpenAI API call or credential route. No bearer is printed or retained
  // in a journal; no redirects, cookies, API keys or arbitrary fetch destination.
  await confined(root,relative);
  const response=await fetchImpl(url.href,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.body)throw fault('SUPERVISOR_RAW_DOWNLOAD_FAILED');
  const chunks=[];let length=0;
  for await(const chunk of response.body) {
    length+=chunk.length;if(length>maxBytes||length>data.file_size_bytes)throw fault('SUPERVISOR_RAW_DOWNLOAD_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  if(length!==data.file_size_bytes)throw fault('SUPERVISOR_RAW_DOWNLOAD_LENGTH_CHANGED');
  const bytes=Buffer.concat(chunks);
  await durableWrite(root,relative,bytes);
  return {rawPath:relative,rawSha256:digest(bytes),bytes:length};
}
export async function connectorReceipt(result,operation,{operationSha256,dispatchEpoch,downloadRoot}={},dependencies={}) {
  const receipt={operationId:operation.operationId,operationSha256,dispatchEpoch,outcome:'success'};
  const data=connectorData(result);
  if(operation.tool==='google_drive_get_file_metadata')receipt.metadata=connectorMetadata(result);
  else if(['google_drive_upload_file','google_drive_update_file'].includes(operation.tool)) {
    if(typeof data.id!=='string')throw fault('SUPERVISOR_UPLOAD_ID_MISSING');receipt.fileId=data.id;
  } else if(operation.tool==='google_drive_fetch') {
    const maximum=operation.expectedBytes||1024*1024;
    Object.assign(receipt,await materializeRawReference(result,{root:downloadRoot,relative:`operation-${operation.ordinal}.bin`,maxBytes:maximum,
      ...(dependencies.fetchImpl?{fetchImpl:dependencies.fetchImpl}:{})}));
  } else if(operation.tool==='google_drive_search') {
    const files=data.results||data.files;
    if(!Array.isArray(files)||files.length>=operation.args.topn||data.next_page_token||data.nextPageToken)throw fault('SUPERVISOR_CONNECTOR_SEARCH_INCOMPLETE');
    receipt.files=files.map(file=>({id:file.id,name:file.title||file.name}));
  } else throw fault('SUPERVISOR_OPERATION_TOOL_INVALID');
  return receipt;
}
