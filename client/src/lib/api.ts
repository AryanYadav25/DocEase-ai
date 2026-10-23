/**
 * Thin fetch wrapper for the DocuEase API.
 * - Sends the session cookie (credentials: include)
 * - Adds the X-Requested-With header the server requires as CSRF protection
 * - Normalises errors into ApiError and emits a global "session expired" event
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
export const API_BASE = `${BASE}/api/v1`;

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string;
  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export const SESSION_EXPIRED_EVENT = 'docuease:session-expired';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function parseError(res: Response): Promise<ApiError> {
  let payload: { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | null = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  const code = payload?.error?.code ?? (res.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR');
  const message = payload?.error?.message ?? (res.status >= 500 ? 'The server had a problem. Please try again.' : `Request failed (${res.status}).`);
  return new ApiError(res.status, code, message, payload?.error?.details, payload?.error?.requestId);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'DocuEase', Accept: 'application/json', ...options.headers };
  let body: BodyInit | undefined;
  if (options.formData) body = options.formData;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: options.method ?? 'GET', headers, body, credentials: 'include', signal: options.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and that the API is running.');
  }
  if (!res.ok) {
    const error = await parseError(res);
    if (error.status === 401 && error.code === 'SESSION_EXPIRED') window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    throw error;
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as { data: T };
  return json.data;
}

/** Returns data + pagination for list endpoints. */
export async function requestPaginated<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<{ data: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${API_BASE}${path}?${qs.toString()}`, { headers: { 'X-Requested-With': 'DocuEase', Accept: 'application/json' }, credentials: 'include' });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** Upload with progress + cancellation (XHR, because fetch has no upload progress). */
export function uploadFiles<T>(path: string, files: File[], onProgress: (pct: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    xhr.open('POST', `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'DocuEase');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json.data as T);
        else reject(new ApiError(xhr.status, json?.error?.code ?? 'UPLOAD_FAILED', json?.error?.message ?? 'Upload failed.', json?.error?.details));
      } catch {
        reject(new ApiError(xhr.status, 'UPLOAD_FAILED', 'Upload failed.'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Upload failed: the server could not be reached.'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload cancelled.'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Server-sent events POST (used by chat streaming). */
export async function requestSse(
  path: string,
  body: unknown,
  handlers: { onEvent: (event: string, data: unknown) => void },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'DocuEase', 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw await parseError(res);
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError(0, 'STREAM_ERROR', 'The server did not return a stream.');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        handlers.onEvent(event, JSON.parse(data));
      } catch {
        /* ignore */
      }
    }
  }
}

export function downloadUrl(documentId: string, inline = false) {
  return `${API_BASE}/documents/${documentId}/download${inline ? '?inline=true' : ''}`;
}
