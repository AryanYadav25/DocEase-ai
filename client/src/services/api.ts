import { request, requestPaginated, requestSse, uploadFiles } from '@/lib/api';
import type {
  AiStatus,
  ChatResult,
  Conversation,
  DashboardData,
  DocumentItem,
  DocumentPage,
  ExplanationLevel,
  Message,
  OutputLength,
  StudyMaterial,
  Summary,
  UploadPolicy,
  User,
  UserPreferences,
} from '@/types';

export interface ListDocumentsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'name' | 'uploaded' | 'lastOpened';
  order?: 'asc' | 'desc';
  fileKind?: string;
  status?: string;
  favorite?: boolean;
  trashed?: boolean;
  tag?: string;
}

export const documentsApi = {
  uploadPolicy: () => request<UploadPolicy>('/documents/upload-policy'),
  list: (params: ListDocumentsParams) => requestPaginated<DocumentItem>('/documents', params as Record<string, string | number | boolean | undefined>),
  get: (id: string) => request<{ document: DocumentItem }>(`/documents/${id}`),
  status: (id: string) => request<DocumentItem & { queue: { running: number; pending: number } }>(`/documents/${id}/status`),
  update: (id: string, body: Partial<Pick<DocumentItem, 'title' | 'description' | 'tags' | 'isFavorite' | 'lastViewedPage'>>) => request<{ document: DocumentItem }>(`/documents/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<{ document: DocumentItem; message: string }>(`/documents/${id}`, { method: 'DELETE' }),
  restore: (id: string) => request<{ document: DocumentItem }>(`/documents/${id}/restore`, { method: 'POST' }),
  permanentDelete: (id: string) => request<{ deleted: boolean }>(`/documents/${id}/permanent`, { method: 'DELETE' }),
  bulk: (ids: string[], action: string, tag?: string) => request<{ results: Array<{ id: string; ok: boolean; error?: string }> }>('/documents/bulk', { method: 'POST', body: { ids, action, tag } }),
  reprocess: (id: string) => request<{ document: DocumentItem }>(`/documents/${id}/reprocess`, { method: 'POST' }),
  upload: (files: File[], onProgress: (pct: number) => void, signal?: AbortSignal) =>
    uploadFiles<{ results: Array<{ ok: true; document: DocumentItem; duplicateOf?: string } | { ok: false; filename: string; error: { code: string; message: string } }> }>('/documents', files, onProgress, signal),
  extractedText: (id: string) => request<{ documentId: string; pageCount: number; pages: DocumentPage[]; extractedTextMeta: DocumentItem['extractedTextMeta'] }>(`/documents/${id}/extracted-text`),
  page: (id: string, n: number) => request<{ page: DocumentPage }>(`/documents/${id}/pages/${n}`),
  updatePageText: (id: string, n: number, text: string) => request<{ page: DocumentPage; document: DocumentItem }>(`/documents/${id}/pages/${n}/text`, { method: 'PATCH', body: { text } }),
  retryPageOcr: (id: string, n: number, opts: { rotate?: number; enhance?: boolean; grayscale?: boolean }) =>
    request<{ result: { pageNumber: number; ok: boolean; confidence?: number; error?: string }; page: DocumentPage | null; document: DocumentItem }>(`/documents/${id}/pages/${n}/retry-ocr`, { method: 'POST', body: opts }),
  runOcr: (id: string, opts: { pages?: number[]; rotate?: number; enhance?: boolean; grayscale?: boolean }) =>
    request<{ results: Array<{ pageNumber: number; ok: boolean; confidence?: number; error?: string }>; document: DocumentItem }>(`/documents/${id}/ocr`, { method: 'POST', body: opts }),
};

export const aiApi = {
  status: () => request<AiStatus>('/ai/status'),
  simplify: (id: string, body: { explanationLevel?: ExplanationLevel; outputLength?: OutputLength; force?: boolean }) => request<{ summary: Summary; cached: boolean }>(`/documents/${id}/simplify`, { method: 'POST', body }),
  summarize: (id: string, body: { summaryType: string; explanationLevel?: ExplanationLevel; outputLength?: OutputLength; force?: boolean }) => request<{ summary: Summary; cached: boolean }>(`/documents/${id}/summarize`, { method: 'POST', body }),
  extractInformation: (id: string, force?: boolean) => request<{ summary: Summary; cached: boolean }>(`/documents/${id}/extract-information`, { method: 'POST', body: { force } }),
  vocabulary: (id: string, force?: boolean) => request<{ summary: Summary; cached: boolean }>(`/documents/${id}/vocabulary`, { method: 'POST', body: { force } }),
  explainSelection: (id: string, body: { text: string; action: string; question?: string; targetLanguage?: string; pageNumber?: number; explanationLevel?: ExplanationLevel }) =>
    request<{ answer: string; notes: string[]; modelMeta: Summary['modelMeta']; scope: 'selection' }>(`/documents/${id}/explain-selection`, { method: 'POST', body }),
  translate: (id: string, body: { targetLanguage: string; scope: 'text' | 'summary'; text?: string; summaryId?: string; pageNumber?: number }) => request<{ summary: Summary }>(`/documents/${id}/translate`, { method: 'POST', body }),
  flashcards: (id: string, body: { count: number; explanationLevel?: ExplanationLevel }) => request<{ material: StudyMaterial }>(`/documents/${id}/flashcards`, { method: 'POST', body }),
  quiz: (id: string, body: { count: number; mixShortAnswer: boolean; explanationLevel?: ExplanationLevel }) => request<{ material: StudyMaterial }>(`/documents/${id}/quiz`, { method: 'POST', body }),
  revisionNotes: (id: string) => request<{ material: StudyMaterial }>(`/documents/${id}/revision-notes`, { method: 'POST', body: {} }),
  chat: (id: string, body: { conversationId?: string; message: string; regenerateMessageId?: string }) => request<ChatResult>(`/documents/${id}/chat`, { method: 'POST', body }),
  chatStream: (id: string, body: { conversationId?: string; message: string; regenerateMessageId?: string }, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal) =>
    requestSse(`/documents/${id}/chat`, body, { onEvent }, signal),
  suggestedQuestions: (id: string) => request<{ questions: string[] }>(`/documents/${id}/suggested-questions`),
  summaries: (id: string) => request<{ summaries: Summary[] }>(`/documents/${id}/summaries`),
  deleteSummary: (id: string) => request<{ deleted: boolean }>(`/summaries/${id}`, { method: 'DELETE' }),
  studyMaterials: (id: string) => request<{ materials: StudyMaterial[] }>(`/documents/${id}/study-materials`),
  conversations: (id: string) => request<{ conversations: Conversation[] }>(`/documents/${id}/conversations`),
  createConversation: (id: string) => request<{ conversation: Conversation }>(`/documents/${id}/conversations`, { method: 'POST' }),
  conversation: (id: string) => request<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`),
  deleteConversation: (id: string) => request<{ deleted: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
  clearConversation: (id: string) => request<{ conversation: Conversation }>(`/conversations/${id}/clear`, { method: 'POST' }),
  messageFeedback: (messageId: string, feedback: 'up' | 'down' | null) => request<{ message: Message }>(`/conversations/messages/${messageId}/feedback`, { method: 'PATCH', body: { feedback } }),
};

export const studyApi = {
  listAll: () => request<{ materials: StudyMaterial[] }>('/study-materials'),
  get: (id: string) => request<{ material: StudyMaterial }>(`/study-materials/${id}`),
  updateProgress: (id: string, progress: Record<string, unknown>) => request<{ material: StudyMaterial }>(`/study-materials/${id}/progress`, { method: 'PATCH', body: { progress } }),
  remove: (id: string) => request<{ deleted: boolean }>(`/study-materials/${id}`, { method: 'DELETE' }),
};

export const usersApi = {
  dashboard: () => request<DashboardData>('/users/me/dashboard'),
  update: (body: { displayName?: string; preferences?: Partial<UserPreferences> }) => request<{ user: User }>('/users/me', { method: 'PATCH', body }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ changed: boolean; message: string }>('/users/me/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  deleteAccount: (password: string) => request<{ deleted: boolean }>('/users/me', { method: 'DELETE', body: { password, confirmation: 'DELETE MY ACCOUNT' } }),
  feedback: (body: { category: string; rating?: number; comments: string; documentId?: string }) => request<{ id: string }>('/feedback', { method: 'POST', body }),
};
