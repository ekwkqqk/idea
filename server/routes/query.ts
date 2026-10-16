import type { Request } from 'express';
import type { SearchQuery } from '../services/issueService';

const KEYS: (keyof SearchQuery)[] = [
  'testType', 'testRound', 'status', 'severity', 'issueType', 'module', 'assignee', 'reporter',
  'foundFrom', 'foundTo', 'overdue', 'q', 'sort', 'page', 'size',
];

export function searchQuery(req: Request): SearchQuery {
  const out: SearchQuery = {};
  for (const key of KEYS) {
    const v = req.query[key];
    const s = Array.isArray(v) ? v.join(',') : typeof v === 'string' ? v : undefined;
    if (s) out[key] = s;
  }
  return out;
}
