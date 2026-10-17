import { Router } from 'express';
import { createTestCaseSchema, patchTestCaseSchema } from '../../shared/schemas';
import { Errors } from '../errors';
import { requireManager, userOf } from '../middleware/currentUser';
import { commitTestCaseImport, previewTestCaseImport, testCaseTemplate } from '../services/testCaseExcel';
import {
  createTestCase, deleteTestCase, getTestCaseSummary, patchTestCase, searchTestCases, type TestCaseQuery,
} from '../services/testCaseService';
import { commitSchema, sendXlsx, upload } from './excel';

const QUERY_KEYS: (keyof TestCaseQuery)[] = ['testType', 'module', 'active', 'q', 'page', 'size'];

export const testCasesRouter = Router();

testCasesRouter.get('/', (req, res) => {
  const query: TestCaseQuery = {};
  for (const key of QUERY_KEYS) {
    const v = req.query[key];
    if (typeof v === 'string' && v) query[key] = v;
  }
  res.json(searchTestCases(query));
});

testCasesRouter.post('/', async (req, res) => {
  res.status(201).json(await createTestCase(createTestCaseSchema.parse(req.body), userOf(req)));
});

testCasesRouter.get('/import/template', async (_req, res) => {
  sendXlsx(res, '테스트케이스_가져오기양식.xlsx', await testCaseTemplate());
});

testCasesRouter.post('/import/preview', requireManager, upload.single('file'), async (req, res) => {
  if (!req.file) throw Errors.validation([{ field: 'file', message: '엑셀 파일을 선택하세요.' }]);
  res.json(await previewTestCaseImport(req.file.buffer, userOf(req)));
});

testCasesRouter.post('/import/commit', requireManager, async (req, res) => {
  const { importId, onExisting } = commitSchema.parse(req.body);
  res.json(await commitTestCaseImport(importId, onExisting, userOf(req)));
});

testCasesRouter.get('/:id', (req, res) => {
  res.json(getTestCaseSummary(req.params.id));
});

testCasesRouter.patch('/:id', async (req, res) => {
  res.json(await patchTestCase(req.params.id, patchTestCaseSchema.parse(req.body), userOf(req)));
});

testCasesRouter.delete('/:id', async (req, res) => {
  await deleteTestCase(req.params.id, userOf(req));
  res.status(204).end();
});
