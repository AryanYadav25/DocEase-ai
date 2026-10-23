import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Languages, Pencil, RefreshCw, Save, ScanText, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { downloadText, slugFilename } from '@/lib/utils';
import { documentsApi, aiApi } from '@/services/api';
import type { DocumentPage, Summary, TranslationContent } from '@/types';
import { AiUnavailable, GeneratedBy, PanelHeader, errorText, useWorkspace } from './common';

const METHOD_LABEL: Record<string, string> = { text_layer: 'Text layer', ocr: 'OCR', docx: 'Word', plain_text: 'Text file', manual: 'Edited by you', none: 'No text' };

export function ExtractedTextPanel({ currentPage }: { currentPage: number }) {
  const { doc, ai, goToPage, preferredLanguage } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [translation, setTranslation] = useState<Summary<TranslationContent> | null>(null);
  const [lang, setLang] = useState(preferredLanguage === 'English' ? ai?.translationLanguages?.find((l) => l !== 'English') ?? 'Hindi' : preferredLanguage);

  const pages = useQuery({ queryKey: ['extracted-text', doc.id], queryFn: () => documentsApi.extractedText(doc.id) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['extracted-text', doc.id] });
    void qc.invalidateQueries({ queryKey: ['document', doc.id] });
  };
  const save = useMutation({
    mutationFn: ({ n, text }: { n: number; text: string }) => documentsApi.updatePageText(doc.id, n, text),
    onSuccess: () => { setEditing(null); refresh(); toast.success('Text saved', 'The search index and AI context were updated.'); },
    onError: (err) => toast.error('Could not save', errorText(err)),
  });
  const retry = useMutation({
    mutationFn: (n: number) => documentsApi.retryPageOcr(doc.id, n, { enhance: true, grayscale: true }),
    onSuccess: (d) => { refresh(); d.result.ok ? toast.success(`OCR finished for page ${d.result.pageNumber}`, d.result.confidence !== undefined ? `Confidence ${d.result.confidence}%` : undefined) : toast.error('OCR failed', d.result.error); },
    onError: (err) => toast.error('OCR failed', errorText(err)),
  });
  const ocrAll = useMutation({
    mutationFn: (pagesToRun: number[]) => documentsApi.runOcr(doc.id, { pages: pagesToRun, enhance: true, grayscale: true }),
    onSuccess: (d) => { refresh(); const failed = d.results.filter((r) => !r.ok).length; failed ? toast.error(`${failed} page(s) failed OCR`) : toast.success('OCR finished'); },
    onError: (err) => toast.error('OCR failed', errorText(err)),
  });
  const translate = useMutation({
    mutationFn: (n: number) => aiApi.translate(doc.id, { targetLanguage: lang, scope: 'text', pageNumber: n }),
    onSuccess: (d) => setTranslation(d.summary as Summary<TranslationContent>),
    onError: (err) => toast.error('Translation failed', errorText(err)),
  });

  useEffect(() => {
    const el = document.getElementById(`extracted-page-${currentPage}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  const list: DocumentPage[] = pages.data?.pages ?? [];
  const emptyPages = list.filter((p) => !p.text.trim()).map((p) => p.pageNumber);
  const canOcr = doc.fileKind === 'pdf' || doc.fileKind === 'image';
  const allText = list.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n');

  return (
    <div className="p-4">
      <PanelHeader title="Extracted text" description="What the AI reads. Fix mistakes here and the search index updates automatically.">
        <div className="flex flex-wrap gap-1.5">
          {canOcr && emptyPages.length > 0 && <Button size="sm" variant="secondary" onClick={() => ocrAll.mutate(emptyPages.slice(0, 50))} loading={ocrAll.isPending} leftIcon={<ScanText className="h-3.5 w-3.5" />}>OCR {emptyPages.length} empty page{emptyPages.length > 1 ? 's' : ''}</Button>}
          <Button size="sm" variant="ghost" onClick={() => downloadText(slugFilename(`${doc.title}-text`, 'txt'), allText)} leftIcon={<Download className="h-3.5 w-3.5" />}>TXT</Button>
        </div>
      </PanelHeader>
      {pages.data && (
        <p className="mt-2 text-xs text-ink-muted">{pages.data.extractedTextMeta.totalChars.toLocaleString()} characters · {pages.data.extractedTextMeta.textPages} text pages · {pages.data.extractedTextMeta.ocrPages} OCR pages · {pages.data.extractedTextMeta.emptyPages} empty</p>
      )}
      {doc.processingWarnings.length > 0 && (
        <Alert tone="warning" className="mt-3">
          <ul className="space-y-0.5">{doc.processingWarnings.map((w, i) => <li key={i}>{w.pageNumber ? `Page ${w.pageNumber}: ` : ''}{w.message}</li>)}</ul>
        </Alert>
      )}
      {pages.isLoading && <div className="mt-4 space-y-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {pages.isError && <Alert tone="danger" className="mt-3">{errorText(pages.error)}</Alert>}

      {translation && (
        <div className="mt-3 rounded-md border border-line bg-surface-raised p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="info">Translation · {translation.language} · {translation.content.sourceLabel.replace('page:', 'page ')}</Badge>
            <button onClick={() => setTranslation(null)} className="text-ink-muted hover:text-ink" aria-label="Close translation"><X className="h-4 w-4" /></button>
          </div>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{translation.content.translation}</p>
          {translation.content.preservedTerms.length > 0 && <p className="mt-2 text-xs text-ink-muted">Kept in the original language: {translation.content.preservedTerms.join(', ')}</p>}
          <div className="mt-2 flex items-center justify-between"><GeneratedBy meta={translation.modelMeta} /><Button size="sm" variant="ghost" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(slugFilename(`${doc.title}-${translation.language}`, 'txt'), translation.content.translation)}>Download</Button></div>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {list.map((p) => {
          const isEditing = editing === p.pageNumber;
          const conf = p.ocr?.confidence;
          return (
            <section key={p.pageNumber} id={`extracted-page-${p.pageNumber}`} className={`rounded-md border p-3 ${p.pageNumber === currentPage ? 'border-accent/50' : 'border-line'}`}>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button onClick={() => goToPage(p.pageNumber)} className="font-semibold text-ink hover:text-accent">Page {p.pageNumber}</button>
                <Badge>{METHOD_LABEL[p.extractionMethod] ?? p.extractionMethod}</Badge>
                {p.extractionMethod === 'ocr' && conf !== undefined && <Badge tone={conf >= 80 ? 'success' : conf >= 60 ? 'warning' : 'danger'}>Confidence {conf}%</Badge>}
                {p.ocr?.error && <Badge tone="danger">OCR error</Badge>}
                <span className="ml-auto flex items-center gap-1">
                  {!isEditing && <Button size="sm" variant="ghost" onClick={() => { setEditing(p.pageNumber); setDraft(p.text); }} leftIcon={<Pencil className="h-3.5 w-3.5" />}>Edit</Button>}
                  {canOcr && <Button size="sm" variant="ghost" onClick={() => retry.mutate(p.pageNumber)} loading={retry.isPending && retry.variables === p.pageNumber} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>{p.ocr?.attempted ? 'Retry OCR' : 'OCR'}</Button>}
                  {p.text && <Button size="sm" variant="ghost" onClick={() => translate.mutate(p.pageNumber)} loading={translate.isPending && translate.variables === p.pageNumber} disabled={!ai?.configured} leftIcon={<Languages className="h-3.5 w-3.5" />}>Translate</Button>}
                </span>
              </div>
              {p.warnings.length > 0 && <p className="mt-1.5 text-xs text-warning">{p.warnings.join(' ')}</p>}
              {isEditing ? (
                <div className="mt-2">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(24, Math.max(6, draft.split('\n').length + 1))} className="w-full rounded-md border border-line-strong bg-surface p-2 font-mono text-[13px] leading-relaxed" aria-label={`Text of page ${p.pageNumber}`} />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => save.mutate({ n: p.pageNumber, text: draft })} loading={save.isPending} leftIcon={<Save className="h-3.5 w-3.5" />}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-soft">{p.text || <span className="italic text-ink-muted">No text on this page.{canOcr ? ' Try OCR.' : ''}</span>}</pre>
              )}
            </section>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
        <Languages className="h-3.5 w-3.5" /> Translate into
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-7 rounded border border-line-strong bg-surface px-1.5 text-xs text-ink" aria-label="Translation language">
          {(ai?.translationLanguages ?? ['Hindi']).map((l) => <option key={l}>{l}</option>)}
        </select>
        <AiUnavailable ai={ai} />
      </div>
    </div>
  );
}
