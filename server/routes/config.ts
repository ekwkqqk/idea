import { Router } from 'express';
import { configSchema } from '../../shared/schemas';
import type { Config } from '../../shared/types';
import { Errors } from '../errors';
import { requireManager } from '../middleware/currentUser';
import { configStore, getConfig } from '../repository/configRepository';
import { allIssues } from '../repository/issueRepository';

export const configRouter = Router();

configRouter.get('/', (_req, res) => {
  res.json(getConfig());
});

function usedReferences() {
  const users = new Set<string>();
  const modules = new Set<string>();
  for (const i of allIssues()) {
    modules.add(i.module);
    [i.reporter, i.assignee, i.createdBy, i.rejection?.rejectedBy,
      ...i.resolutions.map((r) => r.resolver), ...i.retests.map((r) => r.tester),
      ...i.comments.map((c) => c.author)].forEach((u) => u && users.add(u));
  }
  return { users, modules };
}

configRouter.get('/usage', (_req, res) => {
  const { users, modules } = usedReferences();
  res.json({ users: [...users], modules: [...modules] });
});

configRouter.put('/', requireManager, async (req, res) => {
  const next = configSchema.parse(req.body) as Config;

  const dupUser = next.users.find((u, idx) => next.users.findIndex((x) => x.id === u.id) !== idx);
  if (dupUser) throw Errors.validation([{ field: 'users', message: `사용자 ID '${dupUser.id}'가 중복됩니다.` }]);
  const dupModule = next.modules.find((m, idx) => next.modules.findIndex((x) => x.code === m.code) !== idx);
  if (dupModule) throw Errors.validation([{ field: 'modules', message: `모듈 코드 '${dupModule.code}'가 중복됩니다.` }]);
  const unknownManager = next.modules.find((m) => m.managerId && !next.users.some((u) => u.id === m.managerId));
  if (unknownManager) throw Errors.validation([{ field: 'modules', message: `모듈 '${unknownManager.name}'의 담당 PL이 사용자 목록에 없습니다.` }]);

  const { users, modules } = usedReferences();
  const removedUser = [...users].find((id) => !next.users.some((u) => u.id === id));
  if (removedUser) throw Errors.configInUse(`사용자 '${removedUser}'는 이슈에서 사용 중이라 삭제할 수 없습니다. 사용 안 함으로 변경하세요.`);
  const removedModule = [...modules].find((code) => !next.modules.some((m) => m.code === code));
  if (removedModule) throw Errors.configInUse(`모듈 '${removedModule}'는 이슈에서 사용 중이라 삭제할 수 없습니다. 사용 안 함으로 변경하세요.`);
  if (!next.users.some((u) => u.role === 'MANAGER' && u.active)) throw Errors.noActiveManager();

  await configStore.update((draft) => {
    Object.assign(draft, next);
  });
  res.json(getConfig());
});
