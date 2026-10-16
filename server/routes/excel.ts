import path from 'node:path';
import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Errors } from '../errors';
import { requireManager, userOf } from '../middleware/currentUser';
import { commitImport, exportFileName, exportIssues, importTemplate, previewImport } from '../services/excelService';
import { decodeFileName } from './attachments';
import { searchQuery } from './query';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendXlsx(res: Response, fileName: string, buffer: Buffer) {
  res.attachment(fileName);
  res.type(XLSX_MIME);
  res.send(buffer);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = decodeFileName(file.originalname);
    if (path.extname(name).toLowerCase() !== '.xlsx') cb(Errors.unsupportedFile());
    else cb(null, true);
  },
});

export const excelRouter = Router();

excelRouter.get('/export', async (req, res) => {
  sendXlsx(res, exportFileName(), await exportIssues(searchQuery(req)));
});

excelRouter.get('/import/template', async (_req, res) => {
  sendXlsx(res, '결함관리대장_가져오기양식.xlsx', await importTemplate());
});

excelRouter.post('/import/preview', requireManager, upload.single('file'), async (req, res) => {
  if (!req.file) throw Errors.validation([{ field: 'file', message: '엑셀 파일을 선택하세요.' }]);
  res.json(await previewImport(req.file.buffer, userOf(req)));
});

const commitSchema = z.object({ importId: z.string().min(1), onExisting: z.enum(['SKIP', 'OVERWRITE']) });

excelRouter.post('/import/commit', requireManager, async (req, res) => {
  const { importId, onExisting } = commitSchema.parse(req.body);
  res.json(await commitImport(importId, onExisting, userOf(req)));
});
