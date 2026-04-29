type Level = 'INFO' | 'WARN' | 'ERROR';
type LogData = Record<string, unknown>;

function emit(level: Level, data: LogData): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, ...data }) + '\n');
}

export const logger = {
  info:  (data: LogData) => emit('INFO',  data),
  warn:  (data: LogData) => emit('WARN',  data),
  error: (data: LogData) => emit('ERROR', data),
};
