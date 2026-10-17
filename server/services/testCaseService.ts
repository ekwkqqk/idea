import { OPEN_STATUSES } from '../../shared/codes';
import { nowIso } from '../../shared/dates';
import type { CreateTestCaseInput, PatchTestCaseInput } from '../../shared/schemas';
import type { Page, TestCase, TestCaseSummary, User } from '../../shared/types';
import { Errors, type ErrorDetail } from '../errors';
import { findUser, getConfig } from '../repository/configRepository';
import { allIssues } from '../repository/issueRepository';
import { allTestCases, getTestCase, testCaseStore } from '../repository/testCaseRepository';

export interface TestCaseQuery {
  testType?: string;
  module?: string;
  active?: string;
  q?: string;
  page?: string;
  size?: string;
}

export const canEditTestCase = (user: User) => user.role === 'TESTER' || user.role === 'MANAGER';

function assertCanEdit(user: User) {
  if (!canEditTestCase(user)) throw Errors.forbidden('테스트케이스는 테스터 또는 PL/PM만 등록·수정할 수 있습니다.');
}

function issueCounts(): Map<string, { total: number; open: number }> {
  const counts = new Map<string, { total: number; open: number }>();
  for (const i of allIssues()) {
    if (i.deleted || !i.testCaseId) continue;
    const c = counts.get(i.testCaseId) ?? { total: 0, open: 0 };
    c.total += 1;
    if (OPEN_STATUSES.includes(i.status)) c.open += 1;
    counts.set(i.testCaseId, c);
  }
  return counts;
}

function toSummary(tc: TestCase, counts: Map<string, { total: number; open: number }>): TestCaseSummary {
  const c = counts.get(tc.id);
  return { ...tc, issueCount: c?.total ?? 0, openIssueCount: c?.open ?? 0 };
}

export function searchTestCases(query: TestCaseQuery): Page<TestCaseSummary> {
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(5000, Math.max(1, Number(query.size) || 20));
  const keyword = query.q?.trim().toLowerCase();
  const counts = issueCounts();
  const items = allTestCases()
    .filter((t) => {
      if (query.testType && t.testType !== query.testType) return false;
      if (query.module && t.module !== query.module) return false;
      if (query.active === 'true' && !t.active) return false;
      if (query.active === 'false' && t.active) return false;
      if (keyword && !`${t.id}\n${t.title}\n${t.programId}`.toLowerCase().includes(keyword)) return false;
      return true;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((t) => toSummary(t, counts));
  return { items: items.slice((page - 1) * size, page * size), total: items.length, page, size };
}

export function getTestCaseSummary(id: string): TestCaseSummary {
  return toSummary(getTestCase(id), issueCounts());
}

function validateRefs(fields: { module?: string; owner?: string | null }) {
  const details: ErrorDetail[] = [];
  if (fields.module !== undefined && !getConfig().modules.some((m) => m.code === fields.module && m.active)) {
    details.push({ field: 'module', message: '사용 중인 모듈이 아닙니다.' });
  }
  if (fields.owner && !findUser(fields.owner)?.active) {
    details.push({ field: 'owner', message: '사용 중인 사용자가 아닙니다.' });
  }
  if (details.length) throw Errors.validation(details);
}

export async function createTestCase(input: CreateTestCaseInput, user: User): Promise<TestCaseSummary> {
  assertCanEdit(user);
  validateRefs(input);
  const created = await testCaseStore.update((draft) => {
    if (draft.testCases.some((t) => t.id === input.id)) {
      throw Errors.validation([{ field: 'id', message: `테스트케이스 ID '${input.id}'가 이미 있습니다.` }]);
    }
    const now = nowIso();
    const tc: TestCase = { ...input, createdAt: now, createdBy: user.id, updatedAt: now, version: 1 };
    draft.testCases.push(tc);
    return tc;
  });
  return toSummary(created, issueCounts());
}

export async function patchTestCase(id: string, input: PatchTestCaseInput, user: User): Promise<TestCaseSummary> {
  assertCanEdit(user);
  const { changes } = input;
  if (changes.testType !== undefined) {
    const linked = allIssues().some((i) => !i.deleted && i.testCaseId === id && i.testType !== changes.testType);
    if (linked) throw Errors.precondition('연결된 이슈와 테스트구분이 달라지므로 테스트구분을 바꿀 수 없습니다.');
  }
  const updated = await testCaseStore.update((draft) => {
    const target = draft.testCases.find((t) => t.id === id);
    if (!target) throw Errors.notFound('테스트케이스를 찾을 수 없습니다.');
    if (target.version !== input.version) throw Errors.versionConflict();
    validateRefs({
      module: changes.module !== undefined && changes.module !== target.module ? changes.module : undefined,
      owner: changes.owner !== undefined && changes.owner !== target.owner ? changes.owner : undefined,
    });
    Object.assign(target, changes);
    target.updatedAt = nowIso();
    target.version += 1;
    return target;
  });
  return toSummary(updated, issueCounts());
}

export async function deleteTestCase(id: string, user: User): Promise<void> {
  if (user.role !== 'MANAGER') throw Errors.forbidden();
  if (allIssues().some((i) => i.testCaseId === id)) {
    throw Errors.configInUse('이슈에 연결된 테스트케이스라 삭제할 수 없습니다. 사용 안 함으로 변경하세요.');
  }
  await testCaseStore.update((draft) => {
    const idx = draft.testCases.findIndex((t) => t.id === id);
    if (idx < 0) throw Errors.notFound('테스트케이스를 찾을 수 없습니다.');
    draft.testCases.splice(idx, 1);
  });
}
