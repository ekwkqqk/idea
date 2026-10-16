import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { IssueDetail } from '@shared/types';
import { useApiError } from '../../components/useApiError';

/** 이슈 변경 API 호출 후 상세 캐시를 응답으로 교체한다 */
export function useIssueMutation(id: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['issue', id] });
  }, [queryClient, id]);
  const onError = useApiError(refresh);

  const run = useCallback(async (call: () => Promise<IssueDetail>): Promise<boolean> => {
    setPending(true);
    try {
      const updated = await call();
      queryClient.setQueryData(['issue', id], updated);
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      return true;
    } catch (err) {
      onError(err);
      return false;
    } finally {
      setPending(false);
    }
  }, [queryClient, id, onError]);

  return { run, pending, refresh, onError };
}
