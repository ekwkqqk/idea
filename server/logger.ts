import fs from 'node:fs';
import path from 'node:path';
import { LOG_DIR } from './paths';
import { formatDate, nowIso } from '../shared/dates';

const RETENTION_DAYS = 30;

function logFile(): string {
  return path.join(LOG_DIR, `app-${formatDate(new Date()).replaceAll('-', '')}.log`);
}

function write(level: string, message: string, extra?: Record<string, unknown>) {
  const line = `${nowIso()} [${level}] ${message}${extra ? ' ' + JSON.stringify(extra) : ''}\n`;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(logFile(), line, 'utf8');
  } catch {
    // 로그 기록 실패가 요청 처리를 막지 않도록 무시
  }
  if (level === 'ERROR') console.error(line.trimEnd());
  else console.log(line.trimEnd());
}

export const logger = {
  info: (message: string, extra?: Record<string, unknown>) => write('INFO', message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => write('WARN', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => write('ERROR', message, extra),
};

export function pruneLogs() {
  if (!fs.existsSync(LOG_DIR)) return;
  const limit = Date.now() - RETENTION_DAYS * 86_400_000;
  for (const name of fs.readdirSync(LOG_DIR)) {
    const file = path.join(LOG_DIR, name);
    if (fs.statSync(file).mtimeMs < limit) fs.rmSync(file, { force: true });
  }
}
