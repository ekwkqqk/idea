import { randomUUID } from 'node:crypto';
import type { Status } from '../../shared/codes';
import { nowIso } from '../../shared/dates';
import type { TransitionInput } from '../../shared/schemas';
import { checkTransitionPermission, findTransition, hasUnverifiedResolution } from '../../shared/transitions';
import type { Issue, IssuesFile, User } from '../../shared/types';
import { Errors } from '../errors';
import { findUser } from '../repository/configRepository';
import { addHistory } from './common';

export function assertAssignable(userId: string, field = 'assignee') {
  const assignee = findUser(userId);
  if (!assignee || !assignee.active || (assignee.role !== 'DEVELOPER' && assignee.role !== 'MANAGER')) {
    throw Errors.validation([{ field, message: '담당자는 사용 중인 개발자 또는 PL/PM이어야 합니다.' }]);
  }
}

function setStatus(issue: Issue, to: Status, user: User, note: string | null = null) {
  const from = issue.status;
  issue.status = to;
  if (to === 'CLOSED') issue.closedAt = nowIso();
  else if (from === 'CLOSED') issue.closedAt = null;
  addHistory(issue, user, 'TRANSITION', { field: 'status', from, to, note });
}

/** 상태 전이표에 따른 전이 (재테스트 결과에 의한 전이는 issueService.addRetest에서 처리) */
export function applyTransition(draft: IssuesFile, issue: Issue, input: TransitionInput, user: User) {
  if (input.action === 'FORCE') {
    if (user.role !== 'MANAGER') throw Errors.forbiddenTransition();
    if (input.payload.to === issue.status) throw Errors.invalidTransition();
    if (issue.status === 'REJECTED') issue.rejection = null;
    setStatus(issue, input.payload.to, user, `강제 변경: ${input.payload.comment}`);
    return;
  }

  const transition = findTransition(issue.status, input.action);
  if (!transition) throw Errors.invalidTransition();
  const permission = checkTransitionPermission(transition, issue, user);
  if (permission === 'NOT_ASSIGNEE') throw Errors.notAssignee();
  if (permission !== 'OK') throw Errors.forbiddenTransition();

  switch (input.action) {
    case 'ASSIGN': {
      assertAssignable(input.payload.assignee, 'payload.assignee');
      addHistory(issue, user, 'UPDATE', { field: 'assignee', from: issue.assignee, to: input.payload.assignee });
      issue.assignee = input.payload.assignee;
      setStatus(issue, transition.to, user);
      break;
    }
    case 'REJECT': {
      const { reason, duplicateOf, comment } = input.payload;
      if (reason === 'DUPLICATE') {
        if (!duplicateOf) throw Errors.validation([{ field: 'payload.duplicateOf', message: '중복이면 원본 이슈 ID를 입력하세요.' }]);
        if (duplicateOf === issue.id) throw Errors.validation([{ field: 'payload.duplicateOf', message: '자기 자신을 원본으로 지정할 수 없습니다.' }]);
        if (!draft.issues.some((i) => i.id === duplicateOf && !i.deleted)) {
          throw Errors.precondition(`원본 이슈 ${duplicateOf}를 찾을 수 없습니다.`);
        }
      }
      issue.rejection = {
        reason,
        duplicateOf: reason === 'DUPLICATE' ? duplicateOf : null,
        comment,
        rejectedBy: user.id,
        rejectedAt: nowIso(),
      };
      setStatus(issue, transition.to, user, `반려(${reason}${reason === 'DUPLICATE' ? `: ${duplicateOf}` : ''}): ${comment}`);
      break;
    }
    case 'START':
      setStatus(issue, transition.to, user);
      break;
    case 'RESOLVE':
      if (!hasUnverifiedResolution(issue)) throw Errors.precondition('조치 내역을 먼저 등록하세요.');
      setStatus(issue, transition.to, user);
      break;
    case 'APPEAL': {
      const prev = issue.rejection;
      issue.rejection = null;
      const now = nowIso();
      issue.comments.push({ id: randomUUID(), author: user.id, body: `[이의 제기] ${input.payload.comment}`, createdAt: now, updatedAt: now, deleted: false });
      setStatus(issue, transition.to, user, prev ? `이의 제기 (이전 반려 사유: ${prev.reason}, ${prev.comment})` : '이의 제기');
      break;
    }
    case 'REOPEN':
      issue.reopenCount += 1;
      setStatus(issue, transition.to, user, `재오픈: ${input.payload.comment}`);
      break;
  }
}

export function autoStart(issue: Issue, user: User) {
  if (issue.status === 'ASSIGNED' || issue.status === 'REOPENED') setStatus(issue, 'IN_PROGRESS', user, '조치 등록으로 자동 착수');
}

export function applyRetestResult(issue: Issue, user: User, pass: boolean) {
  if (!pass) issue.reopenCount += 1;
  const from = issue.status;
  issue.status = pass ? 'CLOSED' : 'REOPENED';
  if (pass) issue.closedAt = nowIso();
  addHistory(issue, user, 'RETEST', { field: 'status', from, to: issue.status, note: pass ? 'PASS' : 'FAIL' });
}
