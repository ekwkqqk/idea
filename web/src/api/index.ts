import type {
  CreateIssueInput, CreateTestCaseInput, PatchIssueInput, PatchTestCaseInput, TransitionInput,
} from '@shared/schemas';
import type { Config, ImportPreview, IssueDetail, IssueSummary, Page, Stats, TestCaseSummary } from '@shared/types';
import { http, toQuery } from './client';

export type IssueQuery = Record<string, string | undefined>;

export const api = {
  config: () => http.get<Config>('/api/config'),
  saveConfig: (config: Config) => http.send<Config>('PUT', '/api/config', config),
  configUsage: () => http.get<{ users: string[]; modules: string[] }>('/api/config/usage'),

  issues: (q: IssueQuery) => http.get<Page<IssueSummary>>(`/api/issues${toQuery(q)}`),
  issue: (id: string) => http.get<IssueDetail>(`/api/issues/${id}`),
  createIssue: (input: Partial<CreateIssueInput>) => http.send<IssueDetail>('POST', '/api/issues', input),
  patchIssue: (id: string, input: PatchIssueInput) => http.send<IssueDetail>('PATCH', `/api/issues/${id}`, input),
  deleteIssue: (id: string) => http.send<void>('DELETE', `/api/issues/${id}`),
  transition: (id: string, input: TransitionInput) => http.send<IssueDetail>('POST', `/api/issues/${id}/transitions`, input),
  addResolution: (id: string, input: Record<string, unknown>) =>
    http.send<IssueDetail>('POST', `/api/issues/${id}/resolutions`, input),
  addRetest: (id: string, input: Record<string, unknown>) => http.send<IssueDetail>('POST', `/api/issues/${id}/retests`, input),
  addComment: (id: string, body: string) => http.send<IssueDetail>('POST', `/api/issues/${id}/comments`, { body }),
  editComment: (id: string, commentId: string, body: string) =>
    http.send<IssueDetail>('PATCH', `/api/issues/${id}/comments/${commentId}`, { body }),
  deleteComment: (id: string, commentId: string) => http.send<IssueDetail>('DELETE', `/api/issues/${id}/comments/${commentId}`),

  uploadAttachments: (id: string, files: File[], retestSeq?: number) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    return http.upload<IssueDetail>(`/api/issues/${id}/attachments${toQuery({ retestSeq })}`, form);
  },
  deleteAttachment: (id: string, attachmentId: string) =>
    http.send<IssueDetail>('DELETE', `/api/issues/${id}/attachments/${attachmentId}`),
  attachmentUrl: (attachmentId: string, inline = false) => `/api/attachments/${attachmentId}${inline ? '?inline=1' : ''}`,
  downloadAttachment: (attachmentId: string, name: string) => http.download(`/api/attachments/${attachmentId}`, name),

  stats: (q: IssueQuery) => http.get<Stats>(`/api/stats${toQuery(q)}`),
  exportExcel: (q: IssueQuery) => http.download(`/api/export${toQuery(q)}`, '결함관리대장.xlsx'),
  downloadTemplate: () => http.download('/api/import/template', '결함관리대장_가져오기양식.xlsx'),
  importPreview: (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return http.upload<ImportPreview>('/api/import/preview', form);
  },
  importCommit: (importId: string, onExisting: 'SKIP' | 'OVERWRITE') =>
    http.send<ImportResult>('POST', '/api/import/commit', { importId, onExisting }),

  testCases: (q: IssueQuery) => http.get<Page<TestCaseSummary>>(`/api/testcases${toQuery(q)}`),
  testCase: (id: string) => http.get<TestCaseSummary>(`/api/testcases/${encodeURIComponent(id)}`),
  createTestCase: (input: Partial<CreateTestCaseInput>) => http.send<TestCaseSummary>('POST', '/api/testcases', input),
  patchTestCase: (id: string, input: PatchTestCaseInput) =>
    http.send<TestCaseSummary>('PATCH', `/api/testcases/${encodeURIComponent(id)}`, input),
  deleteTestCase: (id: string) => http.send<void>('DELETE', `/api/testcases/${encodeURIComponent(id)}`),
  downloadTestCaseTemplate: () => http.download('/api/testcases/import/template', '테스트케이스_가져오기양식.xlsx'),
  testCaseImportPreview: (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return http.upload<ImportPreview>('/api/testcases/import/preview', form);
  },
  testCaseImportCommit: (importId: string, onExisting: 'SKIP' | 'OVERWRITE') =>
    http.send<ImportResult>('POST', '/api/testcases/import/commit', { importId, onExisting }),
};

export type ImportResult = { created: number; overwritten: number; skipped: number };
