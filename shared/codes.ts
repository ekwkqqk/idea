export const TEST_TYPE = { UT: '단위', IT: '통합' } as const;
export const ISSUE_TYPE = { DEFECT: '결함', IMPROVEMENT: '개선', QUESTION: '문의' } as const;
export const SEVERITY = { CRITICAL: '치명', HIGH: '높음', MEDIUM: '보통', LOW: '낮음' } as const;
export const PRIORITY = { URGENT: '긴급', HIGH: '높음', MEDIUM: '보통', LOW: '낮음' } as const;
export const ENVIRONMENT = { DEV: '개발', TEST: '테스트', STAGING: '스테이징' } as const;

export const STATUS = {
  NEW: '신규',
  ASSIGNED: '접수',
  IN_PROGRESS: '조치중',
  RESOLVED: '조치완료',
  REOPENED: '재오픈',
  CLOSED: '종료',
  REJECTED: '반려',
} as const;

export const CAUSE = {
  CODING: '코딩오류',
  DESIGN: '설계오류',
  REQUIREMENT: '요구사항 누락·변경',
  ENVIRONMENT: '환경·설정',
  DATA: '데이터',
  INTERFACE: '연계시스템',
  ETC: '기타',
} as const;

export const REJECT_REASON = {
  DUPLICATE: '중복',
  NOT_ISSUE: '이슈 아님',
  OUT_OF_SCOPE: '범위 외',
  CANNOT_REPRODUCE: '재현 불가',
} as const;

export const RETEST_RESULT = { PASS: 'Pass', FAIL: 'Fail' } as const;
export const ROLE = { TESTER: '테스터', DEVELOPER: '개발자', MANAGER: 'PL/PM' } as const;

export const SEVERITY_GUIDE: Record<keyof typeof SEVERITY, string> = {
  CRITICAL: '시스템 중단, 데이터 손상, 핵심 업무 진행 불가, 대안 없음',
  HIGH: '주요 기능 오동작, 우회 방법은 있으나 업무 영향 큼',
  MEDIUM: '일부 기능 오류, 업무 영향 제한적',
  LOW: '화면 문구, 정렬, UI 등 경미한 오류',
};

export type TestType = keyof typeof TEST_TYPE;
export type IssueType = keyof typeof ISSUE_TYPE;
export type Severity = keyof typeof SEVERITY;
export type Priority = keyof typeof PRIORITY;
export type Environment = keyof typeof ENVIRONMENT;
export type Status = keyof typeof STATUS;
export type Cause = keyof typeof CAUSE;
export type RejectReason = keyof typeof REJECT_REASON;
export type RetestResult = keyof typeof RETEST_RESULT;
export type Role = keyof typeof ROLE;

export const OPEN_STATUSES: readonly Status[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REOPENED'];

export const keysOf = <T extends Record<string, string>>(obj: T) => Object.keys(obj) as [keyof T & string, ...(keyof T & string)[]];

export function codeByLabel<T extends Record<string, string>>(obj: T, value: string): (keyof T & string) | undefined {
  const v = value.trim();
  if (v in obj) return v as keyof T & string;
  const found = Object.entries(obj).find(([, label]) => label.toLowerCase() === v.toLowerCase());
  return found?.[0] as (keyof T & string) | undefined;
}
