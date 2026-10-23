import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/primitives';
import { aiApi } from '@/services/api';
import type { ExplanationLevel, OutputLength, SimplifyContent, Summary } from '@/types';
import { AiUnavailable, ExportButtons, GeneratedBy, LevelLengthControls, PageRef, PanelHeader, Section, errorText, toMarkdown, useWorkspace } from './common';

export function OverviewPanel() {
  const { doc, ai, defaultLevel, defaultLength } = useWorkspace();
  const qc = useQueryClient();
  const [level, setLevel] = useState<ExplanationLevel>(defaultLevel);
  const [length, setLength] = useState<OutputLength>(defaultLength);
  const [current, setCurrent] = useState<{ summary: Summary<SimplifyContent>; cached: boolean } | null>(null);

  const saved = useQuery({ queryKey: ['summaries', doc.id], queryFn: () => aiApi.summaries(doc.id) });
  useEffect(() => {
    if (current || !saved.data) return;
    const latest = saved.data.summaries.find((s) => s.summaryType === 'simplify') as Summary<SimplifyContent> | undefined;
    if (latest) {
      setCurrent({ summary: latest, cached: true });
      if (latest.explanationLevel) setLevel(latest.explanationLevel);
      if (latest.outputLength) setLength(latest.outputLength);
    }
  }, [saved.data, current]);

  const run = useMutation({
    mutationFn: (force: boolean) => aiApi.simplify(doc.id, { explanationLevel: level, outputLength: length, force }),
    onSuccess: (data) => {
      setCurrent(data as { summary: Summary<SimplifyContent>; cached: boolean });
      void qc.invalidateQueries({ queryKey: ['summaries', doc.id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const c = current?.summary.content;

  return (
    <div className="p-4">
      <PanelHeader title="Overview" description="A plain-language rewrite of the whole document.">
        <div className="flex flex-wrap items-center gap-2">
          <LevelLengthControls level={level} length={length} onLevel={setLevel} onLength={setLength} />
          <Button size="sm" onClick={() => run.mutate(!!current)} loading={run.isPending} disabled={!ai?.configured} leftIcon={current ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}>
            {current ? 'Regenerate' : 'Simplify document'}
          </Button>
        </div>
      </PanelHeader>
      <div className="mt-3">
        <AiUnavailable ai={ai} />
      </div>
      {run.isError && <Alert tone="danger" className="mt-3" title="Could not simplify">{errorText(run.error)}</Alert>}
      {run.isPending && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink-muted">Reading {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'} and writing the overview…</p>
          <Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-10/12" /><Skeleton className="h-4 w-9/12" />
        </div>
      )}
      {!run.isPending && !current && !saved.isLoading && ai?.configured && (
        <EmptyState className="mt-4" icon={<Sparkles className="h-8 w-8" />} title="No overview yet" description="Choose a level and length, then simplify. Results are saved so you don't pay for the same request twice." action={<Button onClick={() => run.mutate(false)}>Simplify document</Button>} />
      )}
      {c && !run.isPending && (
        <article className="mt-4 text-sm">
          <GeneratedBy meta={current!.summary.modelMeta} cached={current!.cached} coverage={current!.summary.coverage} />
          <Section title="In plain language"><p className="leading-relaxed">{c.overview}</p></Section>
          <Section title="Main purpose"><p className="leading-relaxed">{c.mainPurpose}</p></Section>
          <Section title="Key points" count={c.keyPoints.length}><List items={c.keyPoints} /></Section>
          <Section title="Important facts" count={c.importantFacts.length}><List items={c.importantFacts} /></Section>
          <Section title="Important dates" count={c.importantDates.length}>
            <ul className="space-y-1.5">{c.importantDates.map((d, i) => <li key={i} className="flex flex-wrap items-baseline gap-1.5"><span className="font-medium">{d.date}</span><span className="text-ink-soft">{d.meaning}</span><PageRef page={d.page} /></li>)}</ul>
          </Section>
          <Section title="People and organisations" count={c.peopleAndOrganizations.length}>
            <ul className="space-y-1.5">{c.peopleAndOrganizations.map((p, i) => <li key={i} className="flex flex-wrap items-baseline gap-1.5"><span className="font-medium">{p.name}</span><span className="text-ink-soft">{p.role}</span><PageRef page={p.page} /></li>)}</ul>
          </Section>
          <Section title="Technical terms explained" count={c.technicalTerms.length}>
            <dl className="space-y-2">{c.technicalTerms.map((t, i) => <div key={i}><dt className="font-medium">{t.term} <PageRef page={t.page} /></dt><dd className="text-ink-soft">{t.explanation}</dd></div>)}</dl>
          </Section>
          <Section title="Action items" count={c.actionItems.length}><List items={c.actionItems} /></Section>
          <Section title="Unclear or missing" count={c.unclearOrMissing.length}>
            <Alert tone="warning"><List items={c.unclearOrMissing} /></Alert>
          </Section>
          <Section title="Conclusion"><p className="leading-relaxed">{c.conclusion}</p></Section>
          <div className="mt-5 border-t border-line pt-3">
            <ExportButtons markdown={toMarkdown(`${doc.title} — Overview`, c)} filenameBase="overview" />
          </div>
        </article>
      )}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-1 pl-5 leading-relaxed">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}
