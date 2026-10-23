import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookA, ListChecks, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, Skeleton, Tabs } from '@/components/ui/primitives';
import { toCsv } from '@/lib/utils';
import { aiApi } from '@/services/api';
import type { KeyInformationContent, Summary, VocabularyContent } from '@/types';
import { AiUnavailable, ExportButtons, GeneratedBy, PageRef, PanelHeader, errorText, toMarkdown, useWorkspace } from './common';

const GROUPS: Array<{ key: keyof KeyInformationContent; label: string }> = [
  { key: 'names', label: 'Names' },
  { key: 'dates', label: 'Dates' },
  { key: 'amounts', label: 'Amounts' },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'eligibilityCriteria', label: 'Eligibility criteria' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'definitions', label: 'Definitions' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'warnings', label: 'Important warnings' },
];

export function KeyInfoPanel() {
  const { doc, ai } = useWorkspace();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'info' | 'vocab'>('info');
  const [info, setInfo] = useState<{ summary: Summary<KeyInformationContent>; cached: boolean } | null>(null);
  const [vocab, setVocab] = useState<{ summary: Summary<VocabularyContent>; cached: boolean } | null>(null);
  const saved = useQuery({ queryKey: ['summaries', doc.id], queryFn: () => aiApi.summaries(doc.id) });

  useEffect(() => {
    if (!saved.data) return;
    if (!info) {
      const s = saved.data.summaries.find((x) => x.summaryType === 'key_information');
      if (s) setInfo({ summary: s as Summary<KeyInformationContent>, cached: true });
    }
    if (!vocab) {
      const s = saved.data.summaries.find((x) => x.summaryType === 'vocabulary');
      if (s) setVocab({ summary: s as Summary<VocabularyContent>, cached: true });
    }
  }, [saved.data, info, vocab]);

  const runInfo = useMutation({
    mutationFn: (force: boolean) => aiApi.extractInformation(doc.id, force),
    onSuccess: (d) => { setInfo(d as { summary: Summary<KeyInformationContent>; cached: boolean }); void qc.invalidateQueries({ queryKey: ['summaries', doc.id] }); },
  });
  const runVocab = useMutation({
    mutationFn: (force: boolean) => aiApi.vocabulary(doc.id, force),
    onSuccess: (d) => { setVocab(d as { summary: Summary<VocabularyContent>; cached: boolean }); void qc.invalidateQueries({ queryKey: ['summaries', doc.id] }); },
  });

  const c = info?.summary.content;
  const csv = c
    ? toCsv(GROUPS.flatMap((g) => ((c[g.key] as Array<Record<string, unknown>>) ?? []).map((it) => ({ category: g.label, value: it.value ?? it.term ?? '', detail: it.context ?? it.definition ?? it.party ?? '', page: it.page ?? '' }))))
    : undefined;

  return (
    <div className="flex h-full flex-col">
      <Tabs size="sm" className="px-3" value={tab} onChange={(t) => setTab(t as 'info' | 'vocab')} tabs={[{ id: 'info', label: 'Key information', icon: <ListChecks className="h-3.5 w-3.5" /> }, { id: 'vocab', label: 'Vocabulary', icon: <BookA className="h-3.5 w-3.5" /> }]} />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        <AiUnavailable ai={ai} />
        {tab === 'info' ? (
          <>
            <PanelHeader title="Key information" description="Facts pulled from the text. Categories with nothing found are listed at the end.">
              <Button size="sm" onClick={() => runInfo.mutate(!!info)} loading={runInfo.isPending} disabled={!ai?.configured} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>{info ? 'Re-extract' : 'Extract'}</Button>
            </PanelHeader>
            {runInfo.isError && <Alert tone="danger" className="mt-3">{errorText(runInfo.error)}</Alert>}
            {runInfo.isPending && <div className="mt-4 space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
            {!runInfo.isPending && !info && ai?.configured && <EmptyState className="mt-4" title="Nothing extracted yet" action={<Button onClick={() => runInfo.mutate(false)}>Extract key information</Button>} />}
            {c && !runInfo.isPending && (
              <div className="mt-3 text-sm">
                <GeneratedBy meta={info!.summary.modelMeta} cached={info!.cached} coverage={info!.summary.coverage} />
                <div className="mt-3 grid gap-3">
                  {GROUPS.map((g) => {
                    const items = (c[g.key] as Array<Record<string, unknown>>) ?? [];
                    if (!items.length) return null;
                    return (
                      <section key={g.key} className="rounded-md border border-line p-3">
                        <h3 className="flex items-center justify-between text-sm font-semibold">{g.label}<Badge>{items.length}</Badge></h3>
                        <ul className="mt-2 space-y-1.5">
                          {items.map((it, i) => (
                            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                              {typeof it.party === 'string' && <span className="font-medium">{it.party}:</span>}
                              <span className="font-medium">{String(it.value ?? it.term ?? '')}</span>
                              {(it.context || it.definition) ? <span className="text-ink-soft">— {String(it.context ?? it.definition)}</span> : null}
                              <PageRef page={it.page as number | undefined} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
                {c.notFound.length > 0 && <p className="mt-3 text-xs text-ink-muted">Not found in this document: {c.notFound.join(', ')}.</p>}
                <div className="mt-4 border-t border-line pt-3"><ExportButtons markdown={toMarkdown(`${doc.title} — Key information`, c)} filenameBase="key-information" csv={csv} /></div>
              </div>
            )}
          </>
        ) : (
          <>
            <PanelHeader title="Vocabulary" description="Difficult words and phrases, explained in the context of this document.">
              <Button size="sm" onClick={() => runVocab.mutate(!!vocab)} loading={runVocab.isPending} disabled={!ai?.configured} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>{vocab ? 'Rebuild' : 'Build glossary'}</Button>
            </PanelHeader>
            {runVocab.isError && <Alert tone="danger" className="mt-3">{errorText(runVocab.error)}</Alert>}
            {runVocab.isPending && <div className="mt-4 space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
            {!runVocab.isPending && !vocab && ai?.configured && <EmptyState className="mt-4" title="No glossary yet" action={<Button onClick={() => runVocab.mutate(false)}>Build glossary</Button>} />}
            {vocab && !runVocab.isPending && (
              <div className="mt-3 text-sm">
                <GeneratedBy meta={vocab.summary.modelMeta} cached={vocab.cached} coverage={vocab.summary.coverage} />
                <dl className="mt-3 divide-y divide-line">
                  {vocab.summary.content.terms.map((t, i) => (
                    <div key={i} className="py-3">
                      <dt className="flex items-center gap-2 font-semibold">{t.term} <PageRef page={t.page} /></dt>
                      <dd className="mt-1"><span className="font-medium text-ink-soft">Simple definition: </span>{t.simpleDefinition}</dd>
                      <dd className="mt-0.5"><span className="font-medium text-ink-soft">In this document: </span>{t.inContext}</dd>
                      <dd className="mt-0.5 italic text-ink-muted">“{t.exampleSentence}”</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 border-t border-line pt-3"><ExportButtons markdown={toMarkdown(`${doc.title} — Vocabulary`, vocab.summary.content)} filenameBase="vocabulary" csv={toCsv(vocab.summary.content.terms.map((t) => ({ term: t.term, definition: t.simpleDefinition, inContext: t.inContext, example: t.exampleSentence, page: t.page ?? '' })))} /></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
