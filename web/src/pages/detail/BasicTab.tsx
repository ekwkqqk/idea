import { Alert, Descriptions, Divider, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { ENVIRONMENT, ISSUE_TYPE, REJECT_REASON, TEST_TYPE } from '@shared/codes';
import type { IssueDetail } from '@shared/types';
import { api } from '../../api';
import { useApp } from '../../store/user';
import { PriorityText, SeverityTag } from '../../components/tags';
import { Attachments } from './Attachments';
import { useIssueMutation } from './useIssueMutation';

const pre = (text: string) => <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;

export function BasicTab({ issue }: { issue: IssueDetail }) {
  const { userName, moduleName } = useApp();
  const { run } = useIssueMutation(issue.id);
  const r = issue.rejection;

  return (
    <>
      {issue.status === 'REJECTED' && r && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`반려: ${REJECT_REASON[r.reason]}`}
          description={(
            <>
              {r.duplicateOf && <div>원본 이슈: <Link to={`/issues/${r.duplicateOf}`}>{r.duplicateOf}</Link></div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{r.comment}</div>
              <Typography.Text type="secondary">{userName(r.rejectedBy)} / {r.rejectedAt.slice(0, 16).replace('T', ' ')}</Typography.Text>
            </>
          )}
        />
      )}
      <Descriptions bordered size="small" column={3} labelStyle={{ width: 130 }}>
        <Descriptions.Item label="테스트구분">{TEST_TYPE[issue.testType]}</Descriptions.Item>
        <Descriptions.Item label="테스트 차수">{issue.testRound ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="이슈유형">{ISSUE_TYPE[issue.issueType]}</Descriptions.Item>
        <Descriptions.Item label="업무/모듈">{moduleName(issue.module)}</Descriptions.Item>
        <Descriptions.Item label="화면/프로그램 ID">{issue.programId || '-'}</Descriptions.Item>
        <Descriptions.Item label="테스트케이스 ID">{issue.testCaseId || '-'}</Descriptions.Item>
        <Descriptions.Item label="심각도"><SeverityTag severity={issue.severity} /></Descriptions.Item>
        <Descriptions.Item label="우선순위"><PriorityText priority={issue.priority} /></Descriptions.Item>
        <Descriptions.Item label="테스트 환경">{ENVIRONMENT[issue.environment]}</Descriptions.Item>
        <Descriptions.Item label="재현 절차" span={3}>{pre(issue.steps)}</Descriptions.Item>
        <Descriptions.Item label="기대 결과" span={3}>{pre(issue.expected)}</Descriptions.Item>
        <Descriptions.Item label="실제 결과" span={3}>{pre(issue.actual)}</Descriptions.Item>
        <Descriptions.Item label="등록">{userName(issue.createdBy)} / {issue.createdAt.slice(0, 16).replace('T', ' ')}</Descriptions.Item>
        <Descriptions.Item label="최종 수정" span={2}>{issue.updatedAt.slice(0, 16).replace('T', ' ')}</Descriptions.Item>
      </Descriptions>
      <Divider orientation="left" plain>첨부파일</Divider>
      <Attachments
        issue={issue}
        attachments={issue.attachments}
        canAdd={issue.availableActions.includes('EDIT')}
        onUpload={(files) => run(() => api.uploadAttachments(issue.id, files))}
        onDelete={(a) => run(() => api.deleteAttachment(issue.id, a.id))}
      />
    </>
  );
}
