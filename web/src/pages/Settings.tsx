import { App, Alert, Button, Card, Form, Input, InputNumber, Select, Space, Switch, Table, Tabs, Tag, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ROLE, SEVERITY, type Severity } from '@shared/codes';
import type { Config, Module, User } from '@shared/types';
import { api } from '../api';
import { useApp } from '../store/user';
import { options } from '../components/tags';
import { useApiError } from '../components/useApiError';

type Row<T> = T & { _new?: boolean; _key: string };

let keySeq = 0;
const withKey = <T,>(items: T[]): Row<T>[] => items.map((i) => ({ ...i, _key: `k${keySeq++}` }));
const strip = <T,>(rows: Row<T>[]): T[] => rows.map(({ _new: _n, _key: _k, ...rest }) => rest as unknown as T);

export function Settings() {
  const { config, isManager } = useApp();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const onError = useApiError();
  const { data: usage } = useQuery({ queryKey: ['config-usage'], queryFn: api.configUsage });

  const [project, setProject] = useState(config.project);
  const [users, setUsers] = useState<Row<User>[]>(() => withKey(config.users));
  const [modules, setModules] = useState<Row<Module>[]>(() => withKey(config.modules));
  const [settings, setSettings] = useState(config.settings);
  const [roundInput, setRoundInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProject(config.project);
    setUsers(withKey(config.users));
    setModules(withKey(config.modules));
    setSettings(config.settings);
  }, [config]);

  const ro = !isManager;
  const updateUser = (key: string, patch: Partial<User>) => setUsers(users.map((u) => (u._key === key ? { ...u, ...patch } : u)));
  const updateModule = (key: string, patch: Partial<Module>) => setModules(modules.map((m) => (m._key === key ? { ...m, ...patch } : m)));

  const save = async () => {
    setSaving(true);
    try {
      const next: Config = { project, users: strip(users), modules: strip(modules), settings };
      const saved = await api.saveConfig(next);
      queryClient.setQueryData(['config'], saved);
      queryClient.invalidateQueries({ queryKey: ['config-usage'] });
      message.success('설정을 저장했습니다.');
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  const inUseTip = '이슈에서 사용 중입니다. 사용 안 함으로 변경하세요.';
  const managers = users.filter((u) => u.role === 'MANAGER').map((u) => ({ value: u.id, label: u.name || u.id }));

  return (
    <Card
      title="설정"
      extra={isManager ? <Button type="primary" loading={saving} onClick={save}>저장</Button> : <Tag>읽기 전용 (PL/PM만 변경 가능)</Tag>}
      style={{ maxWidth: 1100, margin: '0 auto' }}
    >
      <Tabs items={[
        {
          key: 'project',
          label: '프로젝트',
          children: (
            <Form layout="vertical" style={{ maxWidth: 500 }}>
              <Form.Item label="프로젝트명">
                <Input value={project.name} disabled={ro} onChange={(e) => setProject({ ...project, name: e.target.value })} />
              </Form.Item>
              <Form.Item label="테스트 차수" extra="통합테스트 회차 구분에 사용합니다. 태그를 닫으면 삭제됩니다.">
                <Space wrap>
                  {project.testRounds.map((r, idx) => (
                    <Tag key={r} closable={!ro} onClose={() => setProject({ ...project, testRounds: project.testRounds.filter((x) => x !== r) })}>
                      {!ro && idx > 0 && (
                        <a onClick={() => {
                          const arr = [...project.testRounds];
                          [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                          setProject({ ...project, testRounds: arr });
                        }}>{'< '}</a>
                      )}
                      {r}
                    </Tag>
                  ))}
                  {!ro && (
                    <Space.Compact>
                      <Input size="small" style={{ width: 90 }} value={roundInput} placeholder="예: 4차" onChange={(e) => setRoundInput(e.target.value)} />
                      <Button size="small" onClick={() => {
                        const v = roundInput.trim();
                        if (v && !project.testRounds.includes(v)) setProject({ ...project, testRounds: [...project.testRounds, v] });
                        setRoundInput('');
                      }}>추가</Button>
                    </Space.Compact>
                  )}
                </Space>
              </Form.Item>
            </Form>
          ),
        },
        {
          key: 'users',
          label: `사용자 (${users.length})`,
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert type="info" showIcon message="사용자 ID는 u- 로 시작하는 영문·숫자이며, 등록 후에는 바꿀 수 없습니다." />
              <Table<Row<User>> size="small" rowKey="_key" dataSource={users} pagination={false}
                columns={[
                  { title: 'ID', dataIndex: 'id', width: 160, render: (v, r) => (r._new && !ro
                    ? <Input size="small" value={v} placeholder="u-hong" onChange={(e) => updateUser(r._key, { id: e.target.value })} />
                    : v) },
                  { title: '이름', dataIndex: 'name', render: (v, r) => <Input size="small" value={v} disabled={ro} onChange={(e) => updateUser(r._key, { name: e.target.value })} /> },
                  { title: '역할', dataIndex: 'role', width: 130, render: (v, r) => <Select size="small" style={{ width: '100%' }} value={v} disabled={ro} options={options(ROLE)} onChange={(role) => updateUser(r._key, { role })} /> },
                  { title: '소속', dataIndex: 'org', render: (v, r) => <Input size="small" value={v} disabled={ro} onChange={(e) => updateUser(r._key, { org: e.target.value })} /> },
                  { title: '사용', dataIndex: 'active', width: 70, render: (v, r) => <Switch size="small" checked={v} disabled={ro} onChange={(active) => updateUser(r._key, { active })} /> },
                  ...(ro ? [] : [{
                    title: '', width: 50, render: (_: unknown, r: Row<User>) => {
                      const used = !r._new && usage?.users.includes(r.id);
                      return (
                        <Tooltip title={used ? inUseTip : undefined}>
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={used}
                            onClick={() => setUsers(users.filter((u) => u._key !== r._key))} />
                        </Tooltip>
                      );
                    },
                  }]),
                ]} />
              {!ro && (
                <Button icon={<PlusOutlined />} onClick={() => setUsers([...users, ...withKey([{ id: 'u-', name: '', role: 'TESTER' as const, org: '', active: true }]).map((u) => ({ ...u, _new: true }))])}>
                  사용자 추가
                </Button>
              )}
            </Space>
          ),
        },
        {
          key: 'modules',
          label: `모듈 (${modules.length})`,
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Table<Row<Module>> size="small" rowKey="_key" dataSource={modules} pagination={false}
                columns={[
                  { title: '코드', dataIndex: 'code', width: 140, render: (v, r) => (r._new && !ro
                    ? <Input size="small" value={v} placeholder="ORD" onChange={(e) => updateModule(r._key, { code: e.target.value })} />
                    : v) },
                  { title: '모듈명', dataIndex: 'name', render: (v, r) => <Input size="small" value={v} disabled={ro} onChange={(e) => updateModule(r._key, { name: e.target.value })} /> },
                  { title: '담당 PL', dataIndex: 'managerId', width: 180, render: (v, r) => <Select size="small" allowClear style={{ width: '100%' }} value={v ?? undefined} disabled={ro} options={managers} onChange={(managerId) => updateModule(r._key, { managerId: managerId ?? null })} /> },
                  { title: '사용', dataIndex: 'active', width: 70, render: (v, r) => <Switch size="small" checked={v} disabled={ro} onChange={(active) => updateModule(r._key, { active })} /> },
                  ...(ro ? [] : [{
                    title: '', width: 50, render: (_: unknown, r: Row<Module>) => {
                      const used = !r._new && usage?.modules.includes(r.code);
                      return (
                        <Tooltip title={used ? inUseTip : undefined}>
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={used}
                            onClick={() => setModules(modules.filter((m) => m._key !== r._key))} />
                        </Tooltip>
                      );
                    },
                  }]),
                ]} />
              {!ro && (
                <Button icon={<PlusOutlined />} onClick={() => setModules([...modules, ...withKey([{ code: '', name: '', managerId: null, active: true }]).map((m) => ({ ...m, _new: true }))])}>
                  모듈 추가
                </Button>
              )}
            </Space>
          ),
        },
        {
          key: 'settings',
          label: '기준값',
          children: (
            <Form layout="horizontal" labelCol={{ span: 8 }} style={{ maxWidth: 500 }}>
              {(Object.keys(SEVERITY) as Severity[]).map((s) => (
                <Form.Item key={s} label={`기본 조치 기한: ${SEVERITY[s]}`}>
                  <InputNumber min={1} max={365} addonAfter="일" value={settings.dueDays[s]} disabled={ro}
                    onChange={(v) => setSettings({ ...settings, dueDays: { ...settings.dueDays, [s]: v ?? 1 } })} />
                </Form.Item>
              ))}
              <Form.Item label="장기 미조치 기준">
                <InputNumber min={1} max={365} addonAfter="일" value={settings.staleDays} disabled={ro}
                  onChange={(v) => setSettings({ ...settings, staleDays: v ?? 7 })} />
              </Form.Item>
              <Form.Item label="백업 보관 기간">
                <InputNumber min={1} max={365} addonAfter="일" value={settings.backupRetentionDays} disabled={ro}
                  onChange={(v) => setSettings({ ...settings, backupRetentionDays: v ?? 30 })} />
              </Form.Item>
            </Form>
          ),
        },
      ]} />
    </Card>
  );
}
