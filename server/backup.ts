import fs from 'node:fs';
import path from 'node:path';
import { compactStamp } from '../shared/dates';
import { logger } from './logger';
import { BACKUP_DIR, CONFIG_FILE, ISSUES_FILE } from './paths';
import { getConfig } from './repository/configRepository';

export function runBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = compactStamp();
    if (fs.existsSync(ISSUES_FILE)) fs.copyFileSync(ISSUES_FILE, path.join(BACKUP_DIR, `issues_${stamp}.json`));
    if (fs.existsSync(CONFIG_FILE)) fs.copyFileSync(CONFIG_FILE, path.join(BACKUP_DIR, `config_${stamp}.json`));
    pruneBackups(getConfig().settings.backupRetentionDays);
    logger.info(`백업 완료: ${stamp}`);
  } catch (err) {
    logger.error('백업 실패', { error: String(err) });
  }
}

function pruneBackups(retentionDays: number) {
  const limit = Date.now() - retentionDays * 86_400_000;
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    const file = path.join(BACKUP_DIR, name);
    if (fs.statSync(file).mtimeMs < limit) fs.rmSync(file, { force: true });
  }
}

/** 매일 00:00에 백업 */
export function scheduleDailyBackup() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  setTimeout(() => {
    runBackup();
    scheduleDailyBackup();
  }, nextMidnight.getTime() - now.getTime()).unref();
}
