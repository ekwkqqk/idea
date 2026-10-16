import { CAUSE, ENVIRONMENT, ISSUE_TYPE, PRIORITY, SEVERITY, STATUS, TEST_TYPE } from '@shared/codes';
import type { History } from '@shared/types';

export const FIELD_LABEL: Record<string, string> = {
  testRound: '테스트 차수',
  issueType: '이슈유형',
  module: '모듈',
  programId: '화면/프로그램 ID',
  testCaseId: '테스트케이스 ID',
  title: '제목',
  steps: '재현 절차',
  expected: '기대 결과',
  actual: '실제 결과',
  environment: '테스트 환경',
  severity: '심각도',
  priority: '우선순위',
  reporter: '발견자',
  assignee: '담당자',
  foundDate: '발견일',
  dueDate: '조치 기한',
  status: '상태',
  attachments: '첨부',
  resolutions: '조치',
};

const VALUE_MAP: Record<string, Record<string, string>> = {
  status: STATUS,
  severity: SEVERITY,
  priority: PRIORITY,
  issueType: ISSUE_TYPE,
  environment: ENVIRONMENT,
  testType: TEST_TYPE,
};

const ACTION_LABEL: Record<History['action'], string> = {
  CREATE: '등록',
  UPDATE: '수정',
  TRANSITION: '상태 변경',
  RESOLVE: '조치 등록',
  RETEST: '재테스트',
  ATTACH: '첨부 추가',
  DETACH: '첨부 삭제',
  DELETE: '삭제',
  IMPORT: '엑셀 가져오기',
};

export function describeHistory(
  h: History,
  userName: (id: string | null) => string,
  moduleName: (code: string | null) => string,
): string {
  const value = (v: string | null) => {
    if (v === null || v === '') return '(없음)';
    if (!h.field) return v;
    if (h.field === 'reporter' || h.field === 'assignee') return userName(v);
    if (h.field === 'module') return moduleName(v);
    if (h.field === 'resolutions') return v;
    return VALUE_MAP[h.field]?.[v] ?? v;
  };
  switch (h.action) {
    case 'CREATE':
    case 'DELETE':
    case 'IMPORT':
      return `${ACTION_LABEL[h.action]}${h.note ? ` (${h.note})` : ''}`;
    case 'RESOLVE':
      return `조치 등록: ${h.to ?? ''}${h.note ? ` (원인: ${CAUSE[h.note as keyof typeof CAUSE] ?? h.note})` : ''}`;
    case 'ATTACH':
      return `첨부 추가: ${h.to}${h.note ? ` (${h.note})` : ''}`;
    case 'DETACH':
      return `첨부 삭제: ${h.from}`;
    case 'RETEST':
      return `상태: ${value(h.from)} -> ${value(h.to)} (재테스트 ${h.note})`;
    default:
      return `${FIELD_LABEL[h.field ?? ''] ?? h.field}: ${value(h.from)} -> ${value(h.to)}${h.note ? ` (${h.note})` : ''}`;
  }
}
