import { App } from 'antd';
import { useCallback } from 'react';
import { ApiError } from '../api/client';

/** API 오류를 상세설계서 4.5절 메시지로 표시한다. 409는 새로고침 대화상자로 띄운다 */
export function useApiError(onRefresh?: () => void) {
  const { message, modal } = App.useApp();
  return useCallback((err: unknown) => {
    if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
      modal.confirm({
        title: '수정 충돌',
        content: err.message,
        okText: '새로고침',
        cancelText: '닫기',
        onOk: () => (onRefresh ? onRefresh() : window.location.reload()),
      });
      return;
    }
    if (err instanceof ApiError) {
      const detail = err.details.map((d) => d.message).filter(Boolean);
      message.error(detail.length ? `${err.message} ${[...new Set(detail)].join(' / ')}` : err.message, 5);
      return;
    }
    message.error('서버에 연결할 수 없습니다.');
  }, [message, modal, onRefresh]);
}
