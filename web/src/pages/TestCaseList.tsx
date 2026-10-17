import { App, Button, Card, Col, Form, Input, Modal, Row, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { TEST_TYPE } from '@shared/codes';
import type { TestCaseSummary } from '@shared/types';
import { api, type IssueQuery } from '../api';
import { ApiError } from '../api/client';
import { useApp } from '../store/user';
import { TestTypeText, options } from '../components/tags';
import { useApiError } from '../components/useApiError';

const FILTER_KEYS = ['testType', 'module', 'active', 'q'] as const;
type Filter = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

const EDITABLE = ['testType', 'module', 'programId', 'title', 'precondition', 'steps', 'expected', 'owner', 'active'] as const;

function TestCaseModal({ target, onClose }: { target: TestCaseSummary | 'new' | null; onClose: () => void }) {
  const { config, isManager } = useApp();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const onError = useApiError();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = target !== null && target !== 'new';

  useEffect(() => {
    if (!target) return;
    form.resetFields();
    if (target !== 'new') form.setFieldsValue(target);
  }, [target, form]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['testcases'] });

  const submit = async () => {
    let values: Record<string, any>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const payload: Record<string, unknown> = {
      ...values,
      programId: values.programId ?? '',
      precondition: values.precondition ?? '',
      owner: values.owner ?? null,
    };
    setSaving(true);
    try {
      if (isEdit) {
        const changes = Object.fromEntries(
          EDITABLE.filter((k) => payload[k] !== undefined && payload[k] !== target[k]).map((k) => [k, payload[k]]),
        );
        if (Object.keys(changes).length) await api.patchTestCase(target.id, { version: target.version, changes });
        message.success('수정했습니다.');
      } else {
        const created = await api.createTestCase(payload);
        message.success(`${created.id} 테스트케이스를 등록했습니다.`);
      }
      await refresh();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details.length) {
        form.setFields(err.details.filter((d) => d.field).map((d) => ({ name: d.field!.replace(/^changes\./, ''), errors: [d.message] })));
      }
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!isEdit) return;
    modal.confirm({
      title: `${target.id}를 삭제할까요?`,
      content: '이슈에 연결된 테스트케이스는 삭제할 수 없습니다. 사용 안 함으로 변경하세요.',
      okText: '삭제',
      okButtonProps: { danger: true },
      cancelText: '취소',
      onOk: async () => {
        try {
          await api.deleteTestCase(target.id);
          message.success('삭제했습니다.');
          await refresh();
          onClose();
        } catch (err) {
          onError(err);
        }
      },
    });
  };

  const required = [{ required: true, whitespace: true, message: '필수 입력입니다.' }];

  return (
    <Modal
      open={target !== null}
      title={isEdit ? `테스트케이스 수정 - ${target.id}` : '테스트케이스 등록'}
      width={900}
      onCancel={onClose}
      footer={(
        <Space style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{isEdit && isManager && <Button danger disabled={target.issueCount > 0} onClick={remove}>삭제</Button>}</span>
          <Space>
            <Button onClick={onClose}>취소</Button>
            <Button type="primary" loading={saving} onClick={submit}>저장</Button>
          </Space>
        </Space>
      )}
    >
      <Form form={form} layout="vertical" initialValues={{ testType: 'UT', active: true }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="id" label="테스트케이스 ID"
              rules={[...required, { pattern: /^[A-Za-z0-9_-]{1,50}$/, message: '영문·숫자·-·_ 50자 이하입니다.' }]}>
              <Input disabled={isEdit} placeholder="예: TC-UT-ORD-012" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="testType" label="테스트구분" rules={[{ required: true }]}
              extra={isEdit && target.issueCount > 0 ? '연결된 이슈가 있으면 구분을 바꿀 수 없습니다.' : undefined}>
              <Select options={options(TEST_TYPE)} disabled={isEdit && target.issueCount > 0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="module" label="업무/모듈" rules={[{ required: true, message: '필수 입력입니다.' }]}>
              <Select showSearch optionFilterProp="label"
                options={config.modules.filter((m) => m.active || (isEdit && m.code === target.module)).map((m) => ({ value: m.code, label: m.name }))} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="programId" label="화면/프로그램 ID" rules={[{ max: 50 }]}>
              <Input placeholder="예: SCR-ORD-001" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="owner" label="담당자">
              <Select allowClear showSearch optionFilterProp="label"
                options={config.users.filter((u) => u.active || (isEdit && u.id === target.owner)).map((u) => ({ value: u.id, label: u.name }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="active" label="사용" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="title" label="테스트명" rules={[...required, { max: 200 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="precondition" label="사전조건" rules={[{ max: 2000 }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="steps" label="테스트 절차" rules={[...required, { max: 4000 }]}>
          <Input.TextArea rows={5} placeholder={'1. 화면 진입\n2. 값 입력\n3. 버튼 클릭'} showCount maxLength={4000} />
        </Form.Item>
        <Form.Item name="expected" label="기대 결과" rules={[...required, { max: 2000 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function TestCaseList() {
  const { config, currentUser, userName, moduleName, isManager } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>({});
  const [editing, setEditing] = useState<TestCaseSummary | 'new' | null>(null);
  const canEdit = currentUser?.role === 'TESTER' || isManager;

  const apiQuery: IssueQuery = {};
  params.forEach((v, k) => { apiQuery[k] = v; });

  useEffect(() => {
    const f: Filter = {};
    FILTER_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) f[k] = v;
    });
    setFilter(f);
  }, [params]);

  const { data, isFetching } = useQuery({
    queryKey: ['testcases', apiQuery],
    queryFn: () => api.testCases(apiQuery),
    placeholderData: keepPreviousData,
  });

  const apply = (next: Filter) => {
    const sp = new URLSearchParams();
    Object.entries({ ...next, size: params.get('size') ?? undefined }).forEach(([k, v]) => v && sp.set(k, v));
    setParams(sp);
  };

  const columns: ColumnsType<TestCaseSummary> = [
    { title: '테스트케이스 ID', dataIndex: 'id', width: 160 },
    { title: '구분', dataIndex: 'testType', width: 60, render: (v) => <TestTypeText testType={v} /> },
    { title: '모듈', dataIndex: 'module', width: 100, render: (v) => moduleName(v) },
    { title: '화면ID', dataIndex: 'programId', width: 130, ellipsis: true },
    { title: '테스트명', dataIndex: 'title', ellipsis: true },
    { title: '담당자', dataIndex: 'owner', width: 90, render: (v) => userName(v) },
    {
      title: '연결 이슈(미결/전체)', dataIndex: 'issueCount', width: 150, align: 'center',
      render: (v: number, r) => (v > 0
        ? (
          <Link to={`/issues?testCaseId=${encodeURIComponent(r.id)}&status=ALL`} onClick={(e) => e.stopPropagation()}>
            <span style={r.openIssueCount ? { color: '#cf1322', fontWeight: 600 } : undefined}>{r.openIssueCount}</span> / {v}
          </Link>
        )
        : '-'),
    },
    { title: '사용', dataIndex: 'active', width: 80, render: (v) => (v ? <Tag color="green">사용</Tag> : <Tag>미사용</Tag>) },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap>
          <Select allowClear placeholder="구분" style={{ width: 90 }} value={filter.testType} options={options(TEST_TYPE)}
            onChange={(v) => setFilter({ ...filter, testType: v })} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="모듈" style={{ width: 130 }} value={filter.module}
            options={config.modules.map((m) => ({ value: m.code, label: m.name }))} onChange={(v) => setFilter({ ...filter, module: v })} />
          <Select allowClear placeholder="사용 여부" style={{ width: 110 }} value={filter.active}
            options={[{ value: 'true', label: '사용' }, { value: 'false', label: '미사용' }]} onChange={(v) => setFilter({ ...filter, active: v })} />
          <Input.Search allowClear placeholder="ID, 테스트명, 화면ID" style={{ width: 280 }} value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })} onSearch={(v) => apply({ ...filter, q: v })} />
          <Button type="primary" onClick={() => apply(filter)}>조회</Button>
          <Button onClick={() => setParams(new URLSearchParams())}>초기화</Button>
        </Space>
      </Card>

      <Card
        size="small"
        title={<Typography.Text>총 <b>{data?.total ?? 0}</b>건</Typography.Text>}
        extra={(
          <Space>
            {isManager && <Button icon={<UploadOutlined />} onClick={() => navigate('/testcases/import')}>엑셀 가져오기</Button>}
            {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>테스트케이스 등록</Button>}
          </Space>
        )}
      >
        <Table<TestCaseSummary>
          size="small"
          rowKey="id"
          loading={isFetching}
          dataSource={data?.items}
          columns={columns}
          scroll={{ x: 1000 }}
          onRow={(r) => ({ onClick: () => canEdit && setEditing(r), style: canEdit ? { cursor: 'pointer' } : undefined })}
          pagination={{
            current: data?.page ?? 1,
            pageSize: data?.size ?? 20,
            total: data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
          }}
          onChange={(pagination) => {
            const sp = new URLSearchParams(params);
            sp.set('page', String(pagination.current ?? 1));
            sp.set('size', String(pagination.pageSize ?? 20));
            setParams(sp);
          }}
        />
      </Card>
      <TestCaseModal target={editing} onClose={() => setEditing(null)} />
    </Space>
  );
}
