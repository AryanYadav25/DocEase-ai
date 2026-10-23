/**
 * Shared API shape reference. The server (server/src/models/*.ts, validators/*.ts) and the
 * client (client/src/types/index.ts) each keep their own typed copies; this file documents
 * the contract in one place for readers of the repository.
 */
export interface ApiSuccess<T> { success: true; data: T; pagination?: { page: number; pageSize: number; total: number; totalPages: number } }
export interface ApiFailure { success: false; error: { code: string; message: string; requestId: string; details?: unknown } }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
