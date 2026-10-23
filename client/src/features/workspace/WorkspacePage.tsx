import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, FileText, GraduationCap, ListChecks, MessageSquareText, PanelLeft, RotateCcw, Sparkles, Star, Text } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, Progress, Skeleton, Tabs } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/AuthContext';
import { WorkspaceContext, type WorkspaceContextValue } from '@/features/ai-panels/common';
import { ChatPanel } from '@/features/ai-panels/ChatPanel';
import { ExtractedTextPanel } from '@/features/ai-panels/ExtractedTextPanel';
import { KeyInfoPanel } from '@/features/ai-panels/KeyInfoPanel';
import { OverviewPanel } from '@/features/ai-panels/OverviewPanel';
import { SelectionResultPanel, SelectionToolbar, type Selection, type SelectionAction } from '@/features/ai-panels/SelectionTools';
import { StudyPanel } from '@/features/ai-panels/StudyPanel';
import { SummaryPanel } from '@/features/ai-panels/SummaryPanel';
import { StatusBadge } from '@/features/documents/DocumentStatus';
import { useDocument, useDocumentList, useDocumentMutations } from '@/features/documents/hooks';
import { ImageViewer } from '@/features/image-reader/ImageViewer';
import { PdfViewer, type ViewerHandle } from '@/features/pdf-viewer/PdfViewer';
import { Thumbnails } from '@/features/pdf-viewer/Thumbnails';
import type { PDFDocumentProxy } from '@/features/pdf-viewer/pdfjs';
import { cn, isProcessing, isReady, STATUS_LABELS } from '@/lib/utils';
import { aiApi, documentsApi } from '@/services/api';
import { TextDocumentViewer } from './TextDocumentViewer';

type Tab = 'overview' | 'summary' | 'chat' | 'keyinfo' | 'study' | 'text';
const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'summary', label: 'Summary', icon: <FileText className="h-3.5 w-3.5" /> },
  { id: 'chat', label: 'Chat', icon: <MessageSquareText className="h-3.5 w-3.5" /> },
  { id: 'keyinfo', label: 'Key info', icon: <ListChecks className="h-3.5 w-3.5" /> },
  { id: 'study', label: 'Study', icon: <GraduationCap className="h-3.5 w-3.5" /> },
  { id: 'text', label: 'Text', icon: <Text className="h-3.5 w-3.5" /> },
];

export function WorkspacePage() {
  const { id } = useParams();
  if (!id) return <DocumentPicker />;
  return <Workspace key={id} id={id} />;
}

function DocumentPicker() {
  const { data, isLoading } = useDocumentList({ pageSize: 50, sort: 'lastOpened', order: 'desc' });
  const docs = data?.data ?? [];
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold">AI workspace</h1>
      <p className="mt-1 text-sm text-ink-muted">Pick a document to read, question and study.</p>
      {isLoading ? (
        <div className="mt-6 grid gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : docs.length === 0 ? (
        <EmptyState className="mt-6" icon={<FileText className="h-8 w-8" />} title="No documents yet" description="Upload something from the library first." action={<Link to="/app/documents"><Button>Go to my documents</Button></Link>} />
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {docs.map((d) => (
            <li key={d.id}>
              <Link to={`/app/workspace/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised">
                <FileText className="h-5 w-5 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.title}</span>
                  <span className="text-xs text-ink-muted">{d.pageCount || '?'} pages{d.lastOpenedAt ? ` · last opened ${new Date(d.lastOpenedAt).toLocaleDateString()}` : ''}</span>
                </span>
                {d.isFavorite && <Star className="h-4 w-4 fill-warning text-warning" />}
                <StatusBadge status={d.processingStatus} progress={d.processingProgress} />
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const RIGHT_KEY = 'docuease:workspace-right-width';

function Workspace({ id }: { id: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const { data: doc, isLoading, isError, error } = useDocument(id);
  const { data: ai } = useQuery({ queryKey: ['ai-status'], queryFn: aiApi.status, staleTime: 60_000 });
  const m = useDocumentMutations();
  const viewerRef = useRef<ViewerHandle>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileView, setMobileView] = useState<'document' | 'ai'>('document');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightWidth, setRightWidth] = useState(() => { try { return Number(localStorage.getItem(RIGHT_KEY)) || 470; } catch { return 470; } });
  const [currentPage, setCurrentPage] = useState(1);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionAction, setSelectionAction] = useState<{ selection: Selection; action: SelectionAction } | null>(null);
  const [centerRect, setCenterRect] = useState<DOMRect | null>(null);
  const initialPageRef = useRef<number | null>(null);
  const lastSavedPage = useRef<number | null>(null);

  // Pages for non-PDF viewers / image reader.
  const pagesQuery = useQuery({ queryKey: ['extracted-text', id], queryFn: () => documentsApi.extractedText(id), enabled: !!doc && isReady(doc.processingStatus) });

  useEffect(() => {
    if (doc && initialPageRef.current === null) {
      const fromQuery = Number(searchParams.get('page'));
      initialPageRef.current = fromQuery > 0 ? fromQuery : doc.lastViewedPage || 1;
      setCurrentPage(initialPageRef.current);
    }
  }, [doc, searchParams]);

  // Remember last viewed page (debounced).
  useEffect(() => {
    if (!doc || !isReady(doc.processingStatus) || currentPage === lastSavedPage.current) return;
    const t = setTimeout(() => {
      lastSavedPage.current = currentPage;
      documentsApi.update(doc.id, { lastViewedPage: currentPage }).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [currentPage, doc]);

  useEffect(() => {
    try { localStorage.setItem(RIGHT_KEY, String(rightWidth)); } catch { /* ignore */ }
  }, [rightWidth]);

  const goToPage = useCallback((n: number) => {
    setCurrentPage(n);
    viewerRef.current?.goToPage(n);
    setMobileView('document');
    const el = document.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (!viewerRef.current && el) el.scrollIntoView({ block: 'start' });
  }, []);

  const onTextSelected = useCallback((sel: Selection | null) => {
    setSelection(sel);
    setCenterRect(centerRef.current?.getBoundingClientRect() ?? null);
  }, []);

  const ctx = useMemo<WorkspaceContextValue | null>(() => doc ? ({
    doc,
    goToPage,
    ai,
    defaultLevel: user?.preferences.defaultExplanationLevel ?? 'standard',
    defaultLength: user?.preferences.defaultSummaryLength ?? 'medium',
    preferredLanguage: user?.preferences.preferredLanguage ?? 'English',
  }) : null, [doc, goToPage, ai, user]);

  // Resize handle
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    const move = (ev: MouseEvent) => setRightWidth(Math.max(320, Math.min(760, startW + (startX - ev.clientX))));
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-64" /><Skeleton className="mt-4 h-[60vh]" /></div>;
  if (isError || !doc) {
    return <div className="p-6"><Alert tone="danger" title="Document not found" action={<Button size="sm" variant="outline" onClick={() => navigate('/app/documents')}>Back to library</Button>}>{(error as Error)?.message ?? 'It may have been deleted.'}</Alert></div>;
  }

  if (!isReady(doc.processingStatus)) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link to="/app/documents" className="text-sm text-ink-muted hover:text-ink">← My documents</Link>
        <h1 className="mt-3 text-xl font-semibold">{doc.title}</h1>
        <div className="mt-4 rounded-lg border border-line bg-surface p-5">
          {doc.processingStatus === 'failed' ? (
            <>
              <div className="flex items-center gap-2 text-danger"><AlertTriangle className="h-5 w-5" /><span className="font-semibold">Processing failed</span></div>
              <p className="mt-2 text-sm text-ink-soft">{doc.processingError ?? 'We could not process this document.'}</p>
              {doc.processingWarnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-ink-muted">{doc.processingWarnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>}
              <div className="mt-4 flex gap-2">
                <Button onClick={() => m.reprocess.mutate(doc.id)} loading={m.reprocess.isPending} leftIcon={<RotateCcw className="h-4 w-4" />}>Try again</Button>
                <Link to="/app/documents"><Button variant="outline">Upload another file</Button></Link>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between"><StatusBadge status={doc.processingStatus} /><span className="text-sm tabular-nums text-ink-muted">{doc.processingProgress}%</span></div>
              <Progress value={doc.processingProgress} className="mt-3" />
              <p className="mt-3 text-sm text-ink-soft">{doc.processingStage || STATUS_LABELS[doc.processingStatus]}</p>
              <p className="mt-1 text-xs text-ink-muted">This page refreshes automatically. OCR on scanned pages takes a few seconds per page.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const pages = pagesQuery.data?.pages ?? [];
  const firstPage = pages[0] ?? null;

  const rightPanel = (
    <div className="flex h-full flex-col">
      {selectionAction ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto"><SelectionResultPanel selection={selectionAction.selection} action={selectionAction.action} onClose={() => setSelectionAction(null)} /></div>
      ) : (
        <>
          <Tabs size="sm" className="shrink-0 px-2" tabs={TABS} value={tab} onChange={(t) => setTab(t as Tab)} />
          <div className={cn('min-h-0 flex-1', tab === 'chat' || tab === 'keyinfo' ? '' : 'scrollbar-thin overflow-y-auto')}>
            {tab === 'overview' && <OverviewPanel />}
            {tab === 'summary' && <SummaryPanel />}
            {tab === 'chat' && <ChatPanel />}
            {tab === 'keyinfo' && <KeyInfoPanel />}
            {tab === 'study' && <StudyPanel />}
            {tab === 'text' && <ExtractedTextPanel currentPage={currentPage} />}
          </div>
        </>
      )}
    </div>
  );

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <Button variant="ghost" size="icon" onClick={() => setLeftOpen((o) => !o)} aria-label={leftOpen ? 'Hide page list' : 'Show page list'} className="hidden lg:inline-flex"><PanelLeft className="h-4 w-4" /></Button>
          <Link to="/app/documents" className="hidden text-sm text-ink-muted hover:text-ink sm:inline">Documents</Link>
          <span className="hidden text-ink-muted sm:inline">/</span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.title}</h1>
          <div className="hidden items-center gap-1.5 md:flex">
            {doc.processingStatus === 'completed_with_warnings' && <Badge tone="warning">{doc.processingWarnings.length} warning{doc.processingWarnings.length === 1 ? '' : 's'}</Badge>}
            {ai && <Badge tone={ai.configured ? (ai.isMock ? 'warning' : 'neutral') : 'danger'}>{ai.configured ? (ai.isMock ? 'Mock AI' : `${ai.providerLabel.split(' (')[0]} · ${ai.model}`) : 'AI not configured'}</Badge>}
          </div>
          <Button variant="ghost" size="icon" onClick={() => m.update.mutate({ id: doc.id, body: { isFavorite: !doc.isFavorite } })} aria-label={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={doc.isFavorite}>
            <Star className={cn('h-4 w-4', doc.isFavorite && 'fill-warning text-warning')} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setRightOpen((o) => !o)} aria-label={rightOpen ? 'Hide AI panel' : 'Show AI panel'} className="hidden lg:inline-flex">{rightOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</Button>
          {/* Mobile toggle */}
          <div className="flex rounded-md border border-line p-0.5 lg:hidden" role="group" aria-label="View">
            <button onClick={() => setMobileView('document')} className={cn('rounded px-2 py-1 text-xs font-medium', mobileView === 'document' ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted')}>Document</button>
            <button onClick={() => setMobileView('ai')} className={cn('rounded px-2 py-1 text-xs font-medium', mobileView === 'ai' ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted')}>AI tools</button>
          </div>
        </div>

        {isProcessing(doc.processingStatus) && <div className="shrink-0 bg-info-soft px-3 py-1 text-xs text-info">Re-processing in the background: {doc.processingStage}</div>}

        <div className="flex min-h-0 flex-1">
          {/* Left: thumbnails */}
          {leftOpen && (doc.fileKind === 'pdf' || pages.length > 1) && (
            <aside className="hidden w-44 shrink-0 border-r border-line bg-surface lg:block" aria-label="Pages">
              {doc.fileKind === 'pdf' && pdf ? (
                <Thumbnails pdf={pdf} currentPage={currentPage} onSelect={goToPage} />
              ) : (
                <div className="scrollbar-thin h-full overflow-y-auto p-2">
                  {pages.map((p) => (
                    <button key={p.pageNumber} onClick={() => goToPage(p.pageNumber)} className={cn('mb-1 block w-full rounded-md px-2 py-1.5 text-left text-xs', currentPage === p.pageNumber ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-line/50')}>
                      <span className="font-medium">Section {p.pageNumber}</span>
                      <span className="block truncate text-ink-muted">{p.text.slice(0, 40) || '(empty)'}</span>
                    </button>
                  ))}
                </div>
              )}
            </aside>
          )}

          {/* Center: viewer */}
          <div ref={centerRef} className={cn('relative min-w-0 flex-1', mobileView === 'ai' && 'hidden lg:block')}>
            {doc.fileKind === 'pdf' && <PdfViewer ref={viewerRef} doc={doc} initialPage={initialPageRef.current ?? 1} onPageChange={setCurrentPage} onTextSelected={onTextSelected} onThumbnailsReady={setPdf} />}
            {doc.fileKind === 'image' && (
              <ImageViewer doc={doc} page={firstPage} onTextSelected={onTextSelected} onPageUpdated={(_page, updated) => { qc.setQueryData(['document', id], updated); void qc.invalidateQueries({ queryKey: ['extracted-text', id] }); }} />
            )}
            {(doc.fileKind === 'text' || doc.fileKind === 'docx') && (pagesQuery.isLoading ? <div className="p-6"><Skeleton className="h-64" /></div> : <TextDocumentViewer doc={doc} pages={pages} currentPage={currentPage} onPageChange={setCurrentPage} onTextSelected={onTextSelected} />)}
            {selection && !selectionAction && (
              <SelectionToolbar selection={selection} containerRect={centerRect} onDismiss={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }} onAction={(a) => { setSelectionAction({ selection, action: a }); setSelection(null); setRightOpen(true); setMobileView('ai'); }} />
            )}
          </div>

          {/* Right: AI panel (desktop) */}
          {rightOpen && (
            <>
              <div onMouseDown={onResizeStart} role="separator" aria-orientation="vertical" aria-label="Resize AI panel" className="hidden w-1.5 shrink-0 cursor-col-resize bg-line hover:bg-accent/40 lg:block" />
              <aside className="hidden shrink-0 border-l border-line bg-surface lg:block" style={{ width: rightWidth }} aria-label="AI tools">{rightPanel}</aside>
            </>
          )}
          {/* Right: AI panel (mobile) */}
          <aside className={cn('min-w-0 flex-1 bg-surface lg:hidden', mobileView === 'document' && 'hidden')} aria-label="AI tools">{rightPanel}</aside>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
