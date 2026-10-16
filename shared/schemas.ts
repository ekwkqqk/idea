import { z } from 'zod';
import {
  CAUSE, ENVIRONMENT, ISSUE_TYPE, PRIORITY, REJECT_REASON, RETEST_RESULT, ROLE, SEVERITY, STATUS, TEST_TYPE, keysOf,
} from './codes';
import { isValidDate } from './dates';

const REQUIRED = '필수 입력입니다.';

const req = (max: number) => z.string({ required_error: REQUIRED }).trim().min(1, REQUIRED).max(max, `${max}자 이하로 입력하세요.`);
const opt = (max: number) => z.string().trim().max(max, `${max}자 이하로 입력하세요.`).default('');
const dateStr = z.string({ required_error: REQUIRED }).refine(isValidDate, '날짜 형식(YYYY-MM-DD)이 아닙니다.');
const userId = z.string().trim().min(1, REQUIRED);

export const issueFields = {
  testRound: z.string().trim().min(1).nullable().default(null),
  issueType: z.enum(keysOf(ISSUE_TYPE)).default('DEFECT'),
  module: z.string({ required_error: REQUIRED }).trim().min(1, REQUIRED),
  programId: opt(50),
  testCaseId: opt(50),
  title: req(200),
  steps: req(4000),
  expected: req(2000),
  actual: req(2000),
  environment: z.enum(keysOf(ENVIRONMENT)).default('TEST'),
  severity: z.enum(keysOf(SEVERITY), { required_error: REQUIRED }),
  priority: z.enum(keysOf(PRIORITY)).default('MEDIUM'),
  reporter: userId,
  foundDate: dateStr,
  assignee: z.string().trim().min(1).nullable().default(null),
  dueDate: dateStr.nullable().default(null),
};

export const createIssueSchema = z.object({
  testType: z.enum(keysOf(TEST_TYPE), { required_error: REQUIRED }),
  ...issueFields,
}).strict();
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

const patchableFields = z.object({
  testRound: z.string().trim().min(1).nullable(),
  issueType: z.enum(keysOf(ISSUE_TYPE)),
  module: z.string().trim().min(1, REQUIRED),
  programId: z.string().trim().max(50, '50자 이하로 입력하세요.'),
  testCaseId: z.string().trim().max(50, '50자 이하로 입력하세요.'),
  title: req(200),
  steps: req(4000),
  expected: req(2000),
  actual: req(2000),
  environment: z.enum(keysOf(ENVIRONMENT)),
  severity: z.enum(keysOf(SEVERITY)),
  priority: z.enum(keysOf(PRIORITY)),
  reporter: userId,
  foundDate: dateStr,
  dueDate: dateStr,
  assignee: z.string().trim().min(1).nullable(),
}).partial().strict();

export const patchIssueSchema = z.object({
  version: z.number().int(),
  changes: patchableFields,
}).strict();
export type PatchIssueInput = z.infer<typeof patchIssueSchema>;

export const transitionSchema = z.discriminatedUnion('action', [
  z.object({ version: z.number().int(), action: z.literal('ASSIGN'), payload: z.object({ assignee: userId }) }),
  z.object({
    version: z.number().int(),
    action: z.literal('REJECT'),
    payload: z.object({
      reason: z.enum(keysOf(REJECT_REASON), { required_error: REQUIRED }),
      duplicateOf: z.string().trim().min(1).nullable().default(null),
      comment: req(1000),
    }),
  }),
  z.object({ version: z.number().int(), action: z.literal('START'), payload: z.object({}).default({}) }),
  z.object({ version: z.number().int(), action: z.literal('RESOLVE'), payload: z.object({}).default({}) }),
  z.object({ version: z.number().int(), action: z.literal('APPEAL'), payload: z.object({ comment: req(2000) }) }),
  z.object({ version: z.number().int(), action: z.literal('REOPEN'), payload: z.object({ comment: req(1000) }) }),
  z.object({
    version: z.number().int(),
    action: z.literal('FORCE'),
    payload: z.object({ to: z.enum(keysOf(STATUS)), comment: req(1000) }),
  }),
]);
export type TransitionInput = z.infer<typeof transitionSchema>;

export const resolutionSchema = z.object({
  version: z.number().int(),
  cause: z.enum(keysOf(CAUSE), { required_error: REQUIRED }),
  causeDetail: req(2000),
  action: req(4000),
  changedFiles: opt(1000),
  buildVersion: opt(50),
  resolvedDate: dateStr,
  resolveNow: z.boolean().default(false),
}).strict();
export type ResolutionInput = z.infer<typeof resolutionSchema>;

export const retestSchema = z.object({
  version: z.number().int(),
  result: z.enum(keysOf(RETEST_RESULT), { required_error: REQUIRED }),
  comment: opt(2000),
  testedDate: dateStr,
}).strict().refine((v) => v.result !== 'FAIL' || v.comment.length > 0, {
  path: ['comment'],
  message: 'Fail이면 확인 의견을 입력하세요.',
});
export type RetestInput = z.infer<typeof retestSchema>;

export const commentSchema = z.object({ body: req(2000) }).strict();

export const configSchema = z.object({
  project: z.object({
    name: req(100),
    testRounds: z.array(z.string().trim().min(1).max(20)),
  }),
  users: z.array(z.object({
    id: z.string().trim().regex(/^u-[A-Za-z0-9_-]+$/, '사용자 ID는 u- 로 시작하는 영문·숫자여야 합니다.'),
    name: req(50),
    role: z.enum(keysOf(ROLE)),
    org: opt(50),
    active: z.boolean(),
  })).min(1),
  modules: z.array(z.object({
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, '모듈 코드는 영문·숫자 20자 이하입니다.'),
    name: req(50),
    managerId: z.string().trim().min(1).nullable().default(null),
    active: z.boolean(),
  })),
  settings: z.object({
    dueDays: z.object({
      CRITICAL: z.number().int().min(1).max(365),
      HIGH: z.number().int().min(1).max(365),
      MEDIUM: z.number().int().min(1).max(365),
      LOW: z.number().int().min(1).max(365),
    }),
    staleDays: z.number().int().min(1).max(365),
    backupRetentionDays: z.number().int().min(1).max(365),
  }),
}).strict();
