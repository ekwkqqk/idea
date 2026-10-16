import { randomUUID } from 'node:crypto';
import { OPEN_STATUSES, type Status } from '../../shared/codes';
import { addDays, diffDays, nowIso, today } from '../../shared/dates';
import type { CreateIssueInput, PatchIssueInput, ResolutionInput, RetestInput, TransitionInput } from '../../shared/schemas';
import {
  ASSIGNEE_CHANGE_STATUSES, availableActions, canAddResolution, canEditBasic, canRetest,
} from '../../shared/transitions';
import type { Attachment, Issue, IssueDetail, IssueSummary, Page, User } from '../../shared/types';
import { Errors, type ErrorDetail } from '../errors';
import { findUser, getConfig } from '../repository/configRepository';
import { allIssues, findInDraft, getIssue, issueStore, nextId } from '../repository/issueRepository';
import { addHistory, checkVersion, touch } from './common';
import { applyRetestResult, applyTransition, assertAssignable, autoStart } from './workflow';

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

export interface SearchQuery {
  testType?: string;
  testRound?: string;
  status?: string;
  severity?: string;
  issueType?: string;
  module?: string;
  assignee?: string;
  reporter?: string;
  foundFrom?: string;
  foundTo?: string;
  overdue?: string;
  q?: string;
  sort?: string;
  page?: string;
  size?: string;
}

const isOpen = (s: Status) => OPEN_STATUSES.includes(s);

export function isOverdue(issue: Issue, base = today()): boolean {
  return isOpen(issue.status) && base > issue.dueDate;
}

export function elapsedDays(issue: Issue, base = today()): number {
  if (issue.status === 'CLOSED' && issue.closedAt) return diffDays(issue.foundDate, issue.closedAt.slice(0, 10));
  if (issue.status === 'REJECTED' && issue.rejection) return diffDays(issue.foundDate, issue.rejection.rejectedAt.slice(0, 10));
  return diffDays(issue.foundDate, base);
}

const csv = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

export function filterIssues(query: SearchQuery): Issue[] {
  const rawStatuses = csv(query.status);
  const statuses = rawStatuses.includes('ALL') ? [] : rawStatuses.flatMap((s) => (s === 'OPEN' ? [...OPEN_STATUSES] : [s]));
  const severities = csv(query.severity);
  const keyword = query.q?.trim().toLowerCase();
  const base = today();

  return allIssues().filter((i) => {
    if (i.deleted) return false;
    if (query.testType && i.testType !== query.testType) return false;
    if (query.testRound && i.testRound !== query.testRound) return false;
    if (statuses.length && !statuses.includes(i.status)) return false;
    if (severities.length && !severities.includes(i.severity)) return false;
    if (query.issueType && i.issueType !== query.issueType) return false;
    if (query.module && i.module !== query.module) return false;
    if (query.assignee && i.assignee !== query.assignee) return false;
    if (query.reporter && i.reporter !== query.reporter) return false;
    if (query.foundFrom && i.foundDate < query.foundFrom) return false;
    if (query.foundTo && i.foundDate > query.foundTo) return false;
    if (query.overdue === 'true' && !isOverdue(i, base)) return false;
    if (keyword) {
      const hay = `${i.id}\n${i.title}\n${i.steps}\n${i.programId}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
}

export function toSummary(i: Issue, base = today()): IssueSummary {
  return {
    id: i.id,
    testType: i.testType,
    module: i.module,
    programId: i.programId,
    title: i.title,
    severity: i.severity,
    priority: i.priority,
    status: i.status,
    reporter: i.reporter,
    assignee: i.assignee,
    foundDate: i.foundDate,
    dueDate: i.dueDate,
    elapsedDays: elapsedDays(i, base),
    overdue: isOverdue(i, base),
    updatedAt: i.updatedAt,
  };
}

const SORT_ORDER: Record<string, string[]> = {
  severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
  priority: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
  status: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REOPENED', 'CLOSED', 'REJECTED'],
};

export function sortSummaries(items: IssueSummary[], sort = 'foundDate,desc'): IssueSummary[] {
  const [field, dir] = sort.split(',');
  const key = (field in (items[0] ?? {}) ? field : 'foundDate') as keyof IssueSummary;
  const sign = dir === 'asc' ? 1 : -1;
  const rank = (v: unknown) => (SORT_ORDER[key] ? SORT_ORDER[key].indexOf(String(v)) : v);
  return [...items].sort((a, b) => {
    const va = rank(a[key]);
    const vb = rank(b[key]);
    if (va === vb) return a.id < b.id ? sign : -sign;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return (va < vb ? -1 : 1) * sign;
  });
}

export function searchIssues(query: SearchQuery): Page<IssueSummary> {
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(query.size) || 20));
  const base = today();
  const items = sortSummaries(filterIssues(query).map((i) => toSummary(i, base)), query.sort);
  return { items: items.slice((page - 1) * size, page * size), total: items.length, page, size };
}

export function toDetail(issue: Issue, user: User | undefined): IssueDetail {
  return { ...issue, availableActions: availableActions(issue, user) };
}

export function getIssueDetail(id: string, user: User | undefined): IssueDetail {
  return toDetail(getIssue(id), user);
}

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

type RefFields = Partial<{
  module: string;
  reporter: string;
  assignee: string | null;
  testRound: string | null;
  foundDate: string;
  dueDate: string | null;
}>;

/** 설정값 참조와 날짜 규칙 검증. fields에는 새로 입력된 값만 넣는다 */
function validateRefs(fields: RefFields, merged: { foundDate: string; dueDate: string | null }) {
  const cfg = getConfig();
  const details: ErrorDetail[] = [];
  if (fields.module !== undefined && !cfg.modules.some((m) => m.code === fields.module && m.active)) {
    details.push({ field: 'module', message: '사용 중인 모듈이 아닙니다.' });
  }
  if (fields.reporter !== undefined && !findUser(fields.reporter)?.active) {
    details.push({ field: 'reporter', message: '사용 중인 사용자가 아닙니다.' });
  }
  if (fields.testRound && !cfg.project.testRounds.includes(fields.testRound)) {
    details.push({ field: 'testRound', message: '설정에 없는 테스트 차수입니다.' });
  }
  if (fields.foundDate !== undefined && fields.foundDate > today()) {
    details.push({ field: 'foundDate', message: '발견일은 오늘 이후일 수 없습니다.' });
  }
  if (merged.dueDate && merged.dueDate < merged.foundDate) {
    details.push({ field: 'dueDate', message: '조치 기한은 발견일 이후여야 합니다.' });
  }
  if (details.length) throw Errors.validation(details);
  if (fields.assignee) assertAssignable(fields.assignee);
}

function validateWorkDate(field: string, date: string, issue: Issue) {
  if (date < issue.foundDate || date > today()) {
    throw Errors.validation([{ field, message: '발견일 이후, 오늘 이전 날짜를 입력하세요.' }]);
  }
}

export function defaultDueDate(foundDate: string, severity: Issue['severity']): string {
  return addDays(foundDate, getConfig().settings.dueDays[severity]);
}

// ---------------------------------------------------------------------------
// 등록 / 수정 / 삭제
// ---------------------------------------------------------------------------

export async function createIssue(input: CreateIssueInput, user: User): Promise<IssueDetail> {
  const assignee = user.role === 'MANAGER' ? input.assignee : null;
  validateRefs({ ...input, assignee }, input);

  const issue = await issueStore.update((draft) => {
    const now = nowIso();
    const created: Issue = {
      id: nextId(draft, input.testType),
      testType: input.testType,
      testRound: input.testRound,
      issueType: input.issueType,
      module: input.module,
      programId: input.programId,
      testCaseId: input.testCaseId,
      title: input.title,
      steps: input.steps,
      expected: input.expected,
      actual: input.actual,
      environment: input.environment,
      severity: input.severity,
      priority: input.priority,
      status: assignee ? 'ASSIGNED' : 'NEW',
      reporter: input.reporter,
      assignee,
      foundDate: input.foundDate,
      dueDate: input.dueDate ?? defaultDueDate(input.foundDate, input.severity),
      rejection: null,
      resolutions: [],
      retests: [],
      attachments: [],
      comments: [],
      history: [],
      reopenCount: 0,
      closedAt: null,
      deleted: false,
      createdAt: now,
      createdBy: user.id,
      updatedAt: now,
      version: 1,
    };
    addHistory(created, user, 'CREATE', { at: now, note: assignee ? `담당자 지정 등록: ${assignee}` : null });
    draft.issues.push(created);
    return created;
  });
  return toDetail(issue, user);
}

export async function patchIssue(id: string, input: PatchIssueInput, user: User): Promise<IssueDetail> {
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    checkVersion(target, input.version);
    if (!canEditBasic(target, user)) throw Errors.forbidden();

    const changes = Object.fromEntries(
      Object.entries(input.changes).filter(([k, v]) => target[k as keyof Issue] !== v),
    ) as PatchIssueInput['changes'];
    if (Object.keys(changes).length === 0) return target;

    if ('assignee' in changes) {
      if (user.role !== 'MANAGER') throw Errors.forbidden('담당자는 PL/PM만 변경할 수 있습니다.');
      if (!ASSIGNEE_CHANGE_STATUSES.includes(target.status)) {
        throw Errors.precondition('담당자 재지정은 접수·조치중·재오픈 상태에서만 할 수 있습니다. 신규 이슈는 [담당자 지정]을 사용하세요.');
      }
      if (!changes.assignee) throw Errors.validation([{ field: 'assignee', message: '담당자를 선택하세요.' }]);
    }

    validateRefs(changes, {
      foundDate: changes.foundDate ?? target.foundDate,
      dueDate: changes.dueDate ?? target.dueDate,
    });

    for (const [field, to] of Object.entries(changes)) {
      addHistory(target, user, 'UPDATE', { field, from: target[field as keyof Issue], to });
    }
    Object.assign(target, changes);
    if ('assignee' in changes && target.status === 'IN_PROGRESS') {
      target.status = 'ASSIGNED';
      addHistory(target, user, 'TRANSITION', { field: 'status', from: 'IN_PROGRESS', to: 'ASSIGNED', note: '담당자 재지정' });
    }
    touch(target);
    return target;
  });
  return toDetail(issue, user);
}

export async function deleteIssue(id: string, user: User): Promise<void> {
  if (user.role !== 'MANAGER') throw Errors.forbidden();
  await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    target.deleted = true;
    addHistory(target, user, 'DELETE');
    touch(target);
  });
}

// ---------------------------------------------------------------------------
// 상태 전이 / 조치 / 재테스트
// ---------------------------------------------------------------------------

export async function transitionIssue(id: string, input: TransitionInput, user: User): Promise<IssueDetail> {
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    checkVersion(target, input.version);
    applyTransition(draft, target, input, user);
    touch(target);
    return target;
  });
  return toDetail(issue, user);
}

export async function addResolution(id: string, input: ResolutionInput, user: User): Promise<IssueDetail> {
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    checkVersion(target, input.version);
    if (!canAddResolution(target, user)) {
      if (target.status === 'NEW' || target.status === 'RESOLVED' || target.status === 'CLOSED' || target.status === 'REJECTED') {
        throw Errors.invalidTransition();
      }
      throw user.role === 'DEVELOPER' ? Errors.notAssignee() : Errors.forbidden();
    }
    validateWorkDate('resolvedDate', input.resolvedDate, target);

    autoStart(target, user);
    const seq = (target.resolutions.at(-1)?.seq ?? 0) + 1;
    target.resolutions.push({
      seq,
      cause: input.cause,
      causeDetail: input.causeDetail,
      action: input.action,
      changedFiles: input.changedFiles,
      buildVersion: input.buildVersion,
      resolver: user.id,
      resolvedDate: input.resolvedDate,
      createdAt: nowIso(),
    });
    addHistory(target, user, 'RESOLVE', { field: 'resolutions', to: `${seq}차 조치`, note: input.cause });
    if (input.resolveNow) {
      applyTransition(draft, target, { version: input.version, action: 'RESOLVE', payload: {} }, user);
    }
    touch(target);
    return target;
  });
  return toDetail(issue, user);
}

export async function addRetest(id: string, input: RetestInput, user: User): Promise<IssueDetail> {
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    checkVersion(target, input.version);
    if (target.status !== 'RESOLVED') throw Errors.invalidTransition();
    if (!canRetest(target, user)) throw Errors.forbiddenTransition();
    validateWorkDate('testedDate', input.testedDate, target);

    target.retests.push({
      seq: (target.retests.at(-1)?.seq ?? 0) + 1,
      resolutionSeq: target.resolutions.at(-1)?.seq ?? 0,
      result: input.result,
      comment: input.comment,
      tester: user.id,
      testedDate: input.testedDate,
      attachments: [],
      createdAt: nowIso(),
    });
    applyRetestResult(target, user, input.result === 'PASS');
    touch(target);
    return target;
  });
  return toDetail(issue, user);
}

// ---------------------------------------------------------------------------
// 코멘트
// ---------------------------------------------------------------------------

export async function addComment(id: string, body: string, user: User): Promise<IssueDetail> {
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    const now = nowIso();
    target.comments.push({ id: randomUUID(), author: user.id, body, createdAt: now, updatedAt: now, deleted: false });
    touch(target);
    return target;
  });
  return toDetail(issue, user);
}

export async function editComment(id: string, commentId: string, body: string | null, user: User): Promise<IssueDetail> {
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    const comment = target.comments.find((c) => c.id === commentId && !c.deleted);
    if (!comment) throw Errors.notFound('코멘트를 찾을 수 없습니다.');
    if (comment.author !== user.id) throw Errors.forbidden('본인 코멘트만 수정·삭제할 수 있습니다.');
    if (body === null) comment.deleted = true;
    else comment.body = body;
    comment.updatedAt = nowIso();
    touch(target);
    return target;
  });
  return toDetail(issue, user);
}

// ---------------------------------------------------------------------------
// 첨부 메타데이터 (파일 실물은 routes/attachments.ts에서 처리)
// ---------------------------------------------------------------------------

export const MAX_ISSUE_ATTACHMENTS = 20;

export function assertCanAttach(id: string, user: User, retestSeq?: number) {
  const issue = getIssue(id);
  if (retestSeq !== undefined) {
    const retest = issue.retests.find((r) => r.seq === retestSeq);
    if (!retest) throw Errors.notFound('재테스트 내역을 찾을 수 없습니다.');
    if (retest.tester !== user.id && user.role !== 'MANAGER') throw Errors.forbidden();
    return issue;
  }
  if (!canEditBasic(issue, user)) throw Errors.forbidden();
  return issue;
}

export async function addAttachments(id: string, files: Attachment[], user: User, retestSeq?: number): Promise<IssueDetail> {
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    const list = retestSeq !== undefined
      ? target.retests.find((r) => r.seq === retestSeq)?.attachments
      : target.attachments;
    if (!list) throw Errors.notFound('재테스트 내역을 찾을 수 없습니다.');
    if (retestSeq === undefined && list.length + files.length > MAX_ISSUE_ATTACHMENTS) {
      throw Errors.validation([{ field: 'files', message: `이슈 첨부는 최대 ${MAX_ISSUE_ATTACHMENTS}개입니다.` }]);
    }
    list.push(...files);
    for (const f of files) {
      addHistory(target, user, 'ATTACH', { field: 'attachments', to: f.fileName, note: retestSeq !== undefined ? `재테스트 ${retestSeq}차` : null });
    }
    touch(target);
    return target;
  });
  return toDetail(issue, user);
}

export function findAttachment(attachmentId: string): { issue: Issue; attachment: Attachment } {
  for (const issue of allIssues()) {
    if (issue.deleted) continue;
    const all = [...issue.attachments, ...issue.retests.flatMap((r) => r.attachments)];
    const attachment = all.find((a) => a.id === attachmentId);
    if (attachment) return { issue, attachment };
  }
  throw Errors.notFound('첨부파일을 찾을 수 없습니다.');
}

export async function removeAttachment(id: string, attachmentId: string, user: User): Promise<{ detail: IssueDetail; removed: Attachment }> {
  let removed: Attachment | undefined;
  const issue = await issueStore.update((draft) => {
    const target = findInDraft(draft, id);
    const lists = [target.attachments, ...target.retests.map((r) => r.attachments)];
    for (const list of lists) {
      const idx = list.findIndex((a) => a.id === attachmentId);
      if (idx < 0) continue;
      const isIssueAttachment = list === target.attachments;
      const owner = list[idx].uploadedBy === user.id;
      if (!(user.role === 'MANAGER' || owner || (isIssueAttachment && canEditBasic(target, user)))) throw Errors.forbidden();
      [removed] = list.splice(idx, 1);
      break;
    }
    if (!removed) throw Errors.notFound('첨부파일을 찾을 수 없습니다.');
    addHistory(target, user, 'DETACH', { field: 'attachments', from: removed.fileName });
    touch(target);
    return target;
  });
  return { detail: toDetail(issue, user), removed: removed! };
}
