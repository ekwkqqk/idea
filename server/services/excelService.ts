import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  CAUSE, ISSUE_TYPE, OPEN_STATUSES, PRIORITY, RETEST_RESULT, SEVERITY, STATUS, TEST_TYPE, codeByLabel,
  type Cause, type IssueType, type Priority, type RetestResult, type Severity, type Status, type TestType,
} from '../../shared/codes';
import { formatDate, isValidDate, nowIso, today } from '../../shared/dates';
import type { Attachment, ImportPreview, ImportRow, Issue, User } from '../../shared/types';
import { attachmentPath } from '../attachmentStore';
import { Errors } from '../errors';
import { logger } from '../logger';
import { findUser, getConfig } from '../repository/configRepository';
import { allIssues, formatId, issueStore } from '../repository/issueRepository';
import { addHistory } from './common';
import {
  defaultDueDate, elapsedDays, filterIssues, isOverdue, sortSummaries, testCaseError, toSummary, type SearchQuery,
} from './issueService';

// ---------------------------------------------------------------------------
// 컬럼 정의 (상세설계서 2.7)
// ---------------------------------------------------------------------------

const COLUMNS = [
  { header: '이슈ID', key: 'id', width: 11 },
  { header: '테스트구분', key: 'testType', width: 9 },
  { header: '테스트차수', key: 'testRound', width: 9 },
  { header: '이슈유형', key: 'issueType', width: 8 },
  { header: '업무(모듈)', key: 'module', width: 12 },
  { header: '화면/프로그램ID', key: 'programId', width: 16 },
  { header: '테스트케이스ID', key: 'testCaseId', width: 16 },
  { header: '제목', key: 'title', width: 40 },
  { header: '재현절차', key: 'steps', width: 40 },
  { header: '기대결과', key: 'expected', width: 30 },
  { header: '실제결과', key: 'actual', width: 30 },
  { header: '심각도', key: 'severity', width: 7 },
  { header: '우선순위', key: 'priority', width: 8 },
  { header: '상태', key: 'status', width: 9 },
  { header: '발견자', key: 'reporter', width: 10 },
  { header: '발견일', key: 'foundDate', width: 11 },
  { header: '담당자', key: 'assignee', width: 10 },
  { header: '조치기한', key: 'dueDate', width: 11 },
  { header: '원인분류', key: 'cause', width: 14 },
  { header: '조치내용', key: 'action', width: 40 },
  { header: '조치자', key: 'resolver', width: 10 },
  { header: '조치일', key: 'resolvedDate', width: 11 },
  { header: '재테스트결과', key: 'retestResult', width: 11 },
  { header: '재테스트자', key: 'tester', width: 10 },
  { header: '재테스트일', key: 'testedDate', width: 11 },
  { header: '재오픈횟수', key: 'reopenCount', width: 9, exportOnly: true },
  { header: '경과일', key: 'elapsedDays', width: 7, exportOnly: true },
  { header: '기한초과', key: 'overdue', width: 8, exportOnly: true },
  { header: '최종수정일시', key: 'updatedAt', width: 22, exportOnly: true },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];
const IMPORT_COLUMNS = COLUMNS.filter((c) => !('exportOnly' in c));

const userName = (id: string | null | undefined) => (id ? findUser(id)?.name ?? id : '');
const moduleName = (code: string) => getConfig().modules.find((m) => m.code === code)?.name ?? code;

export function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ---------------------------------------------------------------------------
// 내보내기
// ---------------------------------------------------------------------------

/** 모든 첨부 이미지를 같은 크기(px)로 넣는다 */
const IMAGE_WIDTH = 200;
const IMAGE_HEIGHT = 150;
const IMAGE_COLUMN_WIDTH = 29;
const IMAGE_ROW_HEIGHT = IMAGE_HEIGHT * 0.75 + 4;

const EMBEDDABLE_EXT: Record<string, 'png' | 'jpeg' | 'gif'> = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif' };

const fileExt = (a: Attachment) => path.extname(a.fileName).slice(1).toLowerCase();
const isEmbeddableImage = (a: Attachment) => fileExt(a) in EMBEDDABLE_EXT;
const imageExtension = (a: Attachment) => EMBEDDABLE_EXT[fileExt(a)];

/** 이슈 본문 첨부, 재테스트 첨부 순서 */
const allAttachments = (i: Issue) => [...i.attachments, ...i.retests.flatMap((r) => r.attachments)];

async function readAttachment(issueId: string, a: Attachment): Promise<Buffer | null> {
  try {
    return await fsp.readFile(attachmentPath(issueId, a));
  } catch {
    logger.warn(`엑셀 내보내기: 첨부 실물 없음 ${issueId}/${a.fileName}`);
    return null;
  }
}

export function exportFileName(): string {
  const project = getConfig().project.name.replace(/[\\/:*?"<>|\s]+/g, '_');
  return `결함관리대장_${project}_${today().replaceAll('-', '')}.xlsx`;
}

export async function exportIssues(query: SearchQuery): Promise<Buffer> {
  const base = today();
  const byId = new Map(filterIssues(query).map((i) => [i.id, i]));
  const ordered = sortSummaries([...byId.values()].map((i) => toSummary(i, base)), query.sort).map((s) => byId.get(s.id)!);

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet('결함관리대장');
  const imageCount = Math.max(0, ...ordered.map((i) => allAttachments(i).filter(isEmbeddableImage).length));
  ws.columns = [
    ...COLUMNS.map(({ header, key, width }) => ({ header, key, width })),
    { header: '첨부파일', key: 'files', width: 30 },
    ...Array.from({ length: imageCount }, (_, n) => ({ header: `첨부이미지${n + 1}`, key: `image${n + 1}`, width: IMAGE_COLUMN_WIDTH })),
  ];
  const firstImageCol = COLUMNS.length + 1;

  for (const i of ordered) {
    const res = i.resolutions.at(-1);
    const ret = i.retests.at(-1);
    const late = isOverdue(i, base);
    const row = ws.addRow({
      id: i.id,
      testType: TEST_TYPE[i.testType],
      testRound: i.testRound ?? '',
      issueType: ISSUE_TYPE[i.issueType],
      module: moduleName(i.module),
      programId: i.programId,
      testCaseId: i.testCaseId,
      title: i.title,
      steps: i.steps,
      expected: i.expected,
      actual: i.actual,
      severity: SEVERITY[i.severity],
      priority: PRIORITY[i.priority],
      status: STATUS[i.status],
      reporter: userName(i.reporter),
      foundDate: i.foundDate,
      assignee: userName(i.assignee),
      dueDate: i.dueDate,
      cause: res ? CAUSE[res.cause] : '',
      action: res?.action ?? '',
      resolver: userName(res?.resolver),
      resolvedDate: res?.resolvedDate ?? '',
      retestResult: ret ? RETEST_RESULT[ret.result] : '',
      tester: userName(ret?.tester),
      testedDate: ret?.testedDate ?? '',
      reopenCount: i.reopenCount,
      elapsedDays: elapsedDays(i, base),
      overdue: late ? 'Y' : '',
      updatedAt: i.updatedAt,
    } satisfies Record<ColumnKey, unknown>);
    const attachments = allAttachments(i);
    const images = attachments.filter(isEmbeddableImage);
    row.getCell('files').value = attachments.filter((a) => !isEmbeddableImage(a)).map((a) => a.fileName).join('\n');
    let placed = 0;
    for (const a of images) {
      const buffer = await readAttachment(i.id, a);
      if (!buffer) continue;
      const imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: imageExtension(a) });
      ws.addImage(imageId, {
        tl: { col: firstImageCol + placed, row: row.number - 1 },
        ext: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
        editAs: 'oneCell',
      });
      placed += 1;
    }
    if (placed > 0) row.height = IMAGE_ROW_HEIGHT;
    row.alignment = { vertical: 'top', wrapText: true };
    if (i.severity === 'CRITICAL') row.font = { color: { argb: 'FFC00000' } };
    if (late) {
      row.getCell('dueDate').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    }
  }
  styleHeader(ws);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length + 1 } };

  // 현황요약 시트
  const open = ordered.filter((i) => OPEN_STATUSES.includes(i.status)).length;
  const closed = ordered.filter((i) => i.status === 'CLOSED').length;
  const rejected = ordered.filter((i) => i.status === 'REJECTED').length;
  const summary = wb.addWorksheet('현황요약');
  summary.columns = [{ header: '항목', key: 'k', width: 22 }, { header: '값', key: 'v', width: 14 }];
  const rows: [string, string | number][] = [
    ['프로젝트', getConfig().project.name],
    ['출력일', base],
    ['전체', ordered.length],
    ['미결', open],
    ['조치완료(재테스트 대기)', ordered.filter((i) => i.status === 'RESOLVED').length],
    ['종료', closed],
    ['반려', rejected],
    ['기한초과', ordered.filter((i) => isOverdue(i, base)).length],
    ['조치율(%)', ordered.length ? Math.round(((closed + rejected) / ordered.length) * 1000) / 10 : 0],
  ];
  for (const s of Object.keys(STATUS) as Status[]) rows.push([`상태: ${STATUS[s]}`, ordered.filter((i) => i.status === s).length]);
  for (const s of Object.keys(SEVERITY) as Severity[]) {
    rows.push([`심각도: ${SEVERITY[s]} (미결)`, ordered.filter((i) => i.severity === s && OPEN_STATUSES.includes(i.status)).length]);
  }
  rows.forEach(([k, v]) => summary.addRow({ k, v }));
  styleHeader(summary);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function importTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('결함관리대장');
  ws.columns = IMPORT_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
  styleHeader(ws);

  const guide = wb.addWorksheet('작성안내');
  guide.columns = [{ header: '컬럼', key: 'c', width: 16 }, { header: '입력 방법', key: 'g', width: 80 }];
  const cfg = getConfig();
  [
    ['이슈ID', '비워 두면 새로 채번합니다. 입력 시 UT-0001 / IT-0001 형식'],
    ['테스트구분*', '단위 / 통합'],
    ['테스트케이스ID*', '테스트케이스 화면에 등록된 ID(테스트구분이 같아야 함). 등록되지 않은 케이스는 테스트케이스 가져오기로 먼저 등록하세요.'],
    ['테스트차수', cfg.project.testRounds.join(' / ')],
    ['이슈유형', `${Object.values(ISSUE_TYPE).join(' / ')} (비우면 결함)`],
    ['업무(모듈)*', cfg.modules.filter((m) => m.active).map((m) => `${m.name}(${m.code})`).join(', ')],
    ['제목·재현절차·기대결과·실제결과*', '필수'],
    ['심각도*', Object.values(SEVERITY).join(' / ')],
    ['우선순위', `${Object.values(PRIORITY).join(' / ')} (비우면 보통)`],
    ['상태', `${Object.values(STATUS).join(' / ')} (비우면 신규, 담당자가 있으면 접수)`],
    ['발견자*·담당자·조치자·재테스트자', '설정에 등록된 사용자 이름'],
    ['발견일*·조치기한·조치일·재테스트일', 'YYYY-MM-DD 또는 엑셀 날짜'],
    ['원인분류·조치내용', `상태가 조치완료·종료이면 필수. 원인분류: ${Object.values(CAUSE).join(' / ')}`],
    ['재테스트결과', 'Pass / Fail (상태가 종료이면 Pass로 간주)'],
  ].forEach(([c, g]) => guide.addRow({ c, g }));
  styleHeader(guide);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// 가져오기
// ---------------------------------------------------------------------------

const MAX_IMPORT_ROWS = 5000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

interface ImportData {
  id: string | null;
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
  severity: Severity;
  priority: Priority;
  status: Status;
  reporter: string;
  foundDate: string;
  assignee: string | null;
  dueDate: string;
  resolution: { cause: Cause; action: string; resolver: string; resolvedDate: string } | null;
  retest: { result: RetestResult; tester: string; testedDate: string } | null;
}

interface PreviewEntry {
  createdAt: number;
  userId: string;
  rows: Array<ImportRow & { data?: ImportData }>;
}

const previews = new Map<string, PreviewEntry>();

function purgePreviews() {
  const limit = Date.now() - PREVIEW_TTL_MS;
  for (const [key, entry] of previews) if (entry.createdAt < limit) previews.delete(key);
}

export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('').trim();
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    return '';
  }
  return String(value).trim();
}

function cellDate(value: ExcelJS.CellValue): string | null | 'INVALID' {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86_400_000));
    return formatDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const text = cellText(value).replace(/[./]/g, '-');
  if (!text) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (!m) return 'INVALID';
  const normalized = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isValidDate(normalized) ? normalized : 'INVALID';
}

export function userIdByName(name: string, errors: string[], label: string): string | null {
  if (!name) return null;
  const users = getConfig().users;
  const byId = users.find((u) => u.id === name);
  if (byId) return byId.id;
  const matches = users.filter((u) => u.name === name);
  if (matches.length === 0) errors.push(`${label} '${name}'이(가) 사용자 목록에 없습니다.`);
  else if (matches.length > 1) errors.push(`${label} '${name}' 동명이인이 있습니다. 사용자 ID로 입력하세요.`);
  else return matches[0].id;
  return null;
}

function parseRow(get: (key: ColumnKey) => ExcelJS.CellValue): { data?: ImportData; errors: string[] } {
  const errors: string[] = [];
  const text = (key: ColumnKey) => cellText(get(key));
  const cfg = getConfig();

  const code = <T extends Record<string, string>>(obj: T, key: ColumnKey, label: string, required: boolean, fallback?: keyof T & string) => {
    const v = text(key);
    if (!v) {
      if (required) errors.push(`${label}은(는) 필수입니다.`);
      return fallback;
    }
    const c = codeByLabel(obj, v);
    if (!c) errors.push(`${label} 값 '${v}'을(를) 알 수 없습니다.`);
    return c;
  };
  const date = (key: ColumnKey, label: string, required: boolean) => {
    const d = cellDate(get(key));
    if (d === 'INVALID') {
      errors.push(`${label} 형식이 올바르지 않습니다.`);
      return null;
    }
    if (!d && required) errors.push(`${label}은(는) 필수입니다.`);
    return d;
  };
  const required = (key: ColumnKey, label: string, max: number) => {
    const v = text(key);
    if (!v) errors.push(`${label}은(는) 필수입니다.`);
    if (v.length > max) errors.push(`${label}은(는) ${max}자 이하여야 합니다.`);
    return v;
  };

  const testType = code(TEST_TYPE, 'testType', '테스트구분', true);
  const id = text('id') || null;
  if (id && (!/^(UT|IT)-\d{4,}$/.test(id) || (testType && !id.startsWith(`${testType}-`)))) {
    errors.push(`이슈ID '${id}' 형식이 올바르지 않거나 테스트구분과 맞지 않습니다.`);
  }
  const testRound = text('testRound') || null;
  if (testRound && !cfg.project.testRounds.includes(testRound)) errors.push(`테스트차수 '${testRound}'이(가) 설정에 없습니다.`);

  const moduleText = text('module');
  const mod = cfg.modules.find((m) => m.code === moduleText || m.name === moduleText);
  if (!moduleText) errors.push('업무(모듈)은(는) 필수입니다.');
  else if (!mod) errors.push(`업무(모듈) '${moduleText}'이(가) 설정에 없습니다.`);

  const testCaseId = required('testCaseId', '테스트케이스ID', 50);
  if (testCaseId && testType) {
    const message = testCaseError(testCaseId, testType);
    if (message) errors.push(message);
  }

  const title = required('title', '제목', 200);
  const steps = required('steps', '재현절차', 4000);
  const expected = required('expected', '기대결과', 2000);
  const actual = required('actual', '실제결과', 2000);
  const issueType = code(ISSUE_TYPE, 'issueType', '이슈유형', false, 'DEFECT');
  const severity = code(SEVERITY, 'severity', '심각도', true);
  const priority = code(PRIORITY, 'priority', '우선순위', false, 'MEDIUM');
  const reporter = userIdByName(text('reporter'), errors, '발견자');
  if (!text('reporter')) errors.push('발견자는 필수입니다.');
  const assignee = userIdByName(text('assignee'), errors, '담당자');
  const foundDate = date('foundDate', '발견일', true);
  if (foundDate && foundDate > today()) errors.push('발견일은 오늘 이후일 수 없습니다.');
  const dueDateIn = date('dueDate', '조치기한', false);
  const status = code(STATUS, 'status', '상태', false, assignee ? 'ASSIGNED' : 'NEW');

  if (status && ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REOPENED'].includes(status) && !assignee) {
    errors.push(`상태가 ${STATUS[status]}이면 담당자가 필요합니다.`);
  }
  if (assignee) {
    const role = findUser(assignee)?.role;
    if (role !== 'DEVELOPER' && role !== 'MANAGER') errors.push('담당자는 개발자 또는 PL/PM이어야 합니다.');
  }

  const cause = code(CAUSE, 'cause', '원인분류', false);
  const action = text('action');
  if (action.length > 4000) errors.push('조치내용은 4000자 이하여야 합니다.');
  const needsResolution = status === 'RESOLVED' || status === 'CLOSED';
  if (needsResolution && (!cause || !action)) errors.push('상태가 조치완료·종료이면 원인분류와 조치내용이 필요합니다.');
  const resolver = userIdByName(text('resolver'), errors, '조치자');
  const resolvedDate = date('resolvedDate', '조치일', false);

  const retestResult = code(RETEST_RESULT, 'retestResult', '재테스트결과', false, status === 'CLOSED' ? 'PASS' : undefined);
  const tester = userIdByName(text('tester'), errors, '재테스트자');
  const testedDate = date('testedDate', '재테스트일', false);

  if (errors.length || !testType || !severity || !mod || !reporter || !foundDate || !status) return { errors };

  const resolution = cause && action
    ? { cause, action, resolver: resolver ?? assignee ?? reporter, resolvedDate: resolvedDate ?? foundDate }
    : null;
  const retest = retestResult && resolution
    ? { result: retestResult, tester: tester ?? reporter, testedDate: testedDate ?? resolution.resolvedDate }
    : null;

  return {
    errors,
    data: {
      id,
      testType,
      testRound,
      issueType: issueType ?? 'DEFECT',
      module: mod.code,
      programId: text('programId').slice(0, 50),
      testCaseId,
      title,
      steps,
      expected,
      actual,
      severity,
      priority: priority ?? 'MEDIUM',
      status,
      reporter,
      foundDate,
      assignee,
      dueDate: dueDateIn ?? defaultDueDate(foundDate, severity),
      resolution,
      retest,
    },
  };
}

export async function firstWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw Errors.unsupportedFile();
  }
  const ws = wb.worksheets[0];
  if (!ws) throw Errors.validation([], '시트가 없는 파일입니다.');
  return ws;
}

export async function previewImport(buffer: Buffer, user: User): Promise<ImportPreview> {
  purgePreviews();
  const ws = await firstWorksheet(buffer);

  const headerIndex = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => headerIndex.set(cellText(cell.value).replace(/\*$/, ''), col));
  const missing = IMPORT_COLUMNS.filter((c) => !headerIndex.has(c.header)).map((c) => c.header);
  const requiredHeaders = ['테스트구분', '테스트케이스ID', '업무(모듈)', '제목', '재현절차', '기대결과', '실제결과', '심각도', '발견자', '발견일'];
  const missingRequired = missing.filter((h) => requiredHeaders.includes(h));
  if (missingRequired.length) {
    throw Errors.validation([], `필수 컬럼이 없습니다: ${missingRequired.join(', ')}. 가져오기 양식을 사용하세요.`);
  }
  const colOf = new Map(IMPORT_COLUMNS.map((c) => [c.key as ColumnKey, headerIndex.get(c.header)]));

  const existingIds = new Set(allIssues().map((i) => i.id));
  const seenIds = new Set<string>();
  const rows: PreviewEntry['rows'] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues || row.values === undefined) continue;
    const get = (key: ColumnKey) => {
      const col = colOf.get(key);
      return col ? row.getCell(col).value : null;
    };
    const allEmpty = IMPORT_COLUMNS.every((c) => cellText(get(c.key as ColumnKey)) === '');
    if (allEmpty) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw Errors.validation([], `한 번에 최대 ${MAX_IMPORT_ROWS}행까지 가져올 수 있습니다.`);

    const { data, errors } = parseRow(get);
    if (data?.id) {
      if (seenIds.has(data.id)) errors.push(`이슈ID '${data.id}'이(가) 파일 안에서 중복됩니다.`);
      seenIds.add(data.id);
    }
    if (errors.length || !data) {
      rows.push({ row: r, status: 'ERROR', id: data?.id ?? (cellText(get('id')) || undefined), title: cellText(get('title')), errors });
    } else {
      rows.push({ row: r, status: 'OK', id: data.id ?? undefined, exists: !!data.id && existingIds.has(data.id), title: data.title, data });
    }
  }

  const importId = randomUUID();
  previews.set(importId, { createdAt: Date.now(), userId: user.id, rows });
  return {
    importId,
    rows: rows.map(({ data: _data, ...rest }) => rest),
    summary: {
      ok: rows.filter((r) => r.status === 'OK').length,
      error: rows.filter((r) => r.status === 'ERROR').length,
      existing: rows.filter((r) => r.exists).length,
    },
  };
}

function buildIssueFields(d: ImportData, now: string): Omit<Issue, 'id' | 'comments' | 'history' | 'attachments' | 'createdAt' | 'createdBy' | 'version'> {
  const resolutions: Issue['resolutions'] = d.resolution
    ? [{
      seq: 1,
      cause: d.resolution.cause,
      causeDetail: d.resolution.action.slice(0, 2000),
      action: d.resolution.action,
      changedFiles: '',
      buildVersion: '',
      resolver: d.resolution.resolver,
      resolvedDate: d.resolution.resolvedDate,
      createdAt: now,
    }]
    : [];
  const retests: Issue['retests'] = d.retest
    ? [{ seq: 1, resolutionSeq: 1, ...d.retest, comment: '', attachments: [], createdAt: now }]
    : [];
  return {
    testType: d.testType,
    testRound: d.testRound,
    issueType: d.issueType,
    module: d.module,
    programId: d.programId,
    testCaseId: d.testCaseId,
    title: d.title,
    steps: d.steps,
    expected: d.expected,
    actual: d.actual,
    environment: 'TEST',
    severity: d.severity,
    priority: d.priority,
    status: d.status,
    reporter: d.reporter,
    assignee: d.assignee,
    foundDate: d.foundDate,
    dueDate: d.dueDate < d.foundDate ? d.foundDate : d.dueDate,
    rejection: d.status === 'REJECTED'
      ? { reason: 'NOT_ISSUE', duplicateOf: null, comment: '엑셀 가져오기로 등록된 반려 이슈', rejectedBy: d.reporter, rejectedAt: now }
      : null,
    resolutions,
    retests,
    reopenCount: retests.filter((r) => r.result === 'FAIL').length,
    closedAt: d.status === 'CLOSED' ? `${d.retest?.testedDate ?? d.foundDate}T18:00:00${now.slice(19)}` : null,
    deleted: false,
    updatedAt: now,
  };
}

export async function commitImport(importId: string, onExisting: 'SKIP' | 'OVERWRITE', user: User) {
  purgePreviews();
  const entry = previews.get(importId);
  if (!entry) throw Errors.notFound('검증 결과가 만료되었습니다. 다시 검증하세요.');

  const result = await issueStore.update((draft) => {
    const now = nowIso();
    let created = 0;
    let overwritten = 0;
    let skipped = 0;
    for (const row of entry.rows) {
      if (row.status !== 'OK' || !row.data) continue;
      const d = row.data;
      const existing = d.id ? draft.issues.find((i) => i.id === d.id) : undefined;
      if (existing) {
        if (onExisting === 'SKIP') {
          skipped += 1;
          continue;
        }
        Object.assign(existing, buildIssueFields(d, now));
        existing.version += 1;
        addHistory(existing, user, 'IMPORT', { at: now, note: `엑셀 가져오기(덮어쓰기) ${row.row}행` });
        overwritten += 1;
        continue;
      }
      let id = d.id;
      if (id) {
        const seq = Number(id.split('-')[1]);
        if (seq > draft.sequences[d.testType]) draft.sequences[d.testType] = seq;
      } else {
        draft.sequences[d.testType] += 1;
        id = formatId(d.testType, draft.sequences[d.testType]);
      }
      const issue: Issue = {
        id,
        ...buildIssueFields(d, now),
        attachments: [],
        comments: [],
        history: [],
        createdAt: now,
        createdBy: user.id,
        version: 1,
      };
      addHistory(issue, user, 'IMPORT', { at: now, note: `엑셀 가져오기 ${row.row}행` });
      draft.issues.push(issue);
      created += 1;
    }
    return { created, overwritten, skipped };
  });
  previews.delete(importId);
  return result;
}
