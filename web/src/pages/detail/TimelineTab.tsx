import { App, Button, Input, Popconfirm, Space, Switch, Timeline, Typography } from 'antd';
import { CommentOutlined, HistoryOutlined } from '@ant-design/icons';
import { useState } from 'react';
import type { Comment, History, IssueDetail } from '@shared/types';
import { api } from '../../api';
import { useApp } from '../../store/user';
import { describeHistory } from '../../components/labels';
import { useIssueMutation } from './useIssueMutation';

type Entry = { kind: 'comment'; at: string; comment: Comment } | { kind: 'history'; at: string; history: History };

const time = (iso: string) => iso.slice(0, 16).replace('T', ' ');

export function TimelineTab({ issue }: { issue: IssueDetail }) {
  const { currentUser, userName, moduleName } = useApp();
  const { modal } = App.useApp();
  const { run, pending } = useIssueMutation(issue.id);
  const [body, setBody] = useState('');
  const [commentsOnly, setCommentsOnly] = useState(false);

  const entries: Entry[] = [
    ...issue.comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, comment: c })),
    ...(commentsOnly ? [] : issue.history.map((h) => ({ kind: 'history' as const, at: h.at, history: h }))),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind === b.kind ? 0 : a.kind === 'history' ? -1 : 1));

  const submit = async () => {
    if (!body.trim()) return;
    if (await run(() => api.addComment(issue.id, body.trim()))) setBody('');
  };

  const edit = (c: Comment) => {
    let next = c.body;
    modal.confirm({
      title: '코멘트 수정',
      icon: null,
      content: <Input.TextArea defaultValue={c.body} rows={4} maxLength={2000} onChange={(e) => { next = e.target.value; }} />,
      okText: '저장',
      cancelText: '취소',
      onOk: () => (next.trim() ? run(() => api.editComment(issue.id, c.id, next.trim())) : undefined),
    });
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space>
        <Switch checked={commentsOnly} onChange={setCommentsOnly} size="small" />
        <span>코멘트만 보기</span>
      </Space>
      <Timeline
        items={entries.map((e) => {
          if (e.kind === 'history') {
            return {
              color: 'gray',
              dot: <HistoryOutlined />,
              children: (
                <Typography.Text type="secondary">
                  {time(e.at)} &nbsp; {userName(e.history.user)} &nbsp; {describeHistory(e.history, userName, moduleName)}
                </Typography.Text>
              ),
            };
          }
          const c = e.comment;
          return {
            color: 'blue',
            dot: <CommentOutlined />,
            children: (
              <div>
                <Space>
                  <b>{userName(c.author)}</b>
                  <Typography.Text type="secondary">{time(c.createdAt)}{c.updatedAt !== c.createdAt && !c.deleted ? ' (수정됨)' : ''}</Typography.Text>
                  {!c.deleted && c.author === currentUser?.id && (
                    <>
                      <Button type="link" size="small" onClick={() => edit(c)}>수정</Button>
                      <Popconfirm title="코멘트를 삭제할까요?" onConfirm={() => run(() => api.deleteComment(issue.id, c.id))}>
                        <Button type="link" size="small" danger>삭제</Button>
                      </Popconfirm>
                    </>
                  )}
                </Space>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {c.deleted ? <Typography.Text type="secondary" italic>삭제된 코멘트입니다.</Typography.Text> : c.body}
                </div>
              </div>
            ),
          };
        })}
      />
      <Space.Compact style={{ width: '100%' }}>
        <Input.TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} placeholder="코멘트 입력"
          onPressEnter={(e) => { if (e.ctrlKey) submit(); }} />
      </Space.Compact>
      <Button type="primary" loading={pending} disabled={!body.trim() || !currentUser} onClick={submit}>코멘트 등록 (Ctrl+Enter)</Button>
    </Space>
  );
}
