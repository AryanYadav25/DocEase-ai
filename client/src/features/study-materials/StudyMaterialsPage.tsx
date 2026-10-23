import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, GraduationCap, Layers, ListChecks, NotebookPen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, Modal, PageHeader, Skeleton } from '@/components/ui/primitives';
import { GeneratedBy, toMarkdown } from '@/features/ai-panels/common';
import { materialMeta } from '@/features/ai-panels/StudyPanel';
import { downloadText, formatRelative, slugFilename } from '@/lib/utils';
import { studyApi } from '@/services/api';
import type { StudyMaterial } from '@/types';
import { FlashcardsViewer, QuizViewer, RevisionNotesViewer, type FlashcardMaterial, type NotesMaterial, type QuizMaterial } from './StudyViewers';

const ICON = { flashcards: Layers, quiz: ListChecks, revision_notes: NotebookPen };
const LABEL = { flashcards: 'Flashcards', quiz: 'Quiz', revision_notes: 'Revision notes' };

export function StudyMaterialsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | StudyMaterial['materialType']>('all');
  const [confirm, setConfirm] = useState<StudyMaterial | null>(null);
  const list = useQuery({ queryKey: ['study-materials-all'], queryFn: studyApi.listAll });
  const one = useQuery({ queryKey: ['study-material', id], queryFn: () => studyApi.get(id!), enabled: !!id });
  const remove = useMutation({
    mutationFn: (mid: string) => studyApi.remove(mid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['study-materials-all'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setConfirm(null);
      if (id) navigate('/app/study');
    },
  });

  const materials = useMemo(() => (list.data?.materials ?? []).filter((m) => filter === 'all' || m.materialType === filter), [list.data, filter]);

  if (id) {
    const mat = one.data?.material;
    return (
      <div>
        <button onClick={() => navigate('/app/study')} className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All study materials</button>
        {one.isLoading && <Skeleton className="mt-4 h-64" />}
        {one.isError && <Alert tone="danger" className="mt-4">{(one.error as Error).message}</Alert>}
        {mat && (
          <div className="mt-3">
            <PageHeader
              title={mat.title}
              description={`${LABEL[mat.materialType]} · ${materialMeta(mat)} · created ${formatRelative(mat.createdAt)}`}
              actions={
                <>
                  <Link to={`/app/workspace/${mat.documentId}`}><Button variant="outline" size="sm">Open document</Button></Link>
                  <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(slugFilename(mat.title, 'md'), toMarkdown(mat.title, mat.content), 'text/markdown')}>Markdown</Button>
                  <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirm(mat)}>Delete</Button>
                </>
              }
            />
            <GeneratedBy meta={mat.modelMeta} className="mb-4" />
            <div className="max-w-3xl">
              {mat.materialType === 'flashcards' && <FlashcardsViewer material={mat as FlashcardMaterial} goToPage={(n) => navigate(`/app/workspace/${mat.documentId}?page=${n}`)} />}
              {mat.materialType === 'quiz' && <QuizViewer material={mat as QuizMaterial} goToPage={(n) => navigate(`/app/workspace/${mat.documentId}?page=${n}`)} />}
              {mat.materialType === 'revision_notes' && <RevisionNotesViewer material={mat as NotesMaterial} goToPage={(n) => navigate(`/app/workspace/${mat.documentId}?page=${n}`)} />}
            </div>
          </div>
        )}
        <ConfirmDelete material={confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove.mutate(confirm.id)} loading={remove.isPending} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Study materials" description="Flashcards, quizzes and notes generated from your documents. Progress is saved as you go." />
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'flashcards', 'quiz', 'revision_notes'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-soft hover:border-line-strong'}`}>{f === 'all' ? 'All' : LABEL[f]}</button>
        ))}
      </div>
      {list.isLoading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : list.isError ? (
        <Alert tone="danger" className="mt-4">{(list.error as Error).message}</Alert>
      ) : materials.length === 0 ? (
        <EmptyState className="mt-4 py-16" icon={<GraduationCap className="h-8 w-8" />} title="No study materials yet" description="Open a document in the workspace and use the Study tab to generate flashcards, a quiz or revision notes." action={<Link to="/app/workspace"><Button>Open the workspace</Button></Link>} />
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {materials.map((m) => {
            const Icon = ICON[m.materialType];
            return (
              <li key={m.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
                <span className="mt-0.5 rounded-md bg-accent-soft p-2 text-accent"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <Link to={`/app/study/${m.id}`} className="block truncate font-medium hover:text-accent">{m.title}</Link>
                  <p className="text-xs text-ink-muted">{materialMeta(m)} · {formatRelative(m.createdAt)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge>{LABEL[m.materialType]}</Badge>
                    {m.modelMeta?.isMock && <Badge tone="warning">Mock</Badge>}
                  </div>
                </div>
                <button onClick={() => setConfirm(m)} className="rounded p-1 text-ink-muted hover:text-danger" aria-label={`Delete ${m.title}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDelete material={confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove.mutate(confirm.id)} loading={remove.isPending} />
    </div>
  );
}

function ConfirmDelete({ material, onClose, onConfirm, loading }: { material: StudyMaterial | null; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <Modal open={!!material} onClose={onClose} title="Delete study material?" description={material ? `"${material.title}" and its progress will be removed.` : ''} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Keep</Button><Button variant="danger" onClick={onConfirm} loading={loading}>Delete</Button></>} />
  );
}
