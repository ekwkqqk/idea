import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { TEST_TYPE, codeByLabel, type TestType } from '../../shared/codes';
import { nowIso } from '../../shared/dates';
import { TEST_CASE_ID_PATTERN } from '../../shared/schemas';
import type { ImportPreview, ImportRow, TestCase, User } from '../../shared/types';
import { Errors } from '../errors';
import { getConfig } from '../repository/configRepository';
import { allIssues } from '../repository/issueRepository';
import { allTestCases, testCaseStore } from '../repository/testCaseRepository';
import { cellText, firstWorksheet, styleHeader, userIdByName } from './excelService';

const COLUMNS = [
  { header: '테스트케이스ID', key: 'id', width: 18, required: true },
  { header: '테스트구분', key: 'testType', width: 9, required: true },
  { header: '업무(모듈)', key: 'module', width: 12, required: true },
  { header: '화면/프로그램ID', key: 'programId', width: 16, required: false },
  { header: '테스트명', key: 'title', width: 40, required: true },
  { header: '사전조건', key: 'precondition', width: 30, required: false },
  { header: '테스트절차', key: 'steps', width: 40, required: true },
  { header: '기대결과', key: 'expected', width: 30, required: true },
  { header: '담당자', key: 'owner', width: 10, required: false },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

const MAX_IMPORT_ROWS = 5000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

type TestCaseData = Pick<TestCase, 'id' | 'testType' | 'module' | 'programId' | 'title' | 'precondition' | 'steps' | 'expected' | 'owner'>;

interface PreviewEntry {
  createdAt: number;
  userId: string;
  rows: Array<ImportRow & { data?: TestCaseData }>;
}

const previews = new Map<string, PreviewEntry>();

function purgePreviews() {
  const limit = Date.now() - PREVIEW_TTL_MS;
  for (const [key, entry] of previews) if (entry.createdAt < limit) previews.delete(key);
}

export async function testCaseTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('테스트케이스');
  ws.columns = COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
  styleHeader(ws);

  const guide = wb.addWorksheet('작성안내');
  guide.columns = [{ header: '컬럼', key: 'c', width: 16 }, { header: '입력 방법', key: 'g', width: 80 }];
  const cfg = getConfig();
  [
    ['테스트케이스ID*', '영문·숫자·-·_ 50자 이하, 중복 불가. 예: TC-UT-ORD-012'],
    ['테스트구분*', '단위 / 통합'],
    ['업무(모듈)*', cfg.modules.filter((m) => m.active).map((m) => `${m.name}(${m.code})`).join(', ')],
    ['테스트명·테스트절차·기대결과*', '필수'],
    ['담당자', '설정에 등록된 사용자 이름'],
  ].forEach(([c, g]) => guide.addRow({ c, g }));
  styleHeader(guide);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function parseRow(get: (key: ColumnKey) => ExcelJS.CellValue): { data?: TestCaseData; errors: string[] } {
  const errors: string[] = [];
  const text = (key: ColumnKey) => cellText(get(key));
  const required = (key: ColumnKey, label: string, max: number) => {
    const v = text(key);
    if (!v) errors.push(`${label}은(는) 필수입니다.`);
    if (v.length > max) errors.push(`${label}은(는) ${max}자 이하여야 합니다.`);
    return v;
  };
  const cfg = getConfig();

  const id = text('id');
  if (!id) errors.push('테스트케이스ID는 필수입니다.');
  else if (!TEST_CASE_ID_PATTERN.test(id)) errors.push(`테스트케이스ID '${id}'는 영문·숫자·-·_ 50자 이하여야 합니다.`);

  const typeText = text('testType');
  const testType: TestType | undefined = typeText ? codeByLabel(TEST_TYPE, typeText) : undefined;
  if (!typeText) errors.push('테스트구분은(는) 필수입니다.');
  else if (!testType) errors.push(`테스트구분 값 '${typeText}'을(를) 알 수 없습니다.`);

  const moduleText = text('module');
  const mod = cfg.modules.find((m) => m.code === moduleText || m.name === moduleText);
  if (!moduleText) errors.push('업무(모듈)은(는) 필수입니다.');
  else if (!mod) errors.push(`업무(모듈) '${moduleText}'이(가) 설정에 없습니다.`);

  const programId = text('programId');
  if (programId.length > 50) errors.push('화면/프로그램ID는 50자 이하여야 합니다.');
  const title = required('title', '테스트명', 200);
  const precondition = text('precondition');
  if (precondition.length > 2000) errors.push('사전조건은 2000자 이하여야 합니다.');
  const steps = required('steps', '테스트절차', 4000);
  const expected = required('expected', '기대결과', 2000);
  const owner = userIdByName(text('owner'), errors, '담당자');

  if (errors.length || !testType || !mod) return { errors };
  return { errors, data: { id, testType, module: mod.code, programId, title, precondition, steps, expected, owner } };
}

export async function previewTestCaseImport(buffer: Buffer, user: User): Promise<ImportPreview> {
  purgePreviews();
  const ws = await firstWorksheet(buffer);

  const headerIndex = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => headerIndex.set(cellText(cell.value).replace(/\*$/, ''), col));
  const missingRequired = COLUMNS.filter((c) => c.required && !headerIndex.has(c.header)).map((c) => c.header);
  if (missingRequired.length) {
    throw Errors.validation([], `필수 컬럼이 없습니다: ${missingRequired.join(', ')}. 가져오기 양식을 사용하세요.`);
  }

  const existingIds = new Set(allTestCases().map((t) => t.id));
  const linkedTypes = new Map<string, Set<string>>();
  for (const i of allIssues()) {
    if (i.deleted || !i.testCaseId) continue;
    linkedTypes.set(i.testCaseId, (linkedTypes.get(i.testCaseId) ?? new Set()).add(i.testType));
  }
  const seenIds = new Set<string>();
  const rows: PreviewEntry['rows'] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const get = (key: ColumnKey) => {
      const col = headerIndex.get(COLUMNS.find((c) => c.key === key)!.header);
      return col ? row.getCell(col).value : null;
    };
    if (COLUMNS.every((c) => cellText(get(c.key)) === '')) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw Errors.validation([], `한 번에 최대 ${MAX_IMPORT_ROWS}행까지 가져올 수 있습니다.`);

    const { data, errors } = parseRow(get);
    if (data) {
      if (seenIds.has(data.id)) errors.push(`테스트케이스ID '${data.id}'이(가) 파일 안에서 중복됩니다.`);
      seenIds.add(data.id);
      const types = linkedTypes.get(data.id);
      if (types && [...types].some((t) => t !== data.testType)) {
        errors.push('연결된 이슈와 테스트구분이 다릅니다.');
      }
    }
    if (errors.length || !data) {
      rows.push({ row: r, status: 'ERROR', id: cellText(get('id')) || undefined, title: cellText(get('title')), errors });
    } else {
      rows.push({ row: r, status: 'OK', id: data.id, exists: existingIds.has(data.id), title: data.title, data });
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

export async function commitTestCaseImport(importId: string, onExisting: 'SKIP' | 'OVERWRITE', user: User) {
  purgePreviews();
  const entry = previews.get(importId);
  if (!entry) throw Errors.notFound('검증 결과가 만료되었습니다. 다시 검증하세요.');

  const result = await testCaseStore.update((draft) => {
    const now = nowIso();
    let created = 0;
    let overwritten = 0;
    let skipped = 0;
    for (const row of entry.rows) {
      if (row.status !== 'OK' || !row.data) continue;
      const d = row.data;
      const existing = draft.testCases.find((t) => t.id === d.id);
      if (existing) {
        if (onExisting === 'SKIP') {
          skipped += 1;
          continue;
        }
        Object.assign(existing, d, { updatedAt: now, version: existing.version + 1 });
        overwritten += 1;
        continue;
      }
      draft.testCases.push({ ...d, active: true, createdAt: now, createdBy: user.id, updatedAt: now, version: 1 });
      created += 1;
    }
    return { created, overwritten, skipped };
  });
  previews.delete(importId);
  return result;
}
