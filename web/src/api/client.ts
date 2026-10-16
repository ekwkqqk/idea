import type { ApiErrorBody } from '@shared/types';

const USER_KEY = 'tims.userId';

export const userStorage = {
  get: () => localStorage.getItem(USER_KEY),
  set: (id: string) => localStorage.setItem(USER_KEY, id),
  clear: () => localStorage.removeItem(USER_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: { field?: string; message: string }[] = [],
  ) {
    super(message);
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const userId = userStorage.get();
  return { ...(userId ? { 'X-User-Id': userId } : {}), ...extra };
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
  let body: ApiErrorBody | undefined;
  try {
    body = await res.json();
  } catch {
    // 서버가 JSON이 아닌 오류를 보낸 경우
  }
  throw new ApiError(
    res.status,
    body?.error.code ?? 'INTERNAL_ERROR',
    body?.error.message ?? `요청 처리 중 오류가 발생했습니다. (HTTP ${res.status})`,
    body?.error.details ?? [],
  );
}

export function toQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const http = {
  get: <T>(url: string) => fetch(url, { headers: headers() }).then((r) => handle<T>(r)),
  send: <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
    fetch(url, {
      method,
      headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  upload: <T>(url: string, form: FormData) =>
    fetch(url, { method: 'POST', headers: headers(), body: form }).then((r) => handle<T>(r)),
  async download(url: string, fallbackName: string) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) await handle(res);
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const name = match ? decodeURIComponent(match[1]) : fallbackName;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};
