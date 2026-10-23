import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BookA, HelpCircle, Languages, Lightbulb, Sparkles, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge } from '@/components/ui/primitives';
import { aiApi } from '@/services/api';
import type { ModelMeta } from '@/types';
import { AiUnavailable, GeneratedBy, Markdown, errorText, useWorkspace } from './common';

export interface Selection {
  text: string;
  pageNumber: number;
  rect: DOMRect;
}

export type SelectionAction = 'simplify' | 'explain' | 'example' | 'define' | 'translate' | 'ask';

const ACTIONS: Array<{ id: SelectionAction; label: string; icon: React.ReactNode }> = [
  { id: 'simplify', label: 'Simplify', icon: <Wand2 className="h-3.5 w-3.5" /> },
  { id: 'explain', label: 'Explain', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'example', label: 'Example', icon: <Lightbulb className="h-3.5 w-3.5" /> },
  { id: 'define', label: 'Define terms', icon: <BookA className="h-3.5 w-3.5" /> },
  { id: 'translate', label: 'Translate', icon: <Languages className="h-3.5 w-3.5" /> },
  { id: 'ask', label: 'Ask about this', icon: <HelpCircle className="h-3.5 w-3.5" /> },
];

/** Floating toolbar shown next to selected document text. */
export function SelectionToolbar({ selection, containerRect, onAction, onDismiss }: { selection: Selection; containerRect: DOMRect | null; onAction: (a: SelectionAction) => void; onDismiss: () => void }) {
  const top = Math.max(8, selection.rect.top - (containerRect?.top ?? 0) - 44);
  const left = Math.max(8, Math.min((containerRect?.width ?? 600) - 420, selection.rect.left - (containerRect?.left ?? 0)));
  return (
    <div role="toolbar" aria-label="Selected text actions" className="animate-fade-in absolute z-30 flex max-w-[calc(100%-16px)] flex-wrap items-center gap-0.5 rounded-md border border-line bg-surface p-1 shadow-pop" style={{ top, left }}>
      {ACTIONS.map((a) => (
        <button key={a.id} onClick={() => onAction(a.id)} className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink hover:bg-accent-soft hover:text-accent-ink">{a.icon}{a.label}</button>
      ))}
      <button onClick={onDismiss} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/** Panel that runs a selection action and shows the result. */
export function SelectionResultPanel({ selection, action, onClose }: { selection: Selection; action: SelectionAction; onClose: () => void }) {
  const { doc, ai, preferredLanguage } = useWorkspace();
  const [question, setQuestion] = useState('');
  const [lang, setLang] = useState(preferredLanguage === 'English' ? ai?.translationLanguages?.find((l) => l !== 'English') ?? 'Hindi' : preferredLanguage);
  const [result, setResult] = useState<{ answer: string; notes: string[]; modelMeta: ModelMeta | null; action: SelectionAction } | null>(null);

  const run = useMutation({
    mutationFn: (a: SelectionAction) => aiApi.explainSelection(doc.id, { text: selection.text, action: a, pageNumber: selection.pageNumber, question: a === 'ask' ? question : undefined, targetLanguage: a === 'translate' ? lang : undefined }),
    onSuccess: (data, a) => setResult({ ...data, action: a }),
  });

  // Auto-run for actions that need no extra input.
  const needsInput = action === 'ask' || action === 'translate';
  const [started, setStarted] = useState(false);
  if (!started && !needsInput && ai?.configured) {
    setStarted(true);
    run.mutate(action);
  }

  const label = ACTIONS.find((a) => a.id === (result?.action ?? action))?.label ?? action;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{label}</h2>
          <p className="text-xs text-ink-muted">Based only on the selected passage{selection.pageNumber ? ` on page ${selection.pageNumber}` : ''}, not the whole document.</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <blockquote className="mt-3 max-h-32 overflow-auto rounded-md border-l-2 border-accent bg-surface-raised px-3 py-2 text-xs text-ink-soft">{selection.text}</blockquote>
      <div className="mt-3"><AiUnavailable ai={ai} /></div>

      {action === 'ask' && (
        <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) run.mutate('ask'); }} className="mt-3 flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want to know about this passage?" className="h-9 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm" aria-label="Question" />
          <Button type="submit" size="sm" loading={run.isPending} disabled={!question.trim() || !ai?.configured}>Ask</Button>
        </form>
      )}
      {action === 'translate' && (
        <div className="mt-3 flex items-center gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-9 rounded border border-line-strong bg-surface px-2 text-sm" aria-label="Language">{(ai?.translationLanguages ?? ['Hindi']).map((l) => <option key={l}>{l}</option>)}</select>
          <Button size="sm" onClick={() => run.mutate('translate')} loading={run.isPending} disabled={!ai?.configured}>Translate</Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {ACTIONS.filter((a) => a.id !== 'ask' && a.id !== 'translate').map((a) => (
          <button key={a.id} onClick={() => run.mutate(a.id)} disabled={run.isPending || !ai?.configured} className={`rounded-full border px-2.5 py-1 text-xs ${result?.action === a.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-soft hover:border-line-strong'}`}>{a.label}</button>
        ))}
      </div>

      {run.isPending && <p className="mt-4 text-sm text-ink-muted">Working on the selection…</p>}
      {run.isError && <Alert tone="danger" className="mt-3">{errorText(run.error)}</Alert>}
      {result && !run.isPending && (
        <div className="mt-4 text-sm">
          <Badge tone="accent" className="mb-2">Selection only</Badge>
          <Markdown>{result.answer}</Markdown>
          {result.notes.length > 0 && <p className="mt-2 text-xs text-ink-muted">{result.notes.join(' ')}</p>}
          <GeneratedBy meta={result.modelMeta} className="mt-3" />
        </div>
      )}
    </div>
  );
}
