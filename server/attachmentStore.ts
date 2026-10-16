import path from 'node:path';
import type { Attachment } from '../shared/types';
import { ATTACHMENTS_DIR } from './paths';

export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/')).replace(/\.\.+/g, '.').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return base.slice(-150) || 'file';
}

export function attachmentPath(issueId: string, a: Pick<Attachment, 'id' | 'fileName'>): string {
  return path.join(ATTACHMENTS_DIR, issueId, `${a.id}_${safeFileName(a.fileName)}`);
}
