import type { Issue, IssuesFile } from '../../shared/types';
import { Errors } from '../errors';
import { ISSUES_FILE } from '../paths';
import { FileStore } from './fileStore';

const SCHEMA_VERSION = 1;

export const issueStore = new FileStore<IssuesFile>(ISSUES_FILE, () => ({
  schemaVersion: SCHEMA_VERSION,
  sequences: { UT: 0, IT: 0 },
  issues: [],
}));

export function loadIssues() {
  issueStore.load((raw) => {
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`지원하지 않는 issues.json 버전입니다: ${raw.schemaVersion}`);
    }
    return raw;
  });
}

export function allIssues(): Issue[] {
  return issueStore.read().issues;
}

export function getIssue(id: string): Issue {
  const issue = issueStore.read().issues.find((i) => i.id === id && !i.deleted);
  if (!issue) throw Errors.notFound('이슈를 찾을 수 없습니다.');
  return issue;
}

/** 쓰기 큐 안에서 복사본의 이슈를 찾는다 */
export function findInDraft(draft: IssuesFile, id: string): Issue {
  const issue = draft.issues.find((i) => i.id === id && !i.deleted);
  if (!issue) throw Errors.notFound('이슈를 찾을 수 없습니다.');
  return issue;
}

export function nextId(draft: IssuesFile, testType: 'UT' | 'IT'): string {
  draft.sequences[testType] += 1;
  return formatId(testType, draft.sequences[testType]);
}

export function formatId(testType: string, seq: number): string {
  return `${testType}-${String(seq).padStart(4, '0')}`;
}
