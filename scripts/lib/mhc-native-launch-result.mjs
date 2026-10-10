import {constants} from 'node:os';

const spawnErrors=new Set(['EACCES','EAGAIN','EFAULT','EINVAL','EIO','EISDIR','ELOOP','EMFILE','ENFILE','ENOENT','ENOEXEC','ENOMEM','ENOTDIR','EPERM','ESRCH','ETXTBSY','ENOBUFS','ETIMEDOUT','UNKNOWN','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ERR_OUT_OF_RANGE']);
const signals=new Set(Object.keys(constants.signals));

// Never expose Error.message, spawnargs, executable paths or child output from
// an interrupted launch. A child may have started, so this grants no replay.
export function nativeLaunchOutput(child) {
  const status=Number.isInteger(child?.status)&&child.status>=-2147483648&&child.status<=4294967295?child.status:null;
  const error=Boolean(child?.error),signal=child?.signal==null?null:signals.has(child.signal)?child.signal:'UNKNOWN';
  const stdout=child?.stdout||'',stderr=child?.stderr||'';
  const silentFailure=status!==null&&status!==0&&!String(stdout).trim()&&!String(stderr).trim();
  if(error||signal||status===null||silentFailure) {
    const result={schemaVersion:'mhc-native-launch-result/v1',action:'launch_failed',state:'blocked',stage:'runtime_launch',
      code:error?'MHC_NATIVE_CHILD_SPAWN_FAILED':signal?'MHC_NATIVE_CHILD_SIGNALLED':status===null?'MHC_NATIVE_CHILD_STATUS_MISSING':'MHC_NATIVE_CHILD_EXITED_WITHOUT_RESULT',
      spawnErrorCode:error?(spawnErrors.has(child.error.code)?child.error.code:'UNKNOWN'):null,signal,exitStatus:status,dispatchOutcome:'unverified'};
    return {stdout:`${JSON.stringify(result)}\n`,stderr:'',exitCode:1};
  }
  return {stdout,stderr,exitCode:status};
}
