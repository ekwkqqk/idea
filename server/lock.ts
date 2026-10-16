import fs from 'node:fs';
import { LOCK_FILE } from './paths';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** 같은 data 폴더를 쓰는 서버가 이미 실행 중이면 시작하지 않는다 */
export function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(`이미 실행 중인 서버가 있습니다(PID ${pid}). 서버는 하나만 실행해야 합니다. (${LOCK_FILE})`);
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');

  const release = () => {
    try {
      if (fs.existsSync(LOCK_FILE) && fs.readFileSync(LOCK_FILE, 'utf8').trim() === String(process.pid)) {
        fs.rmSync(LOCK_FILE, { force: true });
      }
    } catch {
      // 종료 중이므로 무시
    }
  };
  process.on('exit', release);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.on(signal, () => {
      release();
      process.exit(0);
    });
  }
}
