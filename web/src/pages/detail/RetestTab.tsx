import { App, Button, Card, DatePicker, Empty, Form, Input, Radio, Space, Tag, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import type { IssueDetail } from '@shared/types';
import { api } from '../../api';
import { useApp } from '../../store/user';
import { Attachments } from './Attachments';
import { useIssueMutation } from './useIssueMutation';

interface Props {
  issue: IssueDetail;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
}

export function RetestTab({ issue, showForm, setShowForm }: Props) {
  const { userName, currentUser } = useApp();
  const { message } = App.useApp();
  const { run, pending } = useIssueMutation(issue.id);
  const [form] = Form.useForm();
  const [files, setFiles] = useState<File[]>([]);
  const result = Form.useWatch('result', form);
  const canRetest = issue.availableActions.includes('RETEST');

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    let created: IssueDetail | undefined;
    const ok = await run(async () => {
      created = await api.addRetest(issue.id, {
        version: issue.version,
        result: values.result,
        comment: values.comment ?? '',
        testedDate: (values.testedDate as Dayjs).format('YYYY-MM-DD'),
      });
      return created;
    });
    if (!ok || !created) return;
    if (files.length) {
      const seq = created.retests.at(-1)!.seq;
      const uploaded = await run(() => api.uploadAttachments(issue.id, files, seq));
      if (!uploaded) message.warning('재테스트는 등록되었지만 첨부 업로드에 실패했습니다.');
    }
    message.success(values.result === 'PASS' ? '재테스트 Pass: 이슈를 종료했습니다.' : '재테스트 Fail: 이슈가 재오픈되었습니다.');
    form.resetFields();
    setFiles([]);
    setShowForm(false);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {canRetest && !showForm && <Button type="primary" onClick={() => setShowForm(true)}>재테스트 결과 등록</Button>}
      {canRetest && showForm && (
        <Card size="small" title={`재테스트 등록 (${issue.resolutions.at(-1)?.seq ?? 0}차 조치 확인)`}>
          <Form form={form} layout="vertical" initialValues={{ testedDate: dayjs() }}>
            <Form.Item name="result" label="결과" rules={[{ required: true, message: '결과를 선택하세요.' }]}>
              <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'PASS', label: 'Pass' }, { value: 'FAIL', label: 'Fail' }]} />
            </Form.Item>
            <Form.Item name="comment" label="확인 의견"
              rules={[{ required: result === 'FAIL', whitespace: true, message: 'Fail이면 확인 의견을 입력하세요.' }, { max: 2000 }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="testedDate" label="확인일" rules={[{ required: true, message: '필수 입력입니다.' }]}>
              <DatePicker disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(issue.foundDate), 'day')} />
            </Form.Item>
            <Form.Item label="첨부">
              <Upload multiple beforeUpload={(f) => { setFiles((p) => [...p, f].slice(0, 5)); return false; }}
                fileList={files.map((f, i) => ({ uid: String(i), name: f.name, status: 'done' as const }))}
                onRemove={(f) => setFiles(files.filter((_, i) => String(i) !== f.uid))}>
                <Button size="small" icon={<UploadOutlined />}>파일 선택</Button>
              </Upload>
            </Form.Item>
            <Space>
              <Button onClick={() => setShowForm(false)}>취소</Button>
              <Button type="primary" loading={pending} onClick={submit}>등록</Button>
            </Space>
          </Form>
        </Card>
      )}
      {issue.retests.length === 0 && !showForm && <Empty description="재테스트 내역이 없습니다." />}
      {[...issue.retests].reverse().map((r) => (
        <Card key={r.seq} size="small"
          title={<Space>{`${r.seq}차 재테스트`}<Tag color={r.result === 'PASS' ? 'green' : 'red'}>{r.result === 'PASS' ? 'Pass' : 'Fail'}</Tag><Typography.Text type="secondary">({r.resolutionSeq}차 조치 확인)</Typography.Text></Space>}
          extra={<Typography.Text type="secondary">{userName(r.tester)} / {r.testedDate}</Typography.Text>}>
          {r.comment && <div style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{r.comment}</div>}
          <Attachments
            issue={issue}
            attachments={r.attachments}
            canAdd={r.tester === currentUser?.id || currentUser?.role === 'MANAGER'}
            onUpload={(fs) => run(() => api.uploadAttachments(issue.id, fs, r.seq))}
            onDelete={(a) => run(() => api.deleteAttachment(issue.id, a.id))}
          />
        </Card>
      ))}
    </Space>
  );
}
