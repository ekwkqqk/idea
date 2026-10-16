import { Alert, App, Button, Card, Form, Input, Modal, Result, Select, Space, Spin, Tabs, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { REJECT_REASON, STATUS } from '@shared/codes';
import { hasUnverifiedResolution } from '@shared/transitions';
import type { IssueDetail as IssueDetailType } from '@shared/types';
import type { TransitionInput } from '@shared/schemas';
import { api } from '../api';
import { ApiError } from '../api/client';
import { useApp } from '../store/user';
import { SeverityTag, StatusTag, options } from '../components/tags';
import { BasicTab } from './detail/BasicTab';
import { ResolutionTab } from './detail/ResolutionTab';
import { RetestTab } from './detail/RetestTab';
import { TimelineTab } from './detail/TimelineTab';
import { useIssueMutation } from './detail/useIssueMutation';

type ModalAction = 'ASSIGN' | 'REJECT' | 'APPEAL' | 'REOPEN' | 'FORCE' | 'REASSIGN';

const MODAL_TITLE: Record<ModalAction, string> = {
  ASSIGN: '담당자 지정',
  REJECT: '반려',
  APPEAL: '이의 제기',
  REOPEN: '재오픈',
  FORCE: '상태 강제 변경',
  REASSIGN: '담당자 재지정',
};

function ActionModal({ issue, action, onClose }: { issue: IssueDetailType; action: ModalAction | null; onClose: () => void }) {
  const { config } = useApp();
  const { run, pending } = useIssueMutation(issue.id);
  const [form] = Form.useForm();
  const reason = Form.useWatch('reason', form);
  const developers = config.users.filter((u) => u.active && (u.role === 'DEVELOPER' || u.role === 'MANAGER'))
    .map((u) => ({ value: u.id, label: u.name }));

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !action) return;
    let ok: boolean;
    if (action === 'REASSIGN') {
      ok = await run(() => api.patchIssue(issue.id, { version: issue.version, changes: { assignee: v.assignee } }));
    } else {
      const payload = action === 'REJECT' ? { ...v, duplicateOf: v.reason === 'DUPLICATE' ? v.duplicateOf?.trim() : null } : v;
      ok = await run(() => api.transition(issue.id, { version: issue.version, action, payload } as TransitionInput));
    }
    if (ok) {
      form.resetFields();
      onClose();
    }
  };

  const required = { required: true, whitespace: true, message: '필수 입력입니다.' };

  return (
    <Modal open={!!action} title={action ? MODAL_TITLE[action] : ''} onCancel={onClose} onOk={submit} confirmLoading={pending}
      okText="확인" cancelText="취소" destroyOnClose>
      <Form form={form} layout="vertical" preserve={false}
        initialValues={action === 'REASSIGN' ? { assignee: issue.assignee } : undefined}>
        {(action === 'ASSIGN' || action === 'REASSIGN') && (
          <Form.Item name="assignee" label="담당자" rules={[{ required: true, message: '담당자를 선택하세요.' }]}
            extra={action === 'REASSIGN' && issue.status === 'IN_PROGRESS' ? '조치중 이슈의 담당자를 바꾸면 상태가 접수로 돌아갑니다.' : undefined}>
            <Select showSearch optionFilterProp="label" options={developers} />
          </Form.Item>
        )}
        {action === 'REJECT' && (
          <>
            <Form.Item name="reason" label="반려 사유" rules={[{ required: true, message: '반려 사유를 선택하세요.' }]}>
              <Select options={options(REJECT_REASON)} />
            </Form.Item>
            {reason === 'DUPLICATE' && (
              <Form.Item name="duplicateOf" label="원본 이슈 ID" rules={[required]}>
                <Input placeholder="예: UT-0007" />
              </Form.Item>
            )}
            <Form.Item name="comment" label="의견" rules={[required, { max: 1000 }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
          </>
        )}
        {(action === 'APPEAL' || action === 'REOPEN') && (
          <Form.Item name="comment" label={action === 'APPEAL' ? '이의 사유' : '재오픈 사유'} rules={[required, { max: 1000 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        )}
        {action === 'FORCE' && (
          <>
            <Form.Item name="to" label="변경할 상태" rules={[{ required: true, message: '상태를 선택하세요.' }]}>
              <Select options={options(STATUS).filter((o) => o.value !== issue.status)} />
            </Form.Item>
            <Form.Item name="comment" label="변경 사유" rules={[required, { max: 1000 }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}

export function IssueDetail() {
  const { id = '' } = useParams();
  const { userName } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const { run, pending, onError } = useIssueMutation(id);
  const [tab, setTab] = useState('basic');
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [showRetestForm, setShowRetestForm] = useState(false);

  const { data: issue, isLoading, error } = useQuery({ queryKey: ['issue', id], queryFn: () => api.issue(id) });
  const { data: latest } = useQuery({
    queryKey: ['issue-check', id],
    queryFn: () => api.issue(id),
    refetchInterval: 30_000,
    enabled: !!issue,
  });
  const changedByOther = !!issue && !!latest && latest.updatedAt > issue.updatedAt;

  if (isLoading) return <Spin />;
  if (error || !issue) {
    return <Result status="404" title={error instanceof ApiError ? error.message : '이슈를 불러오지 못했습니다.'}
      extra={<Link to="/issues">이슈 목록으로</Link>} />;
  }

  const can = (a: string) => issue.availableActions.includes(a);
  const transition = (action: 'START' | 'RESOLVE') => run(() => api.transition(issue.id, { version: issue.version, action, payload: {} }));

  const onResolve = () => {
    if (!hasUnverifiedResolution(issue)) {
      message.info('조치 내역을 먼저 등록하세요.');
      setTab('resolution');
      setShowResolutionForm(true);
      return;
    }
    transition('RESOLVE');
  };

  const onDelete = () => modal.confirm({
    title: `${issue.id} 이슈를 삭제할까요?`,
    content: '삭제한 이슈는 목록과 통계에서 제외됩니다.',
    okText: '삭제',
    okButtonProps: { danger: true },
    cancelText: '취소',
    onOk: async () => {
      try {
        await api.deleteIssue(issue.id);
        queryClient.invalidateQueries({ queryKey: ['issues'] });
        message.success('삭제했습니다.');
        navigate('/issues');
      } catch (err) {
        onError(err);
      }
    },
  });

  const buttons = [
    can('ASSIGN') && <Button key="assign" type="primary" onClick={() => setModalAction('ASSIGN')}>담당자 지정</Button>,
    can('START') && <Button key="start" type="primary" loading={pending} onClick={() => transition('START')}>착수</Button>,
    can('ADD_RESOLUTION') && (
      <Button key="res" onClick={() => { setTab('resolution'); setShowResolutionForm(true); }}>조치 등록</Button>
    ),
    can('RESOLVE') && <Button key="resolve" type="primary" loading={pending} onClick={onResolve}>조치완료</Button>,
    can('RETEST') && <Button key="retest" type="primary" onClick={() => { setTab('retest'); setShowRetestForm(true); }}>재테스트</Button>,
    can('APPEAL') && <Button key="appeal" onClick={() => setModalAction('APPEAL')}>이의 제기</Button>,
    can('REJECT') && <Button key="reject" danger onClick={() => setModalAction('REJECT')}>반려</Button>,
    can('REOPEN') && <Button key="reopen" danger onClick={() => setModalAction('REOPEN')}>재오픈</Button>,
    can('REASSIGN') && <Button key="reassign" onClick={() => setModalAction('REASSIGN')}>담당자 재지정</Button>,
    can('EDIT') && <Button key="edit" onClick={() => navigate(`/issues/${issue.id}/edit`)}>수정</Button>,
    can('FORCE') && <Button key="force" onClick={() => setModalAction('FORCE')}>강제 변경</Button>,
    can('DELETE') && <Button key="delete" danger type="text" onClick={onDelete}>삭제</Button>,
  ].filter(Boolean);

  const visibleComments = issue.comments.filter((c) => !c.deleted).length;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 1200, margin: '0 auto', display: 'flex' }}>
      {changedByOther && (
        <Alert type="warning" showIcon message="다른 사용자가 이 이슈를 수정했습니다."
          action={<Button size="small" onClick={() => queryClient.setQueryData(['issue', id], latest)}>새로고침</Button>} />
      )}
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap align="center">
            <Typography.Title level={4} style={{ margin: 0 }}>{issue.id}</Typography.Title>
            <StatusTag status={issue.status} />
            <SeverityTag severity={issue.severity} />
            <Typography.Title level={4} style={{ margin: 0, fontWeight: 500 }}>{issue.title}</Typography.Title>
          </Space>
          <Space wrap split="|" style={{ color: '#666' }}>
            <span>담당자: {userName(issue.assignee)}</span>
            <span>발견자: {userName(issue.reporter)}</span>
            <span>발견일: {issue.foundDate}</span>
            <span>기한: {issue.dueDate}</span>
            <span>재오픈: {issue.reopenCount}회</span>
            {issue.closedAt && <span>종료: {issue.closedAt.slice(0, 10)}</span>}
          </Space>
          {buttons.length > 0 && <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>{buttons}</Space>}
        </Space>
      </Card>

      <Card size="small">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'basic', label: '기본정보', children: <BasicTab issue={issue} /> },
            {
              key: 'resolution',
              label: `조치 (${issue.resolutions.length})`,
              children: <ResolutionTab issue={issue} showForm={showResolutionForm} setShowForm={setShowResolutionForm} />,
            },
            {
              key: 'retest',
              label: `재테스트 (${issue.retests.length})`,
              children: <RetestTab issue={issue} showForm={showRetestForm} setShowForm={setShowRetestForm} />,
            },
            { key: 'timeline', label: `이력/코멘트 (${visibleComments})`, children: <TimelineTab issue={issue} /> },
          ]}
        />
      </Card>
      <ActionModal issue={issue} action={modalAction} onClose={() => setModalAction(null)} />
    </Space>
  );
}
