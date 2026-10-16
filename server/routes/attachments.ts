import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { nowIso } from '../../shared/dates';
import type { Attachment } from '../../shared/types';
import { attachmentPath, safeFileName } from '../attachmentStore';
import { Errors } from '../errors';
import { userOf } from '../middleware/currentUser';
import { ATTACHMENTS_DIR } from '../paths';
import { addAttachments, assertCanAttach, findAttachment, removeAttachment } from '../services/issueService';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'txt', 'log', 'csv', 'xlsx', 'docx', 'pdf', 'zip']);

/** multipart 파일명은 latin1로 해석되므로 UTF-8로 되돌린다 */
export function decodeFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    file.originalname = decodeFileName(file.originalname);
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) cb(Errors.unsupportedFile());
    else cb(null, true);
  },
});

const filePath = attachmentPath;

export const issueAttachmentsRouter = Router({ mergeParams: true });

issueAttachmentsRouter.post('/', upload.array('files', MAX_FILES), async (req, res) => {
  const user = userOf(req);
  const issueId = (req.params as { id: string }).id;
  const retestSeq = req.query.retestSeq ? Number(req.query.retestSeq) : undefined;
  assertCanAttach(issueId, user, retestSeq);

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw Errors.validation([{ field: 'files', message: '파일을 선택하세요.' }]);

  const dir = path.join(ATTACHMENTS_DIR, issueId);
  await fsp.mkdir(dir, { recursive: true });
  const saved: Attachment[] = [];
  try {
    for (const f of files) {
      const meta: Attachment = {
        id: randomUUID(),
        fileName: safeFileName(f.originalname),
        size: f.size,
        mimeType: f.mimetype,
        uploadedBy: user.id,
        uploadedAt: nowIso(),
      };
      await fsp.writeFile(filePath(issueId, meta), f.buffer);
      saved.push(meta);
    }
    res.status(201).json(await addAttachments(issueId, saved, user, retestSeq));
  } catch (err) {
    await Promise.all(saved.map((a) => fsp.rm(filePath(issueId, a), { force: true })));
    throw err;
  }
});

issueAttachmentsRouter.delete('/:attachmentId', async (req, res) => {
  const issueId = (req.params as Record<string, string>).id;
  const { detail, removed } = await removeAttachment(issueId, req.params.attachmentId, userOf(req));
  await fsp.rm(filePath(issueId, removed), { force: true });
  res.json(detail);
});

export const attachmentsRouter = Router();

attachmentsRouter.get('/:attachmentId', (req, res) => {
  const { issue, attachment } = findAttachment(req.params.attachmentId);
  const file = filePath(issue.id, attachment);
  if (!fs.existsSync(file)) throw Errors.notFound('첨부파일 실물이 없습니다.');
  const inline = req.query.inline === '1' && attachment.mimeType.startsWith('image/');
  if (inline) {
    res.type(attachment.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
  } else {
    res.attachment(attachment.fileName);
  }
  res.sendFile(file, { dotfiles: 'allow' });
});
