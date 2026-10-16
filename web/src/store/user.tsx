import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Config, User } from '@shared/types';
import { api } from '../api';
import { userStorage } from '../api/client';

interface AppContextValue {
  config: Config;
  currentUser: User | undefined;
  setCurrentUser: (id: string) => void;
  userName: (id: string | null | undefined) => string;
  moduleName: (code: string | null | undefined) => string;
  isManager: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 60_000 });
  const [userId, setUserId] = useState(userStorage.get());

  const setCurrentUser = useCallback((id: string) => {
    userStorage.set(id);
    setUserId(id);
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'config' });
  }, [queryClient]);

  const value = useMemo<AppContextValue | null>(() => {
    if (!config) return null;
    const currentUser = config.users.find((u) => u.id === userId && u.active);
    return {
      config,
      currentUser,
      setCurrentUser,
      userName: (id) => (id ? config.users.find((u) => u.id === id)?.name ?? id : '-'),
      moduleName: (code) => (code ? config.modules.find((m) => m.code === code)?.name ?? code : '-'),
      isManager: currentUser?.role === 'MANAGER',
    };
  }, [config, userId, setCurrentUser]);

  if (!value) return <>{fallback}</>;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppProvider가 필요합니다.');
  return ctx;
}
