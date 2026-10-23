import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Languages, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/utils';
import { aiApi } from '@/services/api';
import type { ExplanationLevel, OutputLength, Summary, TranslationContent } from '@/types';
import { AiUnavailable, ExportButtons, GeneratedBy, LevelLengthControls, PageRef, PanelHeader, errorText, toMarkdown, useWorkspace } from './common';

type SummaryKind = 'paragraph' | 'bullets' | 'sections' | 'executive' | 'takeaways' | 'quotes';
const KINDS: Array<{ id: SummaryKind; label: string; hint: string }> = [
  { id: 'paragraph', label: 'One paragraph', hint: 'A single coherent paragraph.' },
  { id: 'bullets', label: 'Bullet points', hint: 'The main points as a list.' },
  { id: 'sections', label: 'Section by section', hint: 'One entry per section or chapter, in order.' },
  { id: 'executive', label: 'Executive summary', hint: 'Headline, summary and recommendations.' },
  { id: 'takeaways', label: 'Key takeaways', hint: 'What to remember.' },
  { id: 'quotes', label: 'Important quotations', hint: 'Verbatim quotes with page references.' },
];

export function SummaryPanel() {
  const { doc, ai, defaultLevel, defaultLength, preferredLanguage } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<SummaryKind>('bullets');
  const [level, setLevel] = useState<ExplanationLevel>(defaultLevel);
  const [length, setLength] = useState<OutputLength>(defaultLength);
  const [current, setCurrent] = useState<{ summary: Summary; cached: boolean } | null>(null);
  const [translation, setTranslation] = useState<Summary<TranslationContent> | null>(null);
  const [lang, setLang] = useState(preferredLanguage === 'English' ? ai?.translationLanguages?.find((l) => l !== 'English') ?? 'Hindi' : preferredLanguage);

  const saved = useQuery({ queryKey: ['summaries', doc.id], queryFn: () => aiApi.summaries(doc.id) });
  const history = (saved.data?.summaries ?? []).filter((s) => KINDS.some((k) => k.id === s.summaryType));

  useEffect(() => {
    setTranslation(null);
    const latest = history.find((s) => s.summaryType === kind);
    setCurrent(latest ? { summary: latest, cached: true } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, saved.data]);

  const run = useMutation({
    mutationFn: (force: boolean) => aiApi.summarize(doc.id, { summaryType: kind, explanationLevel: level, outputLength: length, force }),
    onSuccess: (data) => {
      setCurrent(data);
      setTranslation(null);
      void qc.invalidateQueries({ queryKey: ['summaries', doc.id] });
    },
  });
  const translate = useMutation({
    mutationFn: () => aiApi.translate(doc.id, { targetLanguage: lang, scope: 'summary', summaryId: current!.summary.id }),
    onSuccess: (data) => setTranslation(data.summary as Summary<TranslationContent>),
    onError: (err) => toast.error('Translation failed', errorText(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => aiApi.deleteSummary(id),
    onSuccess: () => {
      setCurrent(null);
      void qc.invalidateQueries({ queryKey: ['summaries', doc.id] });
    },
  });

  const c = current?.summary.content as Record<string, unknown> | undefined;

  return (
    <div className="p-4">
      <PanelHeader title="Summary" description={KINDS.find((k) => k.id === kind)?.hint}>
        <Button size="sm" onClick={() => run.mutate(!!current)} loading={run.isPending} disabled={!ai?.configured} leftIcon={current ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}>
          {current ? 'Regenerate' : 'Summarise'}
        </Button>
      </PanelHeader>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${kind === k.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-soft hover:border-line-strong'}`}>
            {k.label}
            {history.some((s) => s.summaryType === k.id) && <span className="ml-1 text-ink-muted">•</span>}
          </button>
        ))}
      </div>
      <div className="mt-3"><LevelLengthControls level={level} length={length} onLevel={setLevel} onLength={setLength} /></div>
      <div className="mt-3"><AiUnavailable ai={ai} /></div>
      {run.isError && <Alert tone="danger" className="mt-3" title="Could not summarise">{errorText(run.error)}</Alert>}
      {run.isPending && <div className="mt-4 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-10/12" /><Skeleton className="h-4 w-8/12" /></div>}
      {!run.isPending && !current && ai?.configured && <EmptyState className="mt-4" title={`No ${KINDS.find((k) => k.id === kind)?.label.toLowerCase()} yet`} description="Generate one; it will be saved for this document." action={<Button onClick={() => run.mutate(false)}>Summarise</Button>} />}

      {c && !run.isPending && current && (
        <article className="mt-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GeneratedBy meta={current.summary.modelMeta} cached={current.cached} coverage={current.summary.coverage} />
            <span className="text-[11px] text-ink-muted">{formatRelative(current.summary.createdAt)}</span>
          </div>
          <div className="mt-3 leading-relaxed">
            {kind === 'paragraph' && <p>{String(c.summary)}</p>}
            {kind === 'bullets' && <ul className="list-disc space-y-1 pl-5">{(c.bullets as string[]).map((b, i) => <li key={i}>{b}</li>)}</ul>}
            {kind === 'takeaways' && <ol className="list-decimal space-y-1 pl-5">{(c.takeaways as string[]).map((b, i) => <li key={i}>{b}</li>)}</ol>}
            {kind === 'executive' && (
              <>
                <p className="text-base font-semibold">{String(c.headline)}</p>
                <p className="mt-2">{String(c.summary)}</p>
                {(c.recommendations as string[]).length > 0 && <><h3 className="mt-3 font-semibold">Recommendations</h3><ul className="mt-1 list-disc space-y-1 pl-5">{(c.recommendations as string[]).map((b, i) => <li key={i}>{b}</li>)}</ul></>}
              </>
            )}
            {kind === 'sections' && (
              <ol className="space-y-3">{(c.sections as Array<{ title: string; summary: string; pageStart?: number | null; pageEnd?: number | null }>).map((s, i) => (
                <li key={i} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-1"><h3 className="font-semibold">{s.title}</h3>{s.pageStart && <PageRef page={s.pageStart} label={s.pageEnd && s.pageEnd !== s.pageStart ? `p.${s.pageStart}–${s.pageEnd}` : undefined} />}</div>
                  <p className="mt-1 text-ink-soft">{s.summary}</p>
                </li>
              ))}</ol>
            )}
            {kind === 'quotes' && (
              <ul className="space-y-3">{(c.quotes as Array<{ quote: string; whyItMatters: string; page?: number | null }>).map((q, i) => (
                <li key={i}><blockquote className="border-l-2 border-accent pl-3 italic">“{q.quote}”</blockquote><p className="mt-1 text-ink-soft">{q.whyItMatters} <PageRef page={q.page} /></p></li>
              ))}</ul>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <ExportButtons markdown={toMarkdown(`${doc.title} — ${KINDS.find((k) => k.id === kind)?.label}`, c)} filenameBase={kind} />
            <div className="flex items-center gap-1.5">
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-8 rounded border border-line-strong bg-surface px-1.5 text-xs" aria-label="Translation language">
                {(ai?.translationLanguages ?? ['Hindi']).map((l) => <option key={l}>{l}</option>)}
              </select>
              <Button size="sm" variant="secondary" onClick={() => translate.mutate()} loading={translate.isPending} disabled={!ai?.configured} leftIcon={<Languages className="h-3.5 w-3.5" />}>Translate</Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(current.summary.id)} aria-label="Delete this summary"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {translation && (
            <div className="mt-4 rounded-md border border-line bg-surface-raised p-3">
              <div className="flex items-center justify-between"><Badge tone="info">Translation · {translation.language}</Badge><GeneratedBy meta={translation.modelMeta} /></div>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">{translation.content.translation}</p>
              {translation.content.preservedTerms.length > 0 && <p className="mt-2 text-xs text-ink-muted">Kept in the original language: {translation.content.preservedTerms.join(', ')}</p>}
              {translation.content.notes.length > 0 && <p className="mt-1 text-xs text-ink-muted">{translation.content.notes.join(' ')}</p>}
              <div className="mt-2"><ExportButtons markdown={`# ${doc.title} — translation (${translation.language})\n\n${translation.content.translation}`} filenameBase={`translation-${translation.language}`} /></div>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
