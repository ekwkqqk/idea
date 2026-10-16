import { Button, Card, Col, DatePicker, Descriptions, Empty, Form, Input, Row, Select, Space, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { CAUSE } from '@shared/codes';
import type { IssueDetail } from '@shared/types';
import { api } from '../../api';
import { useApp } from '../../store/user';
import { options } from '../../components/tags';
import { useIssueMutation } from './useIssueMutation';

interface Props {
  issue: IssueDetail;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
}

export function ResolutionTab({ issue, showForm, setShowForm }: Props) {
  const { userName } = useApp();
  const { run, pending } = useIssueMutation(issue.id);
  const [form] = Form.useForm();
  const canAdd = issue.availableActions.includes('ADD_RESOLUTION');

  const submit = async (resolveNow: boolean) => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const ok = await run(() => api.addResolution(issue.id, {
      ...values,
      changedFiles: values.changedFiles ?? '',
      buildVersion: values.buildVersion ?? '',
      resolvedDate: (values.resolvedDate as Dayjs).format('YYYY-MM-DD'),
      version: issue.version,
      resolveNow,
    }));
    if (ok) {
      form.resetFields();
      setShowForm(false);
    }
  };

  const required = [{ required: true, whitespace: true, message: '필수 입력입니다.' }];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {canAdd && !showForm && <Button type="primary" onClick={() => setShowForm(true)}>조치 등록</Button>}
      {canAdd && showForm && (
        <Card size="small" title={`${(issue.resolutions.at(-1)?.seq ?? 0) + 1}차 조치 등록`}>
          <Form form={form} layout="vertical" initialValues={{ resolvedDate: dayjs() }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="cause" label="원인 분류" rules={[{ required: true, message: '필수 입력입니다.' }]}>
                  <Select options={options(CAUSE)} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="resolvedDate" label="조치일" rules={[{ required: true, message: '필수 입력입니다.' }]}>
                  <DatePicker style={{ width: '100%' }}
                    disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(issue.foundDate), 'day')} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="buildVersion" label="반영 버전" rules={[{ max: 50 }]}>
                  <Input placeholder="커밋 ID, 빌드 번호, 배포 일자" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="causeDetail" label="원인 상세" rules={[...required, { max: 2000 }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="action" label="조치 내용" rules={[...required, { max: 4000 }]}>
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item name="changedFiles" label="수정 대상" rules={[{ max: 1000 }]} extra="수정한 소스 파일, 설정, 테이블. 여러 개는 줄바꿈으로 구분">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Space>
              <Button onClick={() => setShowForm(false)}>취소</Button>
              <Button loading={pending} onClick={() => submit(false)}>조치 등록</Button>
              <Button type="primary" loading={pending} onClick={() => submit(true)}>조치 등록 후 완료 처리</Button>
            </Space>
          </Form>
        </Card>
      )}
      {issue.resolutions.length === 0 && !showForm && <Empty description="조치 내역이 없습니다." />}
      {[...issue.resolutions].reverse().map((r) => (
        <Card key={r.seq} size="small" title={`${r.seq}차 조치`}
          extra={<Typography.Text type="secondary">{userName(r.resolver)} / {r.resolvedDate}</Typography.Text>}>
          <Descriptions size="small" column={2} bordered labelStyle={{ width: 110 }}>
            <Descriptions.Item label="원인 분류">{CAUSE[r.cause]}</Descriptions.Item>
            <Descriptions.Item label="반영 버전">{r.buildVersion || '-'}</Descriptions.Item>
            <Descriptions.Item label="원인 상세" span={2}><div style={{ whiteSpace: 'pre-wrap' }}>{r.causeDetail}</div></Descriptions.Item>
            <Descriptions.Item label="조치 내용" span={2}><div style={{ whiteSpace: 'pre-wrap' }}>{r.action}</div></Descriptions.Item>
            <Descriptions.Item label="수정 대상" span={2}><div style={{ whiteSpace: 'pre-wrap' }}>{r.changedFiles || '-'}</div></Descriptions.Item>
          </Descriptions>
        </Card>
      ))}
    </Space>
  );
}
