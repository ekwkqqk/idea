import { Button, Card, Col, DatePicker, Empty, Row, Select, Space, Statistic, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS, TEST_TYPE, type Status } from '@shared/codes';
import { api, type IssueQuery } from '../api';
import { useApp } from '../store/user';
import { SeverityTag, StatusTag, options } from '../components/tags';

const STATUS_FILL: Record<Status, string> = {
  NEW: '#bfbfbf', ASSIGNED: '#1677ff', IN_PROGRESS: '#fa8c16', RESOLVED: '#722ed1', REOPENED: '#f5222d', CLOSED: '#52c41a', REJECTED: '#434343',
};

export function Dashboard() {
  const { config, userName, moduleName } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const applied: IssueQuery = {
    testType: params.get('testType') ?? undefined,
    testRound: params.get('testRound') ?? undefined,
    foundFrom: params.get('foundFrom') ?? undefined,
    foundTo: params.get('foundTo') ?? undefined,
  };
  const [filter, setFilter] = useState<IssueQuery>(applied);

  const { data, isLoading } = useQuery({
    queryKey: ['stats', applied],
    queryFn: () => api.stats(applied),
    refetchInterval: 60_000,
  });

  const goList = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ ...applied, ...extra }).forEach(([k, v]) => v && sp.set(k, v));
    navigate(`/issues?${sp.toString()}`);
  };
  const link = (value: number, extra: Record<string, string | undefined>) =>
    value > 0 ? <Typography.Link onClick={() => goList(extra)}>{value}</Typography.Link> : <span style={{ color: '#bbb' }}>0</span>;

  const search = () => {
    const sp = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => v && sp.set(k, v));
    setParams(sp);
  };

  const s = data?.summary;
  const cards: { title: string; value: number | string; extra: Record<string, string>; suffix?: string; color?: string }[] = s ? [
    { title: '전체', value: s.total, extra: { status: 'ALL' } },
    { title: '미결', value: s.open, extra: { status: 'OPEN' }, color: '#fa8c16' },
    { title: '재테스트 대기', value: s.resolved, extra: { status: 'RESOLVED' }, color: '#722ed1' },
    { title: '종료', value: s.closed, extra: { status: 'CLOSED' }, color: '#52c41a' },
    { title: '반려', value: s.rejected, extra: { status: 'REJECTED' } },
    { title: '조치율', value: s.closeRate, suffix: '%', extra: { status: 'ALL' } },
    { title: '기한 초과', value: s.overdue, extra: { status: 'OPEN', overdue: 'true' }, color: '#cf1322' },
  ] : [];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap>
          <span>구분</span>
          <Select allowClear placeholder="전체" style={{ width: 100 }} value={filter.testType} options={options(TEST_TYPE)}
            onChange={(v) => setFilter({ ...filter, testType: v })} />
          <span>차수</span>
          <Select allowClear placeholder="전체" style={{ width: 100 }} value={filter.testRound}
            options={config.project.testRounds.map((r) => ({ value: r, label: r }))}
            onChange={(v) => setFilter({ ...filter, testRound: v })} />
          <span>발견일</span>
          <DatePicker.RangePicker
            value={[filter.foundFrom ? dayjs(filter.foundFrom) : null, filter.foundTo ? dayjs(filter.foundTo) : null]}
            onChange={(r) => setFilter({ ...filter, foundFrom: r?.[0]?.format('YYYY-MM-DD'), foundTo: r?.[1]?.format('YYYY-MM-DD') })}
            allowEmpty={[true, true]}
          />
          <Button type="primary" onClick={search}>조회</Button>
        </Space>
      </Card>

      <Row gutter={[12, 12]}>
        {cards.map((c) => (
          <Col key={c.title} flex="1 1 140px">
            <Card size="small" hoverable onClick={() => goList(c.extra)} loading={isLoading}>
              <Statistic title={c.title} value={c.value} suffix={c.suffix} valueStyle={c.color ? { color: c.color } : undefined} />
            </Card>
          </Col>
        ))}
      </Row>

      {data && (
        <>
          <Row gutter={[12, 12]}>
            <Col xs={24} lg={12}>
              <Card size="small" title="상태별 현황">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={(Object.keys(STATUS) as Status[]).map((k) => ({ key: k, name: STATUS[k], count: data.byStatus[k] }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="건수" cursor="pointer"
                      onClick={(d) => {
                        const key = (d as { payload?: { key?: string } }).payload?.key;
                        if (key) goList({ status: key });
                      }}>
                      {(Object.keys(STATUS) as Status[]).map((k) => <Cell key={k} fill={STATUS_FILL[k]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="일자별 추이">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.daily.map((d) => ({ ...d, date: d.date.slice(5) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="found" name="발견" stroke="#fa8c16" dot={false} />
                    <Line type="monotone" dataKey="closed" name="종료" stroke="#52c41a" dot={false} />
                    <Line type="monotone" dataKey="openAccum" name="누적 미결" stroke="#f5222d" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} lg={10}>
              <Card size="small" title="심각도별 현황">
                <Table size="small" pagination={false} rowKey="severity" dataSource={data.bySeverity}
                  columns={[
                    { title: '심각도', dataIndex: 'severity', render: (v) => <SeverityTag severity={v} /> },
                    { title: '미결', dataIndex: 'open', align: 'right', render: (v, r) => link(v, { severity: r.severity, status: 'OPEN' }) },
                    { title: '종료', dataIndex: 'closed', align: 'right', render: (v, r) => link(v, { severity: r.severity, status: 'CLOSED' }) },
                  ]} />
              </Card>
            </Col>
            <Col xs={24} lg={14}>
              <Card size="small" title="담당자별 미결 현황">
                <Table size="small" pagination={false} rowKey="assignee" dataSource={data.byAssignee}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="담당 중인 미결 이슈 없음" /> }}
                  columns={[
                    { title: '담당자', dataIndex: 'assignee', render: (v) => userName(v) },
                    { title: '접수', dataIndex: 'assigned', align: 'right', render: (v, r) => link(v, { assignee: r.assignee, status: 'ASSIGNED' }) },
                    { title: '조치중', dataIndex: 'inProgress', align: 'right', render: (v, r) => link(v, { assignee: r.assignee, status: 'IN_PROGRESS' }) },
                    { title: '재오픈', dataIndex: 'reopened', align: 'right', render: (v, r) => link(v, { assignee: r.assignee, status: 'REOPENED' }) },
                    { title: '기한 초과', dataIndex: 'overdue', align: 'right', render: (v, r) => link(v, { assignee: r.assignee, status: 'OPEN', overdue: 'true' }) },
                  ]} />
              </Card>
            </Col>
          </Row>

          <Card size="small" title="모듈별 현황">
            <Table size="small" pagination={false} rowKey="module" dataSource={data.byModule}
              columns={[
                { title: '모듈', dataIndex: 'module', render: (v) => moduleName(v) },
                { title: '전체', dataIndex: 'total', align: 'right', render: (v, r) => link(v, { module: r.module, status: 'ALL' }) },
                { title: '미결', dataIndex: 'open', align: 'right', render: (v, r) => link(v, { module: r.module, status: 'OPEN' }) },
                { title: '조치율', dataIndex: 'closeRate', align: 'right', render: (v) => `${v}%` },
              ]} />
          </Card>

          <Card size="small" title={`장기 미조치 이슈 (기한 초과 또는 ${config.settings.staleDays}일 이상 경과)`}>
            <Table size="small" rowKey="id" dataSource={data.stale} pagination={false}
              onRow={(r) => ({ onClick: () => navigate(`/issues/${r.id}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'ID', dataIndex: 'id', width: 100 },
                { title: '제목', dataIndex: 'title', ellipsis: true },
                { title: '심각도', dataIndex: 'severity', width: 80, render: (v) => <SeverityTag severity={v} /> },
                { title: '상태', dataIndex: 'status', width: 90, render: (v) => <StatusTag status={v} /> },
                { title: '담당자', dataIndex: 'assignee', width: 100, render: (v) => userName(v) },
                { title: '경과일', dataIndex: 'elapsedDays', width: 80, align: 'right' },
                { title: '기한 초과', dataIndex: 'overdue', width: 90, align: 'center', render: (v) => (v ? <span style={{ color: '#cf1322' }}>초과</span> : '') },
              ]} />
          </Card>
        </>
      )}
    </Space>
  );
}
