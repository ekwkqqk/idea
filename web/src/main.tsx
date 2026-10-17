import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, Result, Spin } from 'antd';
import koKR from 'antd/locale/ko_KR';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { AppProvider } from './store/user';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { IssueList } from './pages/IssueList';
import { IssueForm } from './pages/IssueForm';
import { IssueDetail } from './pages/IssueDetail';
import { ImportPage } from './pages/Import';
import { Settings } from './pages/Settings';
import { TestCaseList } from './pages/TestCaseList';
import { TestCaseImport } from './pages/TestCaseImport';

dayjs.locale('ko');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const loading = (
  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
    <Spin size="large" />
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={koKR}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppProvider fallback={loading}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/issues" element={<IssueList />} />
                  <Route path="/issues/new" element={<IssueForm />} />
                  <Route path="/issues/:id/edit" element={<IssueForm />} />
                  <Route path="/issues/:id" element={<IssueDetail />} />
                  <Route path="/testcases" element={<TestCaseList />} />
                  <Route path="/testcases/import" element={<TestCaseImport />} />
                  <Route path="/import" element={<ImportPage />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Result status="404" title="페이지를 찾을 수 없습니다." />} />
                </Route>
              </Routes>
            </AppProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
