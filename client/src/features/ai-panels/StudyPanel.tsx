import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, Layers, ListChecks, NotebookPen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/utils';
import { aiApi, studyApi } from '@/services/api';
import type { StudyMaterial } from '@/types';
import { FlashcardsViewer, QuizViewer, RevisionNotesViewer, type FlashcardMaterial, type NotesMaterial, type QuizMaterial } from '@/features/study-materials/StudyViewers';
import { AiUnavailable, ExportButtons, GeneratedBy, PanelHeader, errorText, toMarkdown, useWorkspace } from './common';

export function StudyPanel() {
  const { doc, ai, goToPage } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<StudyMaterial | null>(null);
  const [cardCount, setCardCount] = useState(10);
  const [quizCount, setQuizCount] = useState(8);
  const list = useQuery({ queryKey: ['study-materials', doc.id], queryFn: () => aiApi.studyMaterials(doc.id) });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['study-materials', doc.id] });
    void qc.invalidateQueries({ queryKey: ['study-materials-all'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const onError = (err: unknown) => toast.error('Generation failed', errorText(err));
  const flashcards = useMutation({ mutationFn: () => aiApi.flashcards(doc.id, { count: cardCount }), onSuccess: (d) => { invalidate(); setOpen(d.material); }, onError });
  const quiz = useMutation({ mutationFn: () => aiApi.quiz(doc.id, { count: quizCount, mixShortAnswer: true }), onSuccess: (d) => { invalidate(); setOpen(d.material); }, onError });
  const notes = useMutation({ mutationFn: () => aiApi.revisionNotes(doc.id), onSuccess: (d) => { invalidate(); setOpen(d.material); }, onError });
  const remove = useMutation({ mutationFn: (id: string) => studyApi.remove(id), onSuccess: () => { invalidate(); setOpen(null); } });
  const busy = flashcards.isPending || quiz.isPending || notes.isPending;

  if (open) {
    return (
      <div className="p-4">
        <button onClick={() => setOpen(null)} className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> All study materials</button>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{open.title}</h2>
            <GeneratedBy meta={open.modelMeta} className="mt-1" />
          </div>
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(open.id)} leftIcon={<Trash2 className="h-3.5 w-3.5" />}>Delete</Button>
        </div>
        <div className="mt-4">
          {open.materialType === 'flashcards' && <FlashcardsViewer material={open as FlashcardMaterial} goToPage={goToPage} />}
          {open.materialType === 'quiz' && <QuizViewer material={open as QuizMaterial} goToPage={goToPage} />}
          {open.materialType === 'revision_notes' && <RevisionNotesViewer material={open as NotesMaterial} goToPage={goToPage} />}
        </div>
        <div className="mt-5 border-t border-line pt-3"><ExportButtons markdown={toMarkdown(open.title, open.content)} filenameBase={open.materialType.replace('_', '-')} /></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <PanelHeader title="Study materials" description="Everything generated here stays linked to this document and its pages." />
      <div className="mt-3"><AiUnavailable ai={ai} /></div>
      <div className="mt-3 grid gap-2">
        <GenerateCard icon={<Layers className="h-4 w-4" />} title="Flashcards" hint="Question on the front, answer and page on the back." action={<><select value={cardCount} onChange={(e) => setCardCount(Number(e.target.value))} className="h-8 rounded border border-line-strong bg-surface px-1.5 text-xs" aria-label="Number of cards">{[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} cards</option>)}</select><Button size="sm" onClick={() => flashcards.mutate()} loading={flashcards.isPending} disabled={busy || !ai?.configured}>Generate</Button></>} />
        <GenerateCard icon={<ListChecks className="h-4 w-4" />} title="Practice quiz" hint="Multiple-choice plus a few short-answer questions, with explanations." action={<><select value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))} className="h-8 rounded border border-line-strong bg-surface px-1.5 text-xs" aria-label="Number of questions">{[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}</select><Button size="sm" onClick={() => quiz.mutate()} loading={quiz.isPending} disabled={busy || !ai?.configured}>Generate</Button></>} />
        <GenerateCard icon={<NotebookPen className="h-4 w-4" />} title="Revision notes" hint="Key definitions and topic-by-topic notes." action={<Button size="sm" onClick={() => notes.mutate()} loading={notes.isPending} disabled={busy || !ai?.configured}>Generate</Button>} />
      </div>
      {busy && <Alert tone="info" className="mt-3">Generating from {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'}. Long documents are processed in parts, so this can take a minute.</Alert>}

      <h3 className="mt-5 text-sm font-semibold">Saved for this document</h3>
      {list.isLoading ? (
        <div className="mt-2 space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : !list.data?.materials.length ? (
        <EmptyState className="mt-2 py-8" icon={<GraduationCap className="h-6 w-6" />} title="Nothing saved yet" description="Generate flashcards, a quiz or notes above." />
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-md border border-line">
          {list.data.materials.map((m) => (
            <li key={m.id}>
              <button onClick={() => setOpen(m)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-raised">
                <span className="text-accent">{m.materialType === 'flashcards' ? <Layers className="h-4 w-4" /> : m.materialType === 'quiz' ? <ListChecks className="h-4 w-4" /> : <NotebookPen className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="text-xs text-ink-muted">{materialMeta(m)} · {formatRelative(m.createdAt)}</span>
                </span>
                {m.modelMeta?.isMock && <Badge tone="warning">Mock</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function materialMeta(m: StudyMaterial): string {
  const c = m.content as Record<string, unknown>;
  if (m.materialType === 'flashcards') {
    const cards = (c.flashcards as unknown[]) ?? [];
    const known = ((m.progress.knownCardIds as string[]) ?? []).length;
    return `${cards.length} cards · ${known} known`;
  }
  if (m.materialType === 'quiz') {
    const qs = (c.questions as unknown[]) ?? [];
    const attempts = (m.progress.attempts as Array<{ score: number; total: number }>) ?? [];
    return `${qs.length} questions${attempts.length ? ` · best ${Math.max(...attempts.map((a) => a.score))}/${qs.length}` : ''}`;
  }
  return `${((c.notes as unknown[]) ?? []).length} topics · ${((c.keyDefinitions as unknown[]) ?? []).length} definitions`;
}

function GenerateCard({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
      <span className="text-accent">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-ink-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-1.5">{action}</div>
    </div>
  );
}
