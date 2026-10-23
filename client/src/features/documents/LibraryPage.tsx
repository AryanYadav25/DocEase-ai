import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileText, Grid2X2, Image as ImageIcon, Info, LayoutList, MoreHorizontal, Pencil, RotateCcw, Search, Star, StarOff, Tag, Trash2, Undo2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Alert, Badge, Card, Dropdown, DropdownItem, DropdownSeparator, EmptyState, Modal, PageHeader, Skeleton } from '@/components/ui/primitives';
import { downloadUrl } from '@/lib/api';
import { cn, fileKindLabel, formatBytes, formatDate, formatRelative, isReady } from '@/lib/utils';
import type { DocumentItem } from '@/types';
import { StatusBadge } from './DocumentStatus';
import { UploadDialog } from './UploadDialog';
import { useDocumentList, useDocumentMutations } from './hooks';

type Mode = 'all' | 'favorites' | 'trash';
const VIEW_KEY = 'docuease:library-view';

export function LibraryPage({ mode }: { mode: Mode }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as 'list' | 'grid') || 'list';
    } catch {
      return 'list';
    }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentItem | null>(null);
  const [details, setDetails] = useState<DocumentItem | null>(null);
  const [confirmPermanent, setConfirmPermanent] = useState<DocumentItem | 'bulk' | null>(null);
  const [bulkTag, setBulkTag] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');

  const query = useMemo(
    () => ({
      page: Number(params.get('page') ?? 1),
      pageSize: 12,
      search: params.get('search') ?? undefined,
      sort: (params.get('sort') as 'name' | 'uploaded' | 'lastOpened') ?? 'uploaded',
      order: (params.get('order') as 'asc' | 'desc') ?? 'desc',
      fileKind: params.get('kind') ?? undefined,
      status: params.get('status') ?? undefined,
      favorite: mode === 'favorites' ? true : undefined,
      trashed: mode === 'trash',
      tag: params.get('tag') ?? undefined,
    }),
    [params, mode],
  );
  const { data, isLoading, isError, error, refetch } = useDocumentList(query);
  const m = useDocumentMutations();

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);
  useEffect(() => setSelected(new Set()), [mode, data?.pagination.page]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('search') ?? '') !== searchInput) setParam({ search: searchInput || undefined, page: undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function setParam(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === undefined || v === '' ? next.delete(k) : next.set(k, v);
    setParams(next, { replace: true });
  }

  const items = data?.data ?? [];
  const allSelected = items.length > 0 && items.every((d) => selected.has(d.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((d) => d.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const titles: Record<Mode, [string, string]> = {
    all: ['My documents', 'Everything you have uploaded.'],
    favorites: ['Favorites', 'Documents you marked with a star.'],
    trash: ['Trash', `Deleted documents are kept for 30 days, then removed permanently along with their extracted text and AI results.`],
  };

  const runBulk = (action: string, tag?: string) => {
    m.bulk.mutate({ ids: [...selected], action, tag });
    setSelected(new Set());
  };

  return (
    <div>
      <PageHeader
        title={titles[mode][0]}
        description={titles[mode][1]}
        actions={
          mode !== 'trash' && (
            <Button onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-4 w-4" />}>
              Upload
            </Button>
          )
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="min-w-56 flex-1" placeholder="Search by title, file name, description or tag" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} leftIcon={<Search className="h-4 w-4" />} aria-label="Search documents" />
        <Select aria-label="File type" value={params.get('kind') ?? ''} onChange={(e) => setParam({ kind: e.target.value || undefined, page: undefined })} options={[{ value: '', label: 'All types' }, { value: 'pdf', label: 'PDF' }, { value: 'image', label: 'Images' }, { value: 'docx', label: 'Word' }, { value: 'text', label: 'Text' }]} className="w-36" />
        <Select aria-label="Processing status" value={params.get('status') ?? ''} onChange={(e) => setParam({ status: e.target.value || undefined, page: undefined })} options={[{ value: '', label: 'Any status' }, { value: 'completed', label: 'Ready' }, { value: 'completed_with_warnings', label: 'Ready with warnings' }, { value: 'processing', label: 'Processing' }, { value: 'ocr_in_progress', label: 'Running OCR' }, { value: 'queued', label: 'Queued' }, { value: 'failed', label: 'Failed' }]} className="w-44" />
        <Select aria-label="Sort by" value={`${query.sort}:${query.order}`} onChange={(e) => { const [sort, order] = e.target.value.split(':'); setParam({ sort, order }); }} options={[{ value: 'uploaded:desc', label: 'Newest first' }, { value: 'uploaded:asc', label: 'Oldest first' }, { value: 'name:asc', label: 'Name A–Z' }, { value: 'name:desc', label: 'Name Z–A' }, { value: 'lastOpened:desc', label: 'Recently opened' }]} className="w-40" />
        <div className="ml-auto flex rounded-md border border-line p-0.5" role="group" aria-label="View">
          <button onClick={() => setView('list')} aria-pressed={view === 'list'} className={cn('rounded p-1.5', view === 'list' ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:text-ink')} aria-label="List view"><LayoutList className="h-4 w-4" /></button>
          <button onClick={() => setView('grid')} aria-pressed={view === 'grid'} className={cn('rounded p-1.5', view === 'grid' ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:text-ink')} aria-label="Grid view"><Grid2X2 className="h-4 w-4" /></button>
        </div>
      </div>
      {params.get('tag') && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Filtered by tag</span>
          <Badge tone="accent">{params.get('tag')}</Badge>
          <button onClick={() => setParam({ tag: undefined })} className="text-ink-muted hover:text-ink" aria-label="Clear tag filter"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="animate-fade-in mt-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm">
          <span className="font-medium text-accent-ink">{selected.size} selected</span>
          {mode === 'trash' ? (
            <>
              <Button size="sm" variant="outline" onClick={() => runBulk('restore')} leftIcon={<Undo2 className="h-3.5 w-3.5" />}>Restore</Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmPermanent('bulk')} leftIcon={<Trash2 className="h-3.5 w-3.5" />}>Delete permanently</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => runBulk('favorite')} leftIcon={<Star className="h-3.5 w-3.5" />}>Favorite</Button>
              <Button size="sm" variant="outline" onClick={() => runBulk('unfavorite')} leftIcon={<StarOff className="h-3.5 w-3.5" />}>Unfavorite</Button>
              <Button size="sm" variant="outline" onClick={() => setBulkTag('')} leftIcon={<Tag className="h-3.5 w-3.5" />}>Add tag</Button>
              <Button size="sm" variant="outline" onClick={() => runBulk('delete')} leftIcon={<Trash2 className="h-3.5 w-3.5" />}>Move to trash</Button>
            </>
          )}
          <button className="ml-auto text-ink-muted hover:text-ink" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Content */}
      <div className="mt-4">
        {isError ? (
          <Alert tone="danger" title="Could not load documents" action={<Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>}>{(error as Error).message}</Alert>
        ) : isLoading ? (
          <div className="grid gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title={query.search || query.fileKind || query.status ? 'Nothing matches these filters' : mode === 'trash' ? 'Trash is empty' : mode === 'favorites' ? 'No favorites yet' : 'No documents yet'}
            description={query.search || query.fileKind || query.status ? 'Try a different search or clear the filters.' : mode === 'trash' ? 'Deleted documents will appear here for 30 days.' : mode === 'favorites' ? 'Star a document in your library to find it here quickly.' : 'Upload a PDF, scan, photo or text file to get started.'}
            action={mode === 'all' && !query.search && !query.fileKind && !query.status ? <Button onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-4 w-4" />}>Upload a document</Button> : (query.search || query.fileKind || query.status) ? <Button variant="outline" onClick={() => { setSearchInput(''); setParams(new URLSearchParams(), { replace: true }); }}>Clear filters</Button> : undefined}
          />
        ) : view === 'list' ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised text-left text-xs text-ink-muted">
                <tr>
                  <th className="w-10 px-3 py-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
                  <th className="px-3 py-2 font-medium">Document</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Status</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Pages</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Size</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">{mode === 'trash' ? 'Deleted' : query.sort === 'lastOpened' ? 'Opened' : 'Uploaded'}</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((d) => (
                  <tr key={d.id} className={cn('hover:bg-surface-raised', selected.has(d.id) && 'bg-accent-soft/50')}>
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.title}`} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <KindIcon kind={d.fileKind} />
                        <div className="min-w-0">
                          {mode === 'trash' ? <span className="block truncate font-medium">{d.title}</span> : <Link to={`/app/workspace/${d.id}`} className="block truncate font-medium hover:text-accent">{d.title}</Link>}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                            <span>{fileKindLabel(d.fileKind)}</span>
                            {d.isFavorite && <Star className="h-3 w-3 fill-warning text-warning" aria-label="Favorite" />}
                            {d.tags.slice(0, 3).map((t) => <button key={t} onClick={() => setParam({ tag: t })} className="rounded bg-line/70 px-1.5 text-[11px] hover:bg-line">{t}</button>)}
                            <span className="md:hidden"><StatusBadge status={d.processingStatus} progress={d.processingProgress} /></span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell"><StatusBadge status={d.processingStatus} progress={d.processingProgress} /></td>
                    <td className="hidden px-3 py-2 tabular-nums text-ink-soft lg:table-cell">{d.pageCount || '—'}</td>
                    <td className="hidden px-3 py-2 tabular-nums text-ink-soft lg:table-cell">{formatBytes(d.fileSize)}</td>
                    <td className="hidden px-3 py-2 text-ink-soft sm:table-cell">{mode === 'trash' ? formatRelative(d.deletedAt) : query.sort === 'lastOpened' ? formatRelative(d.lastOpenedAt) : formatDate(d.createdAt)}</td>
                    <td className="px-2 py-2">
                      <RowMenu doc={d} mode={mode} onEdit={() => setEditing(d)} onDetails={() => setDetails(d)} onPermanent={() => setConfirmPermanent(d)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((d) => (
              <Card key={d.id} className={cn('flex flex-col p-4', selected.has(d.id) && 'ring-2 ring-accent/40')}>
                <div className="flex items-start justify-between gap-2">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.title}`} className="mt-1" />
                  <RowMenu doc={d} mode={mode} onEdit={() => setEditing(d)} onDetails={() => setDetails(d)} onPermanent={() => setConfirmPermanent(d)} />
                </div>
                <button onClick={() => mode !== 'trash' && navigate(`/app/workspace/${d.id}`)} className="mt-2 flex items-center justify-center rounded-md bg-surface-raised py-8 text-ink-muted hover:text-accent" aria-label={`Open ${d.title}`}>
                  <KindIcon kind={d.fileKind} large />
                </button>
                <h3 className="mt-3 truncate font-medium">{d.title}</h3>
                <p className="mt-0.5 text-xs text-ink-muted">{fileKindLabel(d.fileKind)} · {d.pageCount || '?'} pages · {formatBytes(d.fileSize)}</p>
                <div className="mt-3 flex items-center justify-between">
                  <StatusBadge status={d.processingStatus} progress={d.processingProgress} />
                  {d.isFavorite && <Star className="h-4 w-4 fill-warning text-warning" />}
                </div>
              </Card>
            ))}
          </div>
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <span>{data.pagination.total} documents · page {data.pagination.page} of {data.pagination.totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={data.pagination.page <= 1} onClick={() => setParam({ page: String(data.pagination.page - 1) })}>Previous</Button>
              <Button size="sm" variant="outline" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setParam({ page: String(data.pagination.page + 1) })}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      {editing && <EditDocumentModal doc={editing} onClose={() => setEditing(null)} />}
      {details && <DetailsModal doc={details} onClose={() => setDetails(null)} />}
      <Modal
        open={!!confirmPermanent}
        onClose={() => setConfirmPermanent(null)}
        title="Delete permanently?"
        description={confirmPermanent === 'bulk' ? `${selected.size || 'The selected'} documents, their extracted text, summaries, chats and study materials will be removed. This cannot be undone.` : confirmPermanent ? `"${confirmPermanent.title}" and everything generated from it will be removed. This cannot be undone.` : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPermanent(null)}>Keep</Button>
            <Button variant="danger" loading={m.permanentDelete.isPending || m.bulk.isPending} onClick={() => { if (confirmPermanent === 'bulk') runBulk('permanent_delete'); else if (confirmPermanent) m.permanentDelete.mutate(confirmPermanent.id); setConfirmPermanent(null); }}>Delete permanently</Button>
          </>
        }
      />
      <Modal open={bulkTag !== null} onClose={() => setBulkTag(null)} title="Add a tag" size="sm" footer={<><Button variant="ghost" onClick={() => setBulkTag(null)}>Cancel</Button><Button disabled={!bulkTag?.trim()} onClick={() => { runBulk('add_tag', bulkTag!.trim()); setBulkTag(null); }}>Add tag</Button></>}>
        <Input label="Tag" value={bulkTag ?? ''} onChange={(e) => setBulkTag(e.target.value)} placeholder="e.g. semester-2" maxLength={50} />
      </Modal>
    </div>
  );
}

function KindIcon({ kind, large }: { kind: string; large?: boolean }) {
  const cls = large ? 'h-10 w-10' : 'h-5 w-5 text-ink-muted';
  return kind === 'image' ? <ImageIcon className={cls} /> : <FileText className={cls} />;
}

function RowMenu({ doc, mode, onEdit, onDetails, onPermanent }: { doc: DocumentItem; mode: Mode; onEdit: () => void; onDetails: () => void; onPermanent: () => void }) {
  const m = useDocumentMutations();
  const navigate = useNavigate();
  return (
    <Dropdown trigger={<Button variant="ghost" size="icon" aria-label={`Actions for ${doc.title}`}><MoreHorizontal className="h-4 w-4" /></Button>}>
      {mode === 'trash' ? (
        <>
          <DropdownItem icon={<Undo2 className="h-4 w-4" />} onClick={() => m.restore.mutate(doc.id)}>Restore</DropdownItem>
          <DropdownItem icon={<Download className="h-4 w-4" />} onClick={() => window.open(downloadUrl(doc.id), '_blank')}>Download original</DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onClick={onPermanent}>Delete permanently</DropdownItem>
        </>
      ) : (
        <>
          <DropdownItem icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/app/workspace/${doc.id}`)}>Open in workspace</DropdownItem>
          <DropdownItem icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>Rename, describe, tag</DropdownItem>
          <DropdownItem icon={doc.isFavorite ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />} onClick={() => m.update.mutate({ id: doc.id, body: { isFavorite: !doc.isFavorite } })}>{doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</DropdownItem>
          <DropdownItem icon={<Info className="h-4 w-4" />} onClick={onDetails}>Processing details</DropdownItem>
          <DropdownItem icon={<Download className="h-4 w-4" />} onClick={() => window.open(downloadUrl(doc.id), '_blank')}>Download original</DropdownItem>
          {(doc.processingStatus === 'failed' || isReady(doc.processingStatus)) && <DropdownItem icon={<RotateCcw className="h-4 w-4" />} onClick={() => m.reprocess.mutate(doc.id)}>Reprocess</DropdownItem>}
          <DropdownSeparator />
          <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onClick={() => m.remove.mutate(doc.id)}>Move to trash</DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

export function EditDocumentModal({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const m = useDocumentMutations();
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description);
  const [tags, setTags] = useState(doc.tags.join(', '));
  const save = () => {
    m.update.mutate(
      { id: doc.id, body: { title: title.trim() || doc.title, description: description.trim(), tags: tags.split(',').map((t) => t.trim()).filter(Boolean) } },
      { onSuccess: onClose },
    );
  };
  return (
    <Modal open onClose={onClose} title="Edit document" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={m.update.isPending}>Save changes</Button></>}>
      <div className="grid gap-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What is this document?" />
        <Input label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} hint="Separate tags with commas." />
      </div>
    </Modal>
  );
}

function DetailsModal({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const meta = doc.extractedTextMeta;
  return (
    <Modal open onClose={onClose} title="Processing details" description={doc.originalFilename}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-muted">Status</dt><dd><StatusBadge status={doc.processingStatus} progress={doc.processingProgress} /></dd>
        <dt className="text-ink-muted">Stage</dt><dd>{doc.processingStage || '—'}</dd>
        <dt className="text-ink-muted">Pages</dt><dd>{doc.pageCount}</dd>
        <dt className="text-ink-muted">Text-layer pages</dt><dd>{meta.textPages}</dd>
        <dt className="text-ink-muted">OCR pages</dt><dd>{meta.ocrPages}</dd>
        <dt className="text-ink-muted">Empty pages</dt><dd>{meta.emptyPages}</dd>
        <dt className="text-ink-muted">Characters extracted</dt><dd className="tabular-nums">{meta.totalChars.toLocaleString()}</dd>
        <dt className="text-ink-muted">Search chunks</dt><dd>{meta.chunkCount}</dd>
        <dt className="text-ink-muted">OCR status</dt><dd>{doc.ocrStatus.replace('_', ' ')}</dd>
        <dt className="text-ink-muted">MIME type</dt><dd className="truncate">{doc.mimeType}</dd>
      </dl>
      {doc.processingError && <Alert tone="danger" className="mt-4" title="Processing failed">{doc.processingError}</Alert>}
      {doc.processingWarnings.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">Warnings</p>
          <ul className="mt-1 space-y-1 text-sm text-ink-soft">
            {doc.processingWarnings.map((w, i) => <li key={i}>{w.pageNumber ? `Page ${w.pageNumber}: ` : ''}{w.message}</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}

