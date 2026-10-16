import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Errors } from '../errors';
import { logger } from '../logger';

const RENAME_RETRIES = 5;
const RENAME_RETRY_DELAY_MS = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function atomicWrite(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  const json = JSON.stringify(data, null, 2);
  const handle = await fsp.open(tmp, 'w');
  try {
    await handle.writeFile(json, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await fsp.rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < RENAME_RETRIES) {
        await sleep(RENAME_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}

/**
 * JSON 파일 하나를 메모리에 올려 두고, 변경은 쓰기 큐에서 순서대로 처리한다.
 * 변경은 복사본에 적용한 뒤 파일 쓰기가 성공했을 때만 메모리에 반영한다.
 */
export class FileStore<T> {
  private data!: T;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string, private readonly createDefault: () => T) {}

  load(migrate?: (raw: T) => T): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.data = this.createDefault();
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
      logger.info(`데이터 파일 생성: ${this.file}`);
      return;
    }
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as T;
    this.data = migrate ? migrate(raw) : raw;
  }

  read(): T {
    return this.data;
  }

  update<R>(mutator: (draft: T) => R | Promise<R>): Promise<R> {
    const job = this.queue.then(async () => {
      const draft = structuredClone(this.data);
      const result = await mutator(draft);
      try {
        await atomicWrite(this.file, draft);
      } catch (err) {
        logger.error(`파일 쓰기 실패: ${this.file}`, { error: String(err) });
        throw Errors.storageWriteFailed();
      }
      this.data = draft;
      return result;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}
