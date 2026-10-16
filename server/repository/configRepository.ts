import type { Config, User } from '../../shared/types';
import { CONFIG_FILE } from '../paths';
import { FileStore } from './fileStore';

export const configStore = new FileStore<Config>(CONFIG_FILE, () => ({
  project: { name: '새 프로젝트', testRounds: ['1차', '2차', '3차'] },
  users: [{ id: 'u-admin', name: '관리자', role: 'MANAGER', org: '', active: true }],
  modules: [{ code: 'COM', name: '공통', managerId: 'u-admin', active: true }],
  settings: {
    dueDays: { CRITICAL: 1, HIGH: 3, MEDIUM: 5, LOW: 10 },
    staleDays: 7,
    backupRetentionDays: 30,
  },
}));

export function getConfig(): Config {
  return configStore.read();
}

export function findUser(id: string | null | undefined): User | undefined {
  if (!id) return undefined;
  return configStore.read().users.find((u) => u.id === id);
}
