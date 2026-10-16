import { Button, Layout as AntLayout, Menu, Modal, Select, Space, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE } from '@shared/codes';
import { useApp } from '../store/user';

const { Header, Content } = AntLayout;

function UserSelect({ width = 200 }: { width?: number }) {
  const { config, currentUser, setCurrentUser } = useApp();
  return (
    <Select
      showSearch
      optionFilterProp="label"
      placeholder="사용자 선택"
      style={{ width }}
      value={currentUser?.id}
      onChange={setCurrentUser}
      options={config.users.filter((u) => u.active).map((u) => ({ value: u.id, label: `${u.name}(${ROLE[u.role]})` }))}
    />
  );
}

export function Layout() {
  const { config, currentUser, isManager } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const items = [
    { key: '/', label: <Link to="/">대시보드</Link> },
    { key: '/issues', label: <Link to="/issues">이슈 목록</Link> },
    ...(isManager ? [{ key: '/import', label: <Link to="/import">가져오기</Link> }] : []),
    { key: '/settings', label: <Link to="/settings">설정</Link> },
  ];
  const selected = items
    .map((i) => i.key)
    .filter((k) => (k === '/' ? location.pathname === '/' : location.pathname.startsWith(k)))
    .slice(-1);

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#001529', paddingInline: 24 }}>
        <Link to="/" style={{ color: '#fff', fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap' }}>TIMS</Link>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap' }}>{config.project.name}</Typography.Text>
        <Menu theme="dark" mode="horizontal" selectedKeys={selected} items={items} style={{ flex: 1, minWidth: 0 }} />
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/issues/new')}>이슈 등록</Button>
          <span style={{ color: 'rgba(255,255,255,0.75)' }}>사용자</span>
          <UserSelect />
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
      <Modal
        open={!currentUser}
        title="사용자 선택"
        closable={false}
        footer={null}
        maskClosable={false}
      >
        <p>이 시스템은 로그인 대신 사용자를 선택해서 사용합니다. 본인 이름을 선택하세요.</p>
        <UserSelect width={300} />
      </Modal>
    </AntLayout>
  );
}
