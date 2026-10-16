import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.TIMS_DATA_DIR ?? path.join(ROOT_DIR, 'data'));
export const LOG_DIR = path.resolve(process.env.TIMS_LOG_DIR ?? path.join(ROOT_DIR, 'logs'));
export const WEB_DIST_DIR = path.join(ROOT_DIR, 'dist', 'web');

export const ISSUES_FILE = path.join(DATA_DIR, 'issues.json');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
export const BACKUP_DIR = path.join(DATA_DIR, 'backup');
export const LOCK_FILE = path.join(DATA_DIR, '.lock');
