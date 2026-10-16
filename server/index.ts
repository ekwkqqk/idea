import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { runBackup, scheduleDailyBackup } from './backup';
import { acquireLock } from './lock';
import { logger, pruneLogs } from './logger';
import { currentUser, requireUserForWrite } from './middleware/currentUser';
import { errorHandler } from './middleware/errorHandler';
import { ATTACHMENTS_DIR, DATA_DIR, WEB_DIST_DIR } from './paths';
import { configStore } from './repository/configRepository';
import { loadIssues } from './repository/issueRepository';
import { attachmentsRouter, issueAttachmentsRouter } from './routes/attachments';
import { configRouter } from './routes/config';
import { excelRouter } from './routes/excel';
import { issuesRouter } from './routes/issues';
import { statsRouter } from './routes/stats';
import { Errors } from './errors';

const PORT = Number(process.env.PORT ?? 3000);

fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
acquireLock();
configStore.load();
loadIssues();
pruneLogs();
runBackup();
scheduleDailyBackup();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const api = express.Router();
api.use(currentUser);
api.use(requireUserForWrite);
api.use('/issues/:id/attachments', issueAttachmentsRouter);
api.use('/issues', issuesRouter);
api.use('/attachments', attachmentsRouter);
api.use('/stats', statsRouter);
api.use('/config', configRouter);
api.use('/', excelRouter);
api.use(() => {
  throw Errors.notFound('API 경로를 찾을 수 없습니다.');
});
app.use('/api', api);

if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(WEB_DIST_DIR, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`TIMS 서버 시작: http://localhost:${PORT} (data: ${DATA_DIR})`);
});
