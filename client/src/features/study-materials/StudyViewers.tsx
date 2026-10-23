import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, Progress } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { studyApi } from '@/services/api';
import type { Flashcard, QuizQuestion, StudyMaterial } from '@/types';

export type FlashcardMaterial = StudyMaterial<{ flashcards: Flashcard[]; explanationLevel?: string }>;
export type QuizMaterial = StudyMaterial<{ questions: QuizQuestion[]; explanationLevel?: string }>;
export type NotesMaterial = StudyMaterial<{ keyDefinitions: Array<{ term: string; definition: string; page?: number | null }>; notes: Array<{ heading: string; points: string[]; page?: number | null }> }>;

function useProgressSaver(materialId: string) {
  return useMutation({ mutationFn: (progress: Record<string, unknown>) => studyApi.updateProgress(materialId, progress) });
}

/* ---------------- Flashcards ---------------- */
export function FlashcardsViewer({ material, goToPage }: { material: FlashcardMaterial; goToPage?: (n: number) => void }) {
  const cards = material.content.flashcards;
  const [known, setKnown] = useState<Set<string>>(new Set((material.progress.knownCardIds as string[]) ?? []));
  const [hideKnown, setHideKnown] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const save = useProgressSaver(material.id);

  const deck = useMemo(() => (hideKnown ? cards.filter((c) => !known.has(c.id)) : cards), [cards, known, hideKnown]);
  const card = deck[Math.min(idx, deck.length - 1)];
  useEffect(() => setFlipped(false), [idx, hideKnown]);
  useEffect(() => { if (idx >= deck.length) setIdx(Math.max(0, deck.length - 1)); }, [deck.length, idx]);

  const mark = (value: boolean) => {
    if (!card) return;
    const next = new Set(known);
    value ? next.add(card.id) : next.delete(card.id);
    setKnown(next);
    save.mutate({ knownCardIds: [...next] });
    if (idx < deck.length - 1) setIdx(idx + 1);
  };

  if (!cards.length) return <p className="text-sm text-ink-muted">This set has no cards.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>{known.size} of {cards.length} marked as known</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={hideKnown} onChange={(e) => setHideKnown(e.target.checked)} /> Hide known cards</label>
      </div>
      <Progress value={(known.size / cards.length) * 100} className="mt-2" tone="success" />
      {!card ? (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">All cards marked as known. <button className="underline" onClick={() => setHideKnown(false)}>Show them again</button></div>
      ) : (
        <>
          <button onClick={() => setFlipped((f) => !f)} className={cn('mt-4 flex min-h-48 w-full flex-col items-center justify-center rounded-xl border p-6 text-center transition-colors', flipped ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong')} aria-label={flipped ? 'Show question' : 'Reveal answer'}>
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">{flipped ? 'Answer' : 'Question'} · card {idx + 1} of {deck.length}</span>
            <p className="mt-3 text-base leading-relaxed">{flipped ? card.back : card.front}</p>
            {flipped && card.page && goToPage && <span onClick={(e) => { e.stopPropagation(); goToPage(card.page!); }} className="mt-3 rounded bg-surface px-2 py-0.5 text-xs text-accent-ink">Page {card.page}</span>}
            {!flipped && <span className="mt-4 text-xs text-ink-muted">Click to reveal</span>}
          </button>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous card"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setIdx((i) => Math.min(deck.length - 1, i + 1))} disabled={idx >= deck.length - 1} aria-label="Next card"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => mark(false)} leftIcon={<X className="h-3.5 w-3.5" />}>Still learning</Button>
              <Button size="sm" onClick={() => mark(true)} leftIcon={<Check className="h-3.5 w-3.5" />}>{known.has(card.id) ? 'Known' : 'Mark as known'}</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Quiz ---------------- */
interface Attempt { questionId: string; correct: boolean | null; given: string }

export function QuizViewer({ material, goToPage }: { material: QuizMaterial; goToPage?: (n: number) => void }) {
  const questions = material.content.questions;
  const [answers, setAnswers] = useState<Record<string, { given: string; revealed: boolean; selfMark?: boolean }>>({});
  const [retryOnly, setRetryOnly] = useState(false);
  const save = useProgressSaver(material.id);
  const pastAttempts = (material.progress.attempts as Array<{ at: string; score: number; total: number }> | undefined) ?? [];

  const visible = retryOnly ? questions.filter((q) => { const a = answers[q.id]; return a?.revealed && !isCorrect(q, a); }) : questions;
  const revealedCount = questions.filter((q) => answers[q.id]?.revealed).length;
  const correctCount = questions.filter((q) => answers[q.id]?.revealed && isCorrect(q, answers[q.id])).length;

  function isCorrect(q: QuizQuestion, a: { given: string; revealed: boolean; selfMark?: boolean } | undefined): boolean | null {
    if (!a?.revealed) return null;
    if (q.type === 'multiple_choice') return Number(a.given) === q.correctOptionIndex;
    return a.selfMark ?? null;
  }

  const finish = () => {
    const attempts: Attempt[] = questions.map((q) => ({ questionId: q.id, correct: isCorrect(q, answers[q.id]), given: answers[q.id]?.given ?? '' }));
    const record = { at: new Date().toISOString(), score: correctCount, total: questions.length };
    save.mutate({ attempts: [...pastAttempts, record].slice(-20), lastAnswers: attempts });
  };
  const reset = () => { setAnswers({}); setRetryOnly(false); };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>{revealedCount} of {questions.length} answered · {correctCount} correct</span>
        <div className="flex items-center gap-2">
          {pastAttempts.length > 0 && <span>Last attempt: {pastAttempts[pastAttempts.length - 1].score}/{pastAttempts[pastAttempts.length - 1].total}</span>}
          {revealedCount === questions.length && correctCount < questions.length && <Button size="sm" variant="outline" onClick={() => setRetryOnly(true)} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Retry wrong answers</Button>}
          <Button size="sm" variant="ghost" onClick={reset}>Start over</Button>
        </div>
      </div>
      <Progress value={(revealedCount / questions.length) * 100} className="mt-2" />
      <ol className="mt-4 space-y-4">
        {visible.map((q, i) => {
          const a = answers[q.id];
          const correct = isCorrect(q, a);
          return (
            <li key={q.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium"><span className="text-ink-muted">{i + 1}.</span> {q.question}</p>
                {q.page && goToPage && <button onClick={() => goToPage(q.page!)} className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent-ink">p.{q.page}</button>}
              </div>
              {q.type === 'multiple_choice' ? (
                <div className="mt-3 grid gap-1.5">
                  {q.options?.map((opt, oi) => {
                    const chosen = a?.given === String(oi);
                    const state = a?.revealed ? (oi === q.correctOptionIndex ? 'correct' : chosen ? 'wrong' : 'idle') : chosen ? 'chosen' : 'idle';
                    return (
                      <button key={oi} disabled={a?.revealed} onClick={() => setAnswers((s) => ({ ...s, [q.id]: { given: String(oi), revealed: false } }))} className={cn('rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default', state === 'correct' && 'border-success bg-success-soft', state === 'wrong' && 'border-danger bg-danger-soft', state === 'chosen' && 'border-accent bg-accent-soft', state === 'idle' && 'border-line hover:border-line-strong')}>
                        <span className="mr-2 font-medium text-ink-muted">{String.fromCharCode(65 + oi)}.</span>{opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea value={a?.given ?? ''} disabled={a?.revealed} onChange={(e) => setAnswers((s) => ({ ...s, [q.id]: { given: e.target.value, revealed: false } }))} rows={2} placeholder="Write your answer" className="mt-3 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm disabled:opacity-70" />
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!a?.revealed ? (
                  <Button size="sm" disabled={!a?.given} onClick={() => setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], revealed: true } }))}>Check answer</Button>
                ) : (
                  <>
                    {q.type === 'multiple_choice' ? (
                      <Badge tone={correct ? 'success' : 'danger'}>{correct ? 'Correct' : 'Not quite'}</Badge>
                    ) : a.selfMark === undefined ? (
                      <>
                        <span className="text-xs text-ink-muted">Compare with the model answer, then mark yourself:</span>
                        <Button size="sm" variant="outline" onClick={() => setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], selfMark: true } }))}>I got it</Button>
                        <Button size="sm" variant="outline" onClick={() => setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], selfMark: false } }))}>I missed it</Button>
                      </>
                    ) : (
                      <Badge tone={correct ? 'success' : 'danger'}>{correct ? 'Marked correct' : 'Marked wrong'}</Badge>
                    )}
                  </>
                )}
              </div>
              {a?.revealed && (
                <div className="mt-3 rounded-md bg-surface-raised p-3 text-sm">
                  <p><span className="font-medium">Answer: </span>{q.answer}</p>
                  <p className="mt-1 text-ink-soft">{q.explanation}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {revealedCount === questions.length && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent-soft p-4 text-sm">
          <span className="font-medium text-accent-ink">Score: {correctCount} / {questions.length}</span>
          <Button size="sm" onClick={finish} loading={save.isPending}>Save this attempt</Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Revision notes ---------------- */
export function RevisionNotesViewer({ material, goToPage }: { material: NotesMaterial; goToPage?: (n: number) => void }) {
  const c = material.content;
  const ref = (p?: number | null) => (p && goToPage ? <button onClick={() => goToPage(p)} className="ml-1 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent-ink">p.{p}</button> : null);
  return (
    <div className="text-sm">
      {c.keyDefinitions.length > 0 && (
        <section>
          <h3 className="font-semibold">Key definitions</h3>
          <dl className="mt-2 space-y-2">{c.keyDefinitions.map((d, i) => <div key={i}><dt className="font-medium">{d.term}{ref(d.page)}</dt><dd className="text-ink-soft">{d.definition}</dd></div>)}</dl>
        </section>
      )}
      {c.notes.map((n, i) => (
        <section key={i} className="mt-4">
          <h3 className="font-semibold">{n.heading}{ref(n.page)}</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">{n.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
