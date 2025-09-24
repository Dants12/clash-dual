import pino, { stdTimeFunctions, type DestinationStream } from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

const levelLabels: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL'
};

const destination: DestinationStream = {
  write(chunk) {
    const raw = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    let target: NodeJS.WritableStream = process.stdout;
    let output = raw.trimEnd();
    try {
      const entry = JSON.parse(raw);
      if (typeof entry.level === 'number' && entry.level >= 40) {
        target = process.stderr;
      }
      if (typeof entry.msg === 'string') {
        const level = typeof entry.level === 'number' ? levelLabels[entry.level] ?? '' : '';
        const timeValue = entry.time;
        const timestamp =
          typeof timeValue === 'string'
            ? timeValue
            : typeof timeValue === 'number'
              ? new Date(timeValue).toISOString()
              : '';
        const prefixParts = [] as string[];
        if (timestamp) prefixParts.push(timestamp);
        if (level) prefixParts.push(level);
        const prefix = prefixParts.length > 0 ? `[${prefixParts.join(' ')}] ` : '';
        output = `${prefix}${entry.msg}`;
        if (entry.err && typeof entry.err === 'object') {
          const err = entry.err as { stack?: unknown; message?: unknown };
          const stack =
            typeof err.stack === 'string'
              ? err.stack
              : typeof err.message === 'string'
                ? err.message
                : '';
          if (stack) {
            output += `\n${stack}`;
          }
        }
      }
    } catch {
      // Ignore JSON parse errors and fall back to the trimmed raw output.
    }
    if (!output.endsWith('\n')) {
      output += '\n';
    }
    target.write(output);
    return true;
  }
};

export const logger = pino(
  {
    level,
    base: undefined,
    timestamp: stdTimeFunctions.isoTime
  },
  destination
);

export type Logger = typeof logger;
