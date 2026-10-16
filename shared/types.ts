import type {
  Cause, Environment, IssueType, Priority, RejectReason, RetestResult, Role, Severity, Status, TestType,
} from './codes';

export interface Attachment {
  id: string;
  fileName: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Resolution {
  seq: number;
  cause: Cause;
  causeDetail: string;
  action: string;
  changedFiles: string;
  buildVersion: string;
  resolver: string;
  resolvedDate: string;
  createdAt: string;
}

export interface Retest {
  seq: number;
  resolutionSeq: number;
  result: RetestResult;
  comment: string;
  tester: string;
  testedDate: string;
  attachments: Attachment[];
  createdAt: string;
}

export interface Rejection {
  reason: RejectReason;
  duplicateOf: string | null;
  comment: string;
  rejectedBy: string;
  rejectedAt: string;
}

export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export type HistoryAction =
  | 'CREATE' | 'UPDATE' | 'TRANSITION' | 'RESOLVE' | 'RETEST' | 'ATTACH' | 'DETACH' | 'DELETE' | 'IMPORT';

export interface History {
  at: string;
  user: string;
  action: HistoryAction;
  field: string | null;
  from: string | null;
  to: string | null;
  note: string | null;
}

export interface Issue {
  id: string;
  testType: TestType;
  testRound: string | null;
  issueType: IssueType;
  module: string;
  programId: string;
  testCaseId: string;
  title: string;
  steps: string;
  expected: string;
  actual: string;
  environment: Environment;
  severity: Severity;
  priority: Priority;
  status: Status;
  reporter: string;
  assignee: string | null;
  foundDate: string;
  dueDate: string;
  rejection: Rejection | null;
  resolutions: Resolution[];
  retests: Retest[];
  attachments: Attachment[];
  comments: Comment[];
  history: History[];
  reopenCount: number;
  closedAt: string | null;
  deleted: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  version: number;
}

export interface IssuesFile {
  schemaVersion: number;
  sequences: Record<TestType, number>;
  issues: Issue[];
}

export interface User {
  id: string;
  name: string;
  role: Role;
  org: string;
  active: boolean;
}

export interface Module {
  code: string;
  name: string;
  managerId: string | null;
  active: boolean;
}

export interface Config {
  project: { name: string; testRounds: string[] };
  users: User[];
  modules: Module[];
  settings: {
    dueDays: Record<Severity, number>;
    staleDays: number;
    backupRetentionDays: number;
  };
}

export interface IssueSummary {
  id: string;
  testType: TestType;
  module: string;
  programId: string;
  title: string;
  severity: Severity;
  priority: Priority;
  status: Status;
  reporter: string;
  assignee: string | null;
  foundDate: string;
  dueDate: string;
  elapsedDays: number;
  overdue: boolean;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export type IssueDetail = Issue & { availableActions: string[] };

export interface Stats {
  summary: { total: number; open: number; resolved: number; closed: number; rejected: number; overdue: number; closeRate: number };
  byStatus: Record<Status, number>;
  bySeverity: { severity: Severity; open: number; closed: number }[];
  byModule: { module: string; total: number; open: number; closeRate: number }[];
  byAssignee: { assignee: string; assigned: number; inProgress: number; reopened: number; overdue: number }[];
  daily: { date: string; found: number; closed: number; openAccum: number }[];
  stale: { id: string; title: string; severity: Severity; status: Status; assignee: string | null; elapsedDays: number; overdue: boolean }[];
}

export interface ImportRow {
  row: number;
  status: 'OK' | 'ERROR';
  id?: string;
  exists?: boolean;
  title?: string;
  errors?: string[];
}

export interface ImportPreview {
  importId: string;
  rows: ImportRow[];
  summary: { ok: number; error: number; existing: number };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: { field?: string; message: string }[] };
}
