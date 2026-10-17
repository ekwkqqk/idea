import { Alert, Button, Card, Checkbox, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType, SorterResult } from 'antd/es/table/interface';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ISSUE_TYPE, SEVERITY, STATUS, TEST_TYPE } from '@shared/codes';
import type { IssueSummary } from '@shared/types';
import { api, type IssueQuery } from '../api';
import { useApp } from '../store/user';
import { PriorityText, SeverityTag, StatusTag, TestTypeText, options } from '../components/tags';
import { useApiError } from '../components/useApiError';

const FILTER_KEYS = ['testType', 'testRound', 'status', 'severity', 'issueType', 'module', 'assignee', 'reporter', 'testCaseId', 'foundFrom', 'foundTo', 'overdue', 'q'] as const;
type Filter = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** URL의 status가 없으면 미결, ALL이면 전체 */
function toApiQuery(params: URLSearchParams): IssueQuery {
  const q: IssueQuery = {};
  params.forEach((v, k) => { q[k] = v; });
  if (!q.status) q.status = 'OPEN';
  if (q.status === 'ALL') delete q.status;
  return q;
}

export function IssueList() {
  const { config, currentUser, userName, moduleName, isManager } = useApp();
  const navigate = useNavigate();
  const onError = useApiError();
  const [params, setParams] = useSearchParams();
  const apiQuery = toApiQuery(params);
  const [filter, setFilter] = useState<Filter>({});

  useEffect(() => {
    const f: Filter = {};
    FILTER_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) f[k] = v;
    });
    if (!f.status) f.status = 'OPEN';
    setFilter(f);
  }, [params]);

  const { data, isFetching } = useQuery({
    queryKey: ['issues', apiQuery],
    queryFn: () => api.issues(apiQuery),
    placeholderData: keepPreviousData,
  });

  const myModules = config.modules.filter((m) => m.managerId === currentUser?.id).map((m) => m.code);
  const { data: newInMyModules } = useQuery({
    queryKey: ['issues', 'my-module-new', myModules],
    queryFn: () => api.issues({ status: 'NEW', size: '100' }),
    enabled: isManager && myModules.length > 0,
    select: (page) => page.items.filter((i) => myModules.includes(i.module)).length,
  });

  const apply = (next: Filter, keep: Record<string, string | undefined> = {}) => {
    const sp = new URLSearchParams();
    Object.entries({ ...next, ...keep }).forEach(([k, v]) => v && sp.set(k, v));
    setParams(sp);
  };
  const quick = (f: Filter) => apply(f, { sort: params.get('sort') ?? undefined, size: params.get('size') ?? undefined });

  const me = currentUser?.id;
  const quickFilters: { label: string; filter: Filter }[] = [
    { label: '미결', filter: { status: 'OPEN' } },
    { label: '내 담당', filter: { assignee: me, status: 'OPEN' } },
    { label: '내가 등록', filter: { reporter: me, status: 'ALL' } },
    { label: '재테스트 대기', filter: { status: 'RESOLVED', ...(currentUser?.role === 'TESTER' ? { reporter: me } : {}) } },
    { label: '기한 초과', filter: { status: 'OPEN', overdue: 'true' } },
    { label: '전체', filter: { status: 'ALL' } },
  ];

  const statusValue = filter.status === 'OPEN' || filter.status === 'ALL' || !filter.status ? [] : filter.status.split(',');
  const sort = params.get('sort') ?? 'foundDate,desc';
  const [sortField, sortDir] = sort.split(',');
  const sortOrder = (key: string) => (sortField === key ? (sortDir === 'asc' ? 'ascend' : 'descend') : null);
  const users = config.users.map((u) => ({ value: u.id, label: u.name }));

  const columns: ColumnsType<IssueSummary> = [
    { title: 'ID', dataIndex: 'id', width: 95, sorter: true, sortOrder: sortOrder('id') },
    { title: '구분', dataIndex: 'testType', width: 60, render: (v) => <TestTypeText testType={v} /> },
    { title: '모듈', dataIndex: 'module', width: 90, sorter: true, sortOrder: sortOrder('module'), render: (v) => moduleName(v) },
    { title: '화면ID', dataIndex: 'programId', width: 120, ellipsis: true },
    { title: '제목', dataIndex: 'title', ellipsis: true, sorter: true, sortOrder: sortOrder('title') },
    { title: '심각도', dataIndex: 'severity', width: 80, sorter: true, sortOrder: sortOrder('severity'), render: (v) => <SeverityTag severity={v} /> },
    { title: '우선', dataIndex: 'priority', width: 70, sorter: true, sortOrder: sortOrder('priority'), render: (v) => <PriorityText priority={v} /> },
    { title: '상태', dataIndex: 'status', width: 90, sorter: true, sortOrder: sortOrder('status'), render: (v) => <StatusTag status={v} /> },
    { title: '발견자', dataIndex: 'reporter', width: 85, sorter: true, sortOrder: sortOrder('reporter'), render: (v) => userName(v) },
    { title: '담당자', dataIndex: 'assignee', width: 85, sorter: true, sortOrder: sortOrder('assignee'), render: (v) => userName(v) },
    { title: '발견일', dataIndex: 'foundDate', width: 100, sorter: true, sortOrder: sortOrder('foundDate') },
    {
      title: '기한', dataIndex: 'dueDate', width: 100, sorter: true, sortOrder: sortOrder('dueDate'),
      render: (v, r) => <span style={r.overdue ? { color: '#cf1322', fontWeight: 600 } : undefined}>{v}</span>,
    },
    {
      title: '경과', dataIndex: 'elapsedDays', width: 65, align: 'right', sorter: true, sortOrder: sortOrder('elapsedDays'),
      render: (v, r) => <span style={r.overdue ? { color: '#cf1322', fontWeight: 600 } : undefined}>{v}</span>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {isManager && !!newInMyModules && (
        <Alert type="info" showIcon
          message={<>담당 모듈에 신규 이슈가 <b>{newInMyModules}</b>건 있습니다. 담당자를 지정하세요.</>}
          action={<Button size="small" onClick={() => quick({ status: 'NEW' })}>신규 이슈 보기</Button>} />
      )}
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <span>빠른 필터</span>
            {quickFilters.map((qf) => (
              <Button key={qf.label} size="small" onClick={() => quick(qf.filter)}>{qf.label}</Button>
            ))}
          </Space>
          <Space wrap>
            <Select allowClear placeholder="구분" style={{ width: 90 }} value={filter.testType} options={options(TEST_TYPE)}
              onChange={(v) => setFilter({ ...filter, testType: v })} />
            <Select allowClear placeholder="차수" style={{ width: 90 }} value={filter.testRound}
              options={config.project.testRounds.map((r) => ({ value: r, label: r }))} onChange={(v) => setFilter({ ...filter, testRound: v })} />
            <Select mode="multiple" allowClear placeholder={filter.status === 'ALL' ? '상태: 전체' : '상태: 미결'} style={{ minWidth: 200 }}
              value={statusValue} options={options(STATUS)} maxTagCount="responsive"
              onChange={(v: string[]) => setFilter({ ...filter, status: v.length ? v.join(',') : 'OPEN' })} />
            <Checkbox checked={filter.status === 'ALL'} onChange={(e) => setFilter({ ...filter, status: e.target.checked ? 'ALL' : 'OPEN' })}>
              종료·반려 포함
            </Checkbox>
            <Select mode="multiple" allowClear placeholder="심각도" style={{ minWidth: 140 }} maxTagCount="responsive"
              value={filter.severity ? filter.severity.split(',') : []} options={options(SEVERITY)}
              onChange={(v: string[]) => setFilter({ ...filter, severity: v.join(',') || undefined })} />
            <Select allowClear placeholder="유형" style={{ width: 90 }} value={filter.issueType} options={options(ISSUE_TYPE)}
              onChange={(v) => setFilter({ ...filter, issueType: v })} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="모듈" style={{ width: 130 }} value={filter.module}
              options={config.modules.map((m) => ({ value: m.code, label: m.name }))} onChange={(v) => setFilter({ ...filter, module: v })} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="담당자" style={{ width: 110 }} value={filter.assignee}
              options={users} onChange={(v) => setFilter({ ...filter, assignee: v })} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="발견자" style={{ width: 110 }} value={filter.reporter}
              options={users} onChange={(v) => setFilter({ ...filter, reporter: v })} />
          </Space>
          <Space wrap>
            <span>발견일</span>
            <DatePicker.RangePicker allowEmpty={[true, true]}
              value={[filter.foundFrom ? dayjs(filter.foundFrom) : null, filter.foundTo ? dayjs(filter.foundTo) : null]}
              onChange={(r) => setFilter({ ...filter, foundFrom: r?.[0]?.format('YYYY-MM-DD'), foundTo: r?.[1]?.format('YYYY-MM-DD') })} />
            <Checkbox checked={filter.overdue === 'true'} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked ? 'true' : undefined })}>
              기한 초과만
            </Checkbox>
            {filter.testCaseId && (
              <Tag closable color="blue" onClose={() => apply({ ...filter, testCaseId: undefined })}>
                테스트케이스: {filter.testCaseId}
              </Tag>
            )}
            <Input.Search allowClear placeholder="ID, 제목, 재현 절차, 화면ID, 테스트케이스ID" style={{ width: 300 }} value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              onSearch={(v) => apply({ ...filter, q: v }, { sort: params.get('sort') ?? undefined, size: params.get('size') ?? undefined })} />
            <Button type="primary" onClick={() => apply(filter, { sort: params.get('sort') ?? undefined, size: params.get('size') ?? undefined })}>조회</Button>
            <Button onClick={() => setParams(new URLSearchParams())}>초기화</Button>
          </Space>
        </Space>
      </Card>

      <Card
        size="small"
        title={<Typography.Text>총 <b>{data?.total ?? 0}</b>건</Typography.Text>}
        extra={(
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => api.exportExcel(apiQuery).catch(onError)}>엑셀 내보내기</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/issues/new')}>이슈 등록</Button>
          </Space>
        )}
      >
        <Table<IssueSummary>
          size="small"
          rowKey="id"
          loading={isFetching}
          dataSource={data?.items}
          columns={columns}
          scroll={{ x: 1200 }}
          onRow={(r) => ({
            onClick: (e) => (e.ctrlKey || e.metaKey ? window.open(`/issues/${r.id}`, '_blank') : navigate(`/issues/${r.id}`)),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: data?.page ?? 1,
            pageSize: data?.size ?? 20,
            total: data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
          }}
          onChange={(pagination, _filters, sorter) => {
            const sp = new URLSearchParams(params);
            const s = sorter as SorterResult<IssueSummary>;
            if (s.order && s.field) sp.set('sort', `${String(s.field)},${s.order === 'ascend' ? 'asc' : 'desc'}`);
            else sp.delete('sort');
            sp.set('page', String(pagination.current ?? 1));
            sp.set('size', String(pagination.pageSize ?? 20));
            setParams(sp);
          }}
        />
      </Card>
    </Space>
  );
}
