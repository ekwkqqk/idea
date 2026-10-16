import { Tag } from 'antd';
import { PRIORITY, SEVERITY, STATUS, TEST_TYPE, type Priority, type Severity, type Status, type TestType } from '@shared/codes';

const STATUS_COLOR: Record<Status, string> = {
  NEW: 'default',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'orange',
  RESOLVED: 'purple',
  REOPENED: 'red',
  CLOSED: 'green',
  REJECTED: '#333',
};

const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'blue',
  LOW: 'default',
};

export const StatusTag = ({ status }: { status: Status }) => <Tag color={STATUS_COLOR[status]}>{STATUS[status]}</Tag>;
export const SeverityTag = ({ severity }: { severity: Severity }) => <Tag color={SEVERITY_COLOR[severity]}>{SEVERITY[severity]}</Tag>;
export const PriorityText = ({ priority }: { priority: Priority }) => (
  <span style={priority === 'URGENT' ? { color: '#cf1322', fontWeight: 600 } : undefined}>{PRIORITY[priority]}</span>
);
export const TestTypeText = ({ testType }: { testType: TestType }) => <>{TEST_TYPE[testType]}</>;

export const options = (obj: Record<string, string>) => Object.entries(obj).map(([value, label]) => ({ value, label }));
