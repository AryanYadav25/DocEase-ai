import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Input';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usersApi } from '@/services/api';

const HELP = [
  { q: 'A page shows no text. What can I do?', a: 'Open the document, go to the Extracted text tab and press OCR on that page (or "OCR empty pages" at the top). If the result is poor, rotate or enhance the image in the viewer and run OCR again, or edit the text by hand. Edited text is used by search, chat and summaries straight away.' },
  { q: 'The AI says "not found in the document".', a: 'The chat only answers from passages it retrieves in your document. Try rephrasing with words that appear in the text, check that the relevant page has extracted text, or ask a narrower question.' },
  { q: 'What do the AI results cost?', a: 'Nothing: the server is set up with a free AI provider tier. Free tiers have rate limits, so if you see a "rate-limited" message, wait a minute and try again. Results are saved, so re-opening a summary does not send a new request.' },
  { q: 'Which keyboard shortcuts does the viewer have?', a: 'Arrow keys change page, + and − zoom, W fits width, P fits page, R rotates, F toggles fullscreen, Ctrl+F searches, and ? opens the full list.' },
  { q: 'How do I get my data out?', a: 'Settings → Export my data downloads a JSON file with everything we store. Summaries, key information and study materials can also be exported individually as Markdown, TXT or CSV.' },
  { q: 'What happens when I delete something?', a: 'Documents go to the trash for 30 days and can be restored. Permanent deletion removes the file, its extracted text, chunks, summaries, chats and study materials. Deleting your account removes all of it immediately.' },
];

export function HelpPage() {
  const toast = useToast();
  const [category, setCategory] = useState('general');
  const [rating, setRating] = useState<number | undefined>();
  const [comments, setComments] = useState('');
  const send = useMutation({
    mutationFn: () => usersApi.feedback({ category, rating, comments: comments.trim() }),
    onSuccess: () => { toast.success('Feedback sent', 'Thanks for helping improve DocuEase.'); setComments(''); setRating(undefined); },
    onError: (e) => toast.error('Could not send feedback', e instanceof ApiError ? e.message : undefined),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (comments.trim().length >= 3) send.mutate(); };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Help and feedback" description="Answers to common questions, and a direct line for bugs and ideas." />
      <Card className="divide-y divide-line px-5">
        {HELP.map((h) => <HelpItem key={h.q} {...h} />)}
      </Card>
      <Card className="mt-6 p-5">
        <h2 className="text-base font-semibold">Send feedback</h2>
        <form onSubmit={submit} className="mt-4 grid gap-4">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: 'general', label: 'General feedback' }, { value: 'bug', label: 'Something is broken' }, { value: 'feature_request', label: 'Feature request' }, { value: 'ai_quality', label: 'AI answer quality' }, { value: 'ocr_quality', label: 'OCR quality' }]} />
          <div>
            <p className="text-sm font-medium">How is DocuEase working for you?</p>
            <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(rating === n ? undefined : n)} className={cn('h-9 w-9 rounded-md border text-sm font-medium', rating && n <= rating ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-soft')}>{n}</button>
              ))}
            </div>
          </div>
          <Textarea label="Message" value={comments} onChange={(e) => setComments(e.target.value)} rows={4} maxLength={4000} placeholder="What happened, or what would help?" />
          {send.isError && <Alert tone="danger">{send.error instanceof ApiError ? send.error.message : 'Could not send.'}</Alert>}
          <div><Button type="submit" loading={send.isPending} disabled={comments.trim().length < 3}>Send feedback</Button></div>
        </form>
      </Card>
    </div>
  );
}

function HelpItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 py-3.5 text-left text-sm font-medium">
        {q}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <p className="pb-3.5 text-sm leading-relaxed text-ink-soft">{a}</p>}
    </div>
  );
}
