import { App, Button, Card, Col, DatePicker, Form, Input, List, Radio, Row, Select, Space, Spin, Typography, Upload } from 'antd';
import { DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { ENVIRONMENT, ISSUE_TYPE, PRIORITY, SEVERITY, SEVERITY_GUIDE, TEST_TYPE, type Severity } from '@shared/codes';
import { addDays, today } from '@shared/dates';
import { ASSIGNEE_CHANGE_STATUSES } from '@shared/transitions';
import type { Issue } from '@shared/types';
import { api } from '../api';
import { ApiError } from '../api/client';
import { useApp } from '../store/user';
import { options } from '../components/tags';
import { useApiError } from '../components/useApiError';

const DRAFT_KEY = 'tims.issueDraft';
const DATE_FIELDS = ['foundDate', 'dueDate'] as const;
const EDITABLE = [
  'testRound', 'issueType', 'module', 'programId', 'testCaseId', 'title', 'steps', 'expected', 'actual',
  'environment', 'severity', 'priority', 'reporter', 'foundDate', 'dueDate', 'assignee',
] as const;

type FormValues = Record<string, any>;

const formatSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);

function toFormValues(issue: Issue): FormValues {
  return { ...issue, foundDate: dayjs(issue.foundDate), dueDate: dayjs(issue.dueDate) };
}

function toPayload(values: FormValues) {
  const out: Record<string, unknown> = { ...values };
  DATE_FIELDS.forEach((k) => { out[k] = values[k] ? (values[k] as Dayjs).format('YYYY-MM-DD') : null; });
  ['programId', 'testCaseId'].forEach((k) => { out[k] = (out[k] as string | undefined) ?? ''; });
  if (out.testRound === undefined) out.testRound = null;
  if (out.assignee === undefined) out.assignee = null;
  return out;
}

export function IssueForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const { config, currentUser, isManager, userName } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const onError = useApiError(() => window.location.reload());
  const draftAsked = useRef(false);

  const { data: issue, isLoading } = useQuery({ queryKey: ['issue', id], queryFn: () => api.issue(id!), enabled: isEdit });

  const testType = Form.useWatch('testType', form);
  const severity = Form.useWatch('severity', form);
  const foundDate = Form.useWatch('foundDate', form);
  const dueDate = Form.useWatch('dueDate', form);
  const moduleCode = Form.useWatch('module', form);

  useEffect(() => {
    if (issue) {
      if (!issue.availableActions.includes('EDIT')) {
        message.warning('이 이슈를 수정할 권한이 없습니다.');
        navigate(`/issues/${issue.id}`, { replace: true });
        return;
      }
      form.setFieldsValue(toFormValues(issue));
    }
  }, [issue, form, navigate, message]);

  // 등록 화면 임시 저장 복원
  useEffect(() => {
    if (isEdit || draftAsked.current) return;
    draftAsked.current = true;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    modal.confirm({
      title: '작성 중이던 내용이 있습니다',
      content: '이전에 작성하던 이슈 내용을 불러올까요?',
      okText: '불러오기',
      cancelText: '새로 작성',
      onOk: () => {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        DATE_FIELDS.forEach((k) => { saved[k] = saved[k] ? dayjs(saved[k] as string) : undefined; });
        form.setFieldsValue(saved);
        setDirty(true);
      },
      onCancel: () => localStorage.removeItem(DRAFT_KEY),
    });
  }, [isEdit, form, modal]);

  useEffect(() => {
    if (isEdit) return;
    const timer = setInterval(() => {
      if (!form.isFieldsTouched()) return;
      const values = form.getFieldsValue();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(toPayload(values)));
    }, 5000);
    return () => clearInterval(timer);
  }, [isEdit, form]);

  // 클립보드 이미지 붙여넣기
  useEffect(() => {
    if (isEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith('image/'));
      if (!items.length) return;
      const stamp = dayjs().format('YYYYMMDDHHmmss');
      const pasted = items.map((item, idx) => {
        const blob = item.getAsFile()!;
        return new File([blob], `paste-${stamp}${idx ? `-${idx}` : ''}.png`, { type: blob.type });
      });
      setFiles((prev) => [...prev, ...pasted].slice(0, 5));
      setDirty(true);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isEdit]);

  if (isEdit && (isLoading || !issue)) return <Spin />;

  const developers = config.users.filter((u) => u.active && (u.role === 'DEVELOPER' || u.role === 'MANAGER'));
  const assigneeEditable = isManager && (!isEdit || (issue && ASSIGNEE_CHANGE_STATUSES.includes(issue.status)));
  const autoDue = foundDate && severity ? addDays(foundDate.format('YYYY-MM-DD'), config.settings.dueDays[severity as Severity]) : null;
  const moduleManager = config.modules.find((m) => m.code === moduleCode)?.managerId;

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(values);
      if (isEdit && issue) {
        const changes = Object.fromEntries(
          EDITABLE.filter((k) => payload[k] !== undefined && payload[k] !== issue[k]).map((k) => [k, payload[k]]),
        );
        if (!assigneeEditable) delete changes.assignee;
        if (changes.dueDate === null) delete changes.dueDate;
        if (Object.keys(changes).length === 0) {
          navigate(`/issues/${issue.id}`);
          return;
        }
        await api.patchIssue(issue.id, { version: issue.version, changes });
        await queryClient.invalidateQueries({ queryKey: ['issue', issue.id] });
        message.success('수정했습니다.');
        navigate(`/issues/${issue.id}`);
      } else {
        const created = await api.createIssue(payload);
        localStorage.removeItem(DRAFT_KEY);
        if (files.length) {
          try {
            await api.uploadAttachments(created.id, files);
          } catch (err) {
            message.warning(`이슈는 등록되었지만 첨부 업로드에 실패했습니다. 상세 화면에서 다시 첨부하세요. (${err instanceof ApiError ? err.message : '오류'})`, 6);
          }
        }
        message.success(`${created.id} 이슈를 등록했습니다.`);
        navigate(`/issues/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.details.length) {
        form.setFields(err.details.filter((d) => d.field).map((d) => ({ name: d.field!.replace(/^changes\./, ''), errors: [d.message] })));
      }
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (!dirty) return navigate(-1);
    modal.confirm({
      title: '작성 중인 내용이 사라집니다',
      content: '저장하지 않고 나갈까요?',
      okText: '나가기',
      cancelText: '계속 작성',
      onOk: () => {
        if (!isEdit) localStorage.removeItem(DRAFT_KEY);
        navigate(-1);
      },
    });
  };

  const required = [{ required: true, whitespace: true, message: '필수 입력입니다.' }];

  return (
    <Card title={isEdit ? `이슈 수정 - ${issue!.id}` : '이슈 등록'} style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Form
        form={form}
        layout="vertical"
        onValuesChange={() => setDirty(true)}
        initialValues={{
          testType: 'UT', issueType: 'DEFECT', environment: 'TEST', priority: 'MEDIUM',
          reporter: currentUser?.id, foundDate: dayjs(today()),
        }}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="testType" label="테스트구분" rules={[{ required: true }]}>
              <Radio.Group disabled={isEdit} options={options(TEST_TYPE)} optionType="button" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="testRound" label="테스트 차수">
              <Select allowClear disabled={testType !== 'IT'} options={config.project.testRounds.map((r) => ({ value: r, label: r }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="issueType" label="이슈유형" rules={[{ required: true }]}>
              <Select options={options(ISSUE_TYPE)} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="module" label="업무/모듈" rules={[{ required: true, message: '필수 입력입니다.' }]}
              extra={moduleManager ? `모듈 담당 PL: ${userName(moduleManager)}` : undefined}>
              <Select showSearch optionFilterProp="label"
                options={config.modules.filter((m) => m.active || m.code === issue?.module).map((m) => ({ value: m.code, label: m.name }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="programId" label="화면/프로그램 ID" rules={[{ max: 50 }]}>
              <Input placeholder="예: SCR-ORD-001" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="testCaseId" label="테스트케이스 ID" rules={[{ max: 50 }]}>
              <Input placeholder="예: TC-UT-ORD-012" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="title" label="제목" rules={[...required, { max: 200 }]}>
          <Input placeholder="이슈를 한 줄로 요약" />
        </Form.Item>
        <Form.Item name="steps" label="재현 절차" rules={[...required, { max: 4000 }]}>
          <Input.TextArea rows={5} placeholder={'1. 화면 진입\n2. 값 입력\n3. 버튼 클릭'} showCount maxLength={4000} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="expected" label="기대 결과" rules={[...required, { max: 2000 }]}>
              <Input.TextArea rows={4} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="actual" label="실제 결과" rules={[...required, { max: 2000 }]}>
              <Input.TextArea rows={4} placeholder="오류 메시지 포함" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="environment" label="테스트 환경" rules={[{ required: true }]}>
              <Select options={options(ENVIRONMENT)} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="severity" label="심각도" rules={[{ required: true, message: '필수 입력입니다.' }]}
              extra={severity ? SEVERITY_GUIDE[severity as Severity] : undefined}>
              <Select options={options(SEVERITY)} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="priority" label="우선순위" rules={[{ required: true }]}>
              <Select options={options(PRIORITY)} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="reporter" label="발견자" rules={[{ required: true, message: '필수 입력입니다.' }]}>
              <Select showSearch optionFilterProp="label"
                options={config.users.filter((u) => u.active || u.id === issue?.reporter).map((u) => ({ value: u.id, label: u.name }))} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="foundDate" label="발견일" rules={[{ required: true, message: '필수 입력입니다.' }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="assignee" label="담당자"
              extra={!assigneeEditable ? (isManager ? '신규 이슈는 상세 화면의 [담당자 지정]을 사용하세요.' : 'PL/PM이 지정합니다.') : undefined}>
              <Select allowClear={!isEdit} showSearch optionFilterProp="label" disabled={!assigneeEditable}
                options={developers.map((u) => ({ value: u.id, label: u.name }))} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="dueDate" label="조치 기한"
              extra={!dueDate && autoDue ? `비워 두면 ${autoDue} (자동)` : undefined}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => !!foundDate && d.isBefore(foundDate, 'day')} />
            </Form.Item>
          </Col>
        </Row>

        {!isEdit && (
          <Form.Item label="첨부파일" extra="최대 5개, 파일당 10MB. 스크린샷은 화면 어디서나 Ctrl+V로 붙여넣을 수 있습니다.">
            <Upload.Dragger
              multiple
              showUploadList={false}
              beforeUpload={(file) => {
                setFiles((prev) => [...prev, file].slice(0, 5));
                setDirty(true);
                return false;
              }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>클릭하거나 파일을 이 영역에 끌어놓으세요</p>
            </Upload.Dragger>
            {files.length > 0 && (
              <List size="small" dataSource={files} renderItem={(f, idx) => (
                <List.Item actions={[<Button key="del" type="text" icon={<DeleteOutlined />} onClick={() => setFiles(files.filter((_, i) => i !== idx))} />]}>
                  {f.name} <Typography.Text type="secondary">({formatSize(f.size)})</Typography.Text>
                </List.Item>
              )} />
            )}
          </Form.Item>
        )}

        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={cancel}>취소</Button>
          <Button type="primary" loading={saving} onClick={submit}>저장</Button>
        </Space>
      </Form>
    </Card>
  );
}
