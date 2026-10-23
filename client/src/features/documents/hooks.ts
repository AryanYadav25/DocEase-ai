import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { isProcessing } from '@/lib/utils';
import { documentsApi, type ListDocumentsParams } from '@/services/api';
import type { DocumentItem } from '@/types';

export function useDocumentList(params: ListDocumentsParams) {
  return useQuery({
    queryKey: ['documents', params],
    queryFn: () => documentsApi.list(params),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.data.some((d) => isProcessing(d.processingStatus)) ? 3000 : false),
  });
}

/** Loads a document and polls its status while it is processing. */
export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: () => documentsApi.get(id!).then((r) => r.document),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && isProcessing(q.state.data.processingStatus) ? 2000 : false),
  });
}

export function useDocumentMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const onError = (err: unknown) => toast.error('Action failed', err instanceof ApiError ? err.message : 'Please try again.');

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof documentsApi.update>[1] }) => documentsApi.update(id, body),
    onSuccess: (data) => {
      qc.setQueryData(['document', data.document.id], data.document);
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: (data) => {
      toast.success('Moved to trash', data.message);
      invalidate();
    },
    onError,
  });
  const restore = useMutation({
    mutationFn: (id: string) => documentsApi.restore(id),
    onSuccess: () => {
      toast.success('Document restored');
      invalidate();
    },
    onError,
  });
  const permanentDelete = useMutation({
    mutationFn: (id: string) => documentsApi.permanentDelete(id),
    onSuccess: () => {
      toast.success('Permanently deleted');
      invalidate();
    },
    onError,
  });
  const bulk = useMutation({
    mutationFn: ({ ids, action, tag }: { ids: string[]; action: string; tag?: string }) => documentsApi.bulk(ids, action, tag),
    onSuccess: (data, vars) => {
      const failed = data.results.filter((r) => !r.ok).length;
      toast[failed ? 'error' : 'success'](failed ? `${failed} of ${vars.ids.length} failed` : `${vars.ids.length} document${vars.ids.length > 1 ? 's' : ''} updated`);
      invalidate();
    },
    onError,
  });
  const reprocess = useMutation({
    mutationFn: (id: string) => documentsApi.reprocess(id),
    onSuccess: (data) => {
      qc.setQueryData(['document', data.document.id], data.document);
      toast.info('Reprocessing started');
      invalidate();
    },
    onError,
  });
  return { update, remove, restore, permanentDelete, bulk, reprocess };
}

export function patchDocumentCache(qc: ReturnType<typeof useQueryClient>, doc: DocumentItem) {
  qc.setQueryData(['document', doc.id], doc);
}
