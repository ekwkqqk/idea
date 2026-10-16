import { Button, Image, List, Popconfirm, Space, Typography, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import type { Attachment, IssueDetail } from '@shared/types';
import { api } from '../../api';
import { useApp } from '../../store/user';

const formatSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);

interface Props {
  issue: IssueDetail;
  attachments: Attachment[];
  canAdd: boolean;
  onUpload?: (files: File[]) => void;
  onDelete: (a: Attachment) => void;
}

export function Attachments({ issue, attachments, canAdd, onUpload, onDelete }: Props) {
  const { currentUser, userName } = useApp();
  const canDelete = (a: Attachment) =>
    currentUser?.role === 'MANAGER' || a.uploadedBy === currentUser?.id || issue.availableActions.includes('EDIT');
  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const others = attachments.filter((a) => !a.mimeType.startsWith('image/'));

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {images.length > 0 && (
        <Image.PreviewGroup>
          <Space wrap>
            {images.map((a) => (
              <div key={a.id} style={{ textAlign: 'center' }}>
                <Image src={api.attachmentUrl(a.id, true)} width={120} height={90} style={{ objectFit: 'cover', border: '1px solid #eee' }} />
                <div style={{ maxWidth: 120, fontSize: 12 }}>
                  <Typography.Text ellipsis title={a.fileName}>{a.fileName}</Typography.Text>
                  {canDelete(a) && (
                    <Popconfirm title="첨부를 삭제할까요?" onConfirm={() => onDelete(a)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </div>
              </div>
            ))}
          </Space>
        </Image.PreviewGroup>
      )}
      {others.length > 0 && (
        <List size="small" dataSource={others} renderItem={(a) => (
          <List.Item actions={[
            <Button key="dl" type="text" icon={<DownloadOutlined />} onClick={() => api.downloadAttachment(a.id, a.fileName)} />,
            ...(canDelete(a) ? [(
              <Popconfirm key="del" title="첨부를 삭제할까요?" onConfirm={() => onDelete(a)}>
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )] : []),
          ]}>
            <Space>
              <PaperClipOutlined />
              {a.fileName}
              <Typography.Text type="secondary">({formatSize(a.size)}, {userName(a.uploadedBy)})</Typography.Text>
            </Space>
          </List.Item>
        )} />
      )}
      {attachments.length === 0 && <Typography.Text type="secondary">첨부파일 없음</Typography.Text>}
      {canAdd && onUpload && (
        <Upload multiple showUploadList={false} beforeUpload={(_file, list) => {
          if (_file === list[list.length - 1]) onUpload(list.slice(0, 5));
          return false;
        }}>
          <Button size="small" icon={<UploadOutlined />}>파일 첨부</Button>
        </Upload>
      )}
    </Space>
  );
}
