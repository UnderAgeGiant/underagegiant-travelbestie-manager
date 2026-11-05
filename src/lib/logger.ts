import { capture } from './analytics';

type Level = 'INFO' | 'WARN' | 'ERROR';
type LogData = Record<string, unknown>;

function emit(level: Level, data: LogData): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, ...data }) + '\n');
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const redact = (v: unknown): string | null => (v == null ? null : String(v).replace(EMAIL, '[email]'));

// ponytail: per-instance memory, dedupe only within one serverless instance — fine since a request's logs all run in one instance.
const alertedFlows = new Set<string>();

function alert(data: LogData, onlyIfFirstInFlow: boolean): void {
  const flowId = typeof data.flowId === 'string' ? data.flowId : null;
  if (onlyIfFirstInFlow && flowId && alertedFlows.has(flowId)) return;
  if (flowId) {
    if (alertedFlows.size >= 1000) alertedFlows.clear();
    alertedFlows.add(flowId);
  }
  const userId = typeof data.userId === 'string' && data.userId ? data.userId : 'anonymous';
  const err = data.err;
  capture(userId, 'server_error', {
    userId,
    msg: redact(data.msg),
    error: redact(err instanceof Error ? err.message : err),
    method: data.method ?? null,
    path: redact(typeof data.path === 'string' ? data.path.split('?')[0] : data.path),
    status: data.status ?? null,
    flowId,
  });
}

export const logger = {
  info:  (data: LogData) => emit('INFO',  data),
  warn:  (data: LogData) => emit('WARN',  data),
  error: (data: LogData, opts?: { onlyIfFirstInFlow?: boolean }) => {
    emit('ERROR', data);
    try { alert(data, opts?.onlyIfFirstInFlow ?? false); } catch { /* alerting must never break the caller */ }
  },
};
