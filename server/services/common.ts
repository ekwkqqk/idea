import type { HistoryAction, Issue, User } from '../../shared/types';
import { nowIso } from '../../shared/dates';
import { Errors } from '../errors';

const LONG_TEXT_FIELDS = new Set(['steps', 'expected', 'actual']);
const HISTORY_TEXT_LIMIT = 100;

function historyValue(field: string | null, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (field && LONG_TEXT_FIELDS.has(field) && text.length > HISTORY_TEXT_LIMIT) return text.slice(0, HISTORY_TEXT_LIMIT);
  return text;
}

export function addHistory(
  issue: Issue,
  user: User,
  action: HistoryAction,
  opts: { field?: string; from?: unknown; to?: unknown; note?: string | null; at?: string } = {},
) {
  const field = opts.field ?? null;
  issue.history.push({
    at: opts.at ?? nowIso(),
    user: user.id,
    action,
    field,
    from: historyValue(field, opts.from),
    to: historyValue(field, opts.to),
    note: opts.note ?? null,
  });
}

export function touch(issue: Issue) {
  issue.updatedAt = nowIso();
  issue.version += 1;
}

export function checkVersion(issue: Issue, version: number) {
  if (issue.version !== version) throw Errors.versionConflict();
}
