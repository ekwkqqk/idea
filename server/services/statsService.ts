import { OPEN_STATUSES, SEVERITY, STATUS, type Severity, type Status } from '../../shared/codes';
import { addDays, diffDays, today } from '../../shared/dates';
import type { Stats } from '../../shared/types';
import { getConfig } from '../repository/configRepository';
import { elapsedDays, filterIssues, isOverdue, type SearchQuery } from './issueService';

const DAILY_DEFAULT_DAYS = 30;
const STALE_LIMIT = 50;

const round1 = (n: number) => Math.round(n * 10) / 10;
const rate = (done: number, total: number) => (total === 0 ? 0 : round1((done / total) * 100));

export function getStats(query: Pick<SearchQuery, 'testType' | 'testRound' | 'foundFrom' | 'foundTo'>): Stats {
  const issues = filterIssues({
    testType: query.testType,
    testRound: query.testRound,
    foundFrom: query.foundFrom,
    foundTo: query.foundTo,
  });
  const base = today();
  const { staleDays } = getConfig().settings;
  const isOpen = (s: Status) => OPEN_STATUSES.includes(s);

  const byStatus = Object.fromEntries(Object.keys(STATUS).map((s) => [s, 0])) as Record<Status, number>;
  const severityMap = new Map<Severity, { open: number; closed: number }>(
    (Object.keys(SEVERITY) as Severity[]).map((s) => [s, { open: 0, closed: 0 }]),
  );
  const moduleMap = new Map<string, { total: number; open: number; done: number }>();
  const assigneeMap = new Map<string, { assigned: number; inProgress: number; reopened: number; overdue: number }>();
  let overdue = 0;

  for (const i of issues) {
    byStatus[i.status] += 1;
    const open = isOpen(i.status);
    const late = isOverdue(i, base);
    if (late) overdue += 1;

    const sev = severityMap.get(i.severity)!;
    if (open) sev.open += 1;
    else if (i.status === 'CLOSED') sev.closed += 1;

    const mod = moduleMap.get(i.module) ?? { total: 0, open: 0, done: 0 };
    mod.total += 1;
    if (open) mod.open += 1;
    else mod.done += 1;
    moduleMap.set(i.module, mod);

    if (i.assignee && open) {
      const a = assigneeMap.get(i.assignee) ?? { assigned: 0, inProgress: 0, reopened: 0, overdue: 0 };
      if (i.status === 'ASSIGNED') a.assigned += 1;
      if (i.status === 'IN_PROGRESS') a.inProgress += 1;
      if (i.status === 'REOPENED') a.reopened += 1;
      if (late) a.overdue += 1;
      assigneeMap.set(i.assignee, a);
    }
  }

  // 일자별 추이
  const to = query.foundTo && query.foundTo < base ? query.foundTo : base;
  const from = query.foundFrom ?? addDays(to, -(DAILY_DEFAULT_DAYS - 1));
  const daily: Stats['daily'] = [];
  const span = Math.min(diffDays(from, to), 366);
  for (let d = 0; d <= span; d++) {
    const date = addDays(from, d);
    let found = 0;
    let closed = 0;
    let openAccum = 0;
    for (const i of issues) {
      if (i.foundDate === date) found += 1;
      const closedDate = i.closedAt?.slice(0, 10) ?? null;
      const rejectedDate = i.status === 'REJECTED' ? i.rejection?.rejectedAt.slice(0, 10) ?? null : null;
      if (i.status === 'CLOSED' && closedDate === date) closed += 1;
      const finishedDate = i.status === 'CLOSED' ? closedDate : rejectedDate;
      if (i.foundDate <= date && (!finishedDate || finishedDate > date)) openAccum += 1;
    }
    daily.push({ date, found, closed, openAccum });
  }

  const stale = issues
    .filter((i) => isOpen(i.status))
    .map((i) => ({ i, elapsed: elapsedDays(i, base), late: isOverdue(i, base) }))
    .filter((x) => x.late || x.elapsed >= staleDays)
    .sort((a, b) => b.elapsed - a.elapsed)
    .slice(0, STALE_LIMIT)
    .map(({ i, elapsed, late }) => ({
      id: i.id, title: i.title, severity: i.severity, status: i.status, assignee: i.assignee, elapsedDays: elapsed, overdue: late,
    }));

  const total = issues.length;
  return {
    summary: {
      total,
      open: issues.filter((i) => isOpen(i.status)).length,
      resolved: byStatus.RESOLVED,
      closed: byStatus.CLOSED,
      rejected: byStatus.REJECTED,
      overdue,
      closeRate: rate(byStatus.CLOSED + byStatus.REJECTED, total),
    },
    byStatus,
    bySeverity: [...severityMap].map(([severity, v]) => ({ severity, ...v })),
    byModule: [...moduleMap].map(([module, v]) => ({ module, total: v.total, open: v.open, closeRate: rate(v.done, v.total) }))
      .sort((a, b) => b.open - a.open || b.total - a.total),
    byAssignee: [...assigneeMap].map(([assignee, v]) => ({ assignee, ...v }))
      .sort((a, b) => b.overdue - a.overdue || (b.assigned + b.inProgress + b.reopened) - (a.assigned + a.inProgress + a.reopened)),
    daily,
    stale,
  };
}
