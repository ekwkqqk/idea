import type { Role, Status } from './codes';
import type { Issue, User } from './types';

export type TransitionAction = 'ASSIGN' | 'REJECT' | 'START' | 'RESOLVE' | 'APPEAL' | 'REOPEN';
type Actor = 'ASSIGNEE' | 'REPORTER';

export interface Transition {
  id: string;
  action: TransitionAction;
  from: Status;
  to: Status;
  allow: Array<{ role: Role; actor?: Actor }>;
}

export const TRANSITIONS: Transition[] = [
  { id: 'T01', action: 'ASSIGN',  from: 'NEW',         to: 'ASSIGNED',    allow: [{ role: 'MANAGER' }] },
  { id: 'T02', action: 'REJECT',  from: 'NEW',         to: 'REJECTED',    allow: [{ role: 'MANAGER' }] },
  { id: 'T03', action: 'START',   from: 'ASSIGNED',    to: 'IN_PROGRESS', allow: [{ role: 'DEVELOPER', actor: 'ASSIGNEE' }, { role: 'MANAGER' }] },
  { id: 'T04', action: 'REJECT',  from: 'ASSIGNED',    to: 'REJECTED',    allow: [{ role: 'MANAGER' }] },
  { id: 'T05', action: 'RESOLVE', from: 'IN_PROGRESS', to: 'RESOLVED',    allow: [{ role: 'DEVELOPER', actor: 'ASSIGNEE' }, { role: 'MANAGER' }] },
  { id: 'T08', action: 'START',   from: 'REOPENED',    to: 'IN_PROGRESS', allow: [{ role: 'DEVELOPER', actor: 'ASSIGNEE' }, { role: 'MANAGER' }] },
  { id: 'T09', action: 'APPEAL',  from: 'REJECTED',    to: 'NEW',         allow: [{ role: 'TESTER', actor: 'REPORTER' }, { role: 'MANAGER' }] },
  { id: 'T10', action: 'REOPEN',  from: 'CLOSED',      to: 'REOPENED',    allow: [{ role: 'MANAGER' }] },
];

export const ASSIGNEE_CHANGE_STATUSES: readonly Status[] = ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'];
export const RESOLUTION_STATUSES: readonly Status[] = ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'];

export function findTransition(from: Status, action: string): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.action === action);
}

export type PermissionResult = 'OK' | 'FORBIDDEN_TRANSITION' | 'NOT_ASSIGNEE';

export function checkTransitionPermission(t: Transition, issue: Issue, user: User): PermissionResult {
  const rules = t.allow.filter((a) => a.role === user.role);
  if (rules.length === 0) return 'FORBIDDEN_TRANSITION';
  const ok = rules.some((r) =>
    !r.actor
    || (r.actor === 'ASSIGNEE' && issue.assignee === user.id)
    || (r.actor === 'REPORTER' && issue.reporter === user.id));
  if (ok) return 'OK';
  return rules.some((r) => r.actor === 'ASSIGNEE') ? 'NOT_ASSIGNEE' : 'FORBIDDEN_TRANSITION';
}

/** 마지막 재테스트가 확인한 조치 차수보다 큰 차수의 조치가 있는지 */
export function hasUnverifiedResolution(issue: Issue): boolean {
  const lastResolution = issue.resolutions.at(-1);
  if (!lastResolution) return false;
  const verified = issue.retests.at(-1)?.resolutionSeq ?? 0;
  return lastResolution.seq > verified;
}

export function canEditBasic(issue: Issue, user: User): boolean {
  if (user.role === 'MANAGER') return true;
  if (issue.status === 'CLOSED' || issue.status === 'REJECTED') return false;
  return issue.reporter === user.id || issue.assignee === user.id;
}

export function canAddResolution(issue: Issue, user: User): boolean {
  if (!RESOLUTION_STATUSES.includes(issue.status)) return false;
  return user.role === 'MANAGER' || (user.role === 'DEVELOPER' && issue.assignee === user.id);
}

export function canRetest(issue: Issue, user: User): boolean {
  return issue.status === 'RESOLVED' && (user.role === 'TESTER' || user.role === 'MANAGER');
}

/** 상세 화면 버튼 표시용 행위 목록 */
export function availableActions(issue: Issue, user: User | undefined): string[] {
  if (!user || !user.active || issue.deleted) return [];
  const actions = new Set<string>();
  for (const t of TRANSITIONS) {
    if (t.from === issue.status && checkTransitionPermission(t, issue, user) === 'OK') actions.add(t.action);
  }
  if (canAddResolution(issue, user)) actions.add('ADD_RESOLUTION');
  if (canRetest(issue, user)) actions.add('RETEST');
  if (canEditBasic(issue, user)) actions.add('EDIT');
  if (user.role === 'MANAGER') {
    actions.add('FORCE');
    actions.add('DELETE');
    if (ASSIGNEE_CHANGE_STATUSES.includes(issue.status)) actions.add('REASSIGN');
  }
  return [...actions];
}
