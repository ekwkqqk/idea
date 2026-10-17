import { App, Button, Card, Radio, Result, Space, Statistic, Switch, Table, Tag, Typography, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { ImportPreview } from '@shared/types';
import { api, type ImportResult } from '../api';
import { ApiError } from '../api/client';
import { useApp } from '../store/user';
import { useApiError } from '../components/useApiError';

interface ImportTarget {
  downloadTemplate: () => Promise<void>;
  preview: (file: File) => Promise<ImportPreview>;
  commit: (importId: string, onExisting: 'SKIP' | 'OVERWRITE') => Promise<ImportResult>;
  invalidate: string[];
  idLabel: string;
  existingLabel: string;
  templateHint: string;
  listLabel: string;
  listPath: string;
}

const ISSUE_IMPORT: ImportTarget = {
  downloadTemplate: api.downloadTemplate,
  preview: api.importPreview,
  commit: api.importCommit,
  invalidate: ['issues', 'stats', 'testcases'],
  idLabel: '이슈ID',
  existingLabel: '기존 이슈',
  templateHint: '기존 결함관리대장의 머리글을 양식과 같게 맞추면 열 순서가 달라도 가져올 수 있습니다. 테스트케이스ID는 먼저 등록되어 있어야 합니다.',
  listLabel: '이슈 목록 보기',
  listPath: '/issues?status=ALL',
};

export const TEST_CASE_IMPORT: ImportTarget = {
  downloadTemplate: api.downloadTestCaseTemplate,
  preview: api.testCaseImportPreview,
  commit: api.testCaseImportCommit,
  invalidate: ['testcases'],
  idLabel: '테스트케이스ID',
  existingLabel: '기존 테스트케이스',
  templateHint: '기존 테스트케이스 대장의 머리글을 양식과 같게 맞추면 열 순서가 달라도 가져올 수 있습니다.',
  listLabel: '테스트케이스 목록 보기',
  listPath: '/testcases',
};

export function ImportPage({ target = ISSUE_IMPORT }: { target?: ImportTarget }) {
  const { isManager } = useApp();
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onError = useApiError();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [onExisting, setOnExisting] = useState<'SKIP' | 'OVERWRITE'>('SKIP');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<ImportResult | null>(null);

  if (!isManager) return <Result status="403" title="PL/PM만 사용할 수 있는 화면입니다." />;

  const validate = async () => {
    if (!file) return;
    setLoading(true);
    try {
      setPreview(await target.preview(file));
      setDone(null);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  };

  const commit = () => {
    if (!preview) return;
    const count = preview.summary.ok - (onExisting === 'SKIP' ? preview.summary.existing : 0);
    modal.confirm({
      title: `${count}건을 등록합니다`,
      content: onExisting === 'OVERWRITE' && preview.summary.existing
        ? `${target.existingLabel} ${preview.summary.existing}건은 엑셀 값으로 덮어씁니다.` : undefined,
      okText: '등록',
      cancelText: '취소',
      onOk: async () => {
        try {
          const result = await target.commit(preview.importId, onExisting);
          setDone(result);
          setPreview(null);
          setFile(null);
          target.invalidate.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
        } catch (err) {
          if (err instanceof ApiError && err.code === 'NOT_FOUND') message.error('검증 후 10분이 지났습니다. 다시 검증하세요.');
          else onError(err);
        }
      },
    });
  };

  const rows = preview ? (errorsOnly ? preview.rows.filter((r) => r.status === 'ERROR') : preview.rows) : [];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', display: 'flex' }}>
      <Card size="small" title="1. 양식 다운로드">
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => target.downloadTemplate().catch(onError)}>가져오기 양식 받기</Button>
          <Typography.Text type="secondary">{target.templateHint}</Typography.Text>
        </Space>
      </Card>

      <Card size="small" title="2. 파일 선택">
        <Space>
          <Upload accept=".xlsx" maxCount={1} showUploadList={false}
            beforeUpload={(f) => { setFile(f); setPreview(null); return false; }}>
            <Button icon={<UploadOutlined />}>파일 선택</Button>
          </Upload>
          <span>{file?.name ?? '선택된 파일 없음'}</span>
          <Button type="primary" disabled={!file} loading={loading} onClick={validate}>검증</Button>
        </Space>
      </Card>

      {done && (
        <Result status="success" title="가져오기를 완료했습니다."
          subTitle={`등록 ${done.created}건, 덮어쓰기 ${done.overwritten}건, 건너뛰기 ${done.skipped}건`}
          extra={<Button type="primary" onClick={() => navigate(target.listPath)}>{target.listLabel}</Button>} />
      )}

      {preview && (
        <>
          <Card size="small" title="3. 검증 결과" extra={(
            <Space><Switch size="small" checked={errorsOnly} onChange={setErrorsOnly} /> 오류만 보기</Space>
          )}>
            <Space size="large" style={{ marginBottom: 12 }}>
              <Statistic title="정상" value={preview.summary.ok} valueStyle={{ color: '#52c41a' }} />
              <Statistic title="오류" value={preview.summary.error} valueStyle={{ color: preview.summary.error ? '#cf1322' : undefined }} />
              <Statistic title="기존 ID" value={preview.summary.existing} />
            </Space>
            <Table size="small" rowKey="row" dataSource={rows} pagination={{ pageSize: 50 }}
              columns={[
                { title: '행', dataIndex: 'row', width: 60 },
                { title: '결과', dataIndex: 'status', width: 80, render: (v) => <Tag color={v === 'OK' ? 'green' : 'red'}>{v === 'OK' ? '정상' : '오류'}</Tag> },
                { title: target.idLabel, dataIndex: 'id', width: 140, render: (v, r) => <>{v ?? '(신규)'}{r.exists && <Tag style={{ marginLeft: 4 }}>기존</Tag>}</> },
                { title: '제목', dataIndex: 'title', ellipsis: true },
                { title: '오류 내용', dataIndex: 'errors', render: (v?: string[]) => v?.map((e) => <div key={e} style={{ color: '#cf1322' }}>{e}</div>) },
              ]} />
          </Card>
          <Card size="small" title="4. 등록">
            <Space direction="vertical">
              <Space>
                <span>기존 ID 처리</span>
                <Radio.Group value={onExisting} onChange={(e) => setOnExisting(e.target.value)}
                  options={[{ value: 'SKIP', label: '건너뛰기' }, { value: 'OVERWRITE', label: '덮어쓰기' }]} />
              </Space>
              <Button type="primary" disabled={preview.summary.ok === 0} onClick={commit}>
                정상 행 {preview.summary.ok}건 등록
              </Button>
            </Space>
          </Card>
        </>
      )}
    </Space>
  );
}
