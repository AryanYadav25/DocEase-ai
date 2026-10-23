import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronDown, FileSearch, FileText, GraduationCap, Languages, ListChecks, Lock, MessageSquareText, ScanText, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export function LandingPage() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return (
    <div>
      {/* ---------------- Hero ---------------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pb-24 lg:pt-20">
        <div className="max-w-xl">
          <h1 className="text-4xl font-semibold leading-[1.08] sm:text-5xl">Understand Any Document. Instantly.</h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">
            Upload a contract, a lecture handout, a government notice or a photo of your notes. DocuEase reads it, explains the hard parts in plain language, answers your questions with page references, and turns it into study material.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/register">
              <Button size="lg" leftIcon={<Upload className="h-4 w-4" />}>
                Upload a document
              </Button>
            </Link>
            <Link to="/features">
              <Button size="lg" variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Explore features
              </Button>
            </Link>
          </div>
          <ul className="mt-7 flex flex-wrap gap-2" aria-label="Supported file formats">
            {['PDF', 'Scanned PDF', 'PNG', 'JPG', 'WebP', 'DOCX', 'TXT'].map((f) => (
              <li key={f} className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft">
                {f}
              </li>
            ))}
          </ul>
        </div>
        <ProductPreview />
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold">Everything hard about a document, handled</h2>
            <p className="mt-3 text-ink-soft">Each tool works from the text actually extracted from your file. When something is unreadable, missing or uncertain, DocuEase says so instead of guessing.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<Sparkles />} title="Plain-language simplification" text="A full rewrite at the level you choose, from very simple to detailed, with purpose, key points, dates, people, terms and action items." />
            <Feature icon={<ScanText />} title="OCR for scans and photos" text="Scanned PDFs, screenshots and photographed notes are recognised page by page. Edit the result and re-run OCR when a page comes out wrong." />
            <Feature icon={<MessageSquareText />} title="Chat with your document" text="Ask follow-up questions and get answers grounded in the file, with clickable page references. If the answer isn't in the document, it tells you." />
            <Feature icon={<ListChecks />} title="Key information extraction" text="Names, dates, amounts, deadlines, requirements, eligibility, responsibilities and warnings, pulled into structured cards." />
            <Feature icon={<GraduationCap />} title="Study mode" text="Flashcards, multiple-choice and short-answer quizzes, and revision notes, each linked back to the page it came from." />
            <Feature icon={<Languages />} title="Translation and vocabulary" text="Translate extracted text or summaries into a configurable set of languages, and get a glossary of the difficult terms in context." />
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold">How it works</h2>
          <p className="mt-3 text-ink-soft">The same four steps for every file, whether it has a text layer or is a photo of a page.</p>
        </div>
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          <Step n={1} icon={<Upload />} title="Upload" text="Drag in one or more files. Size and page limits are shown before you start." />
          <Step n={2} icon={<FileSearch />} title="Extract" text="Text layers are read directly. Pages without one go through OCR with image clean-up first." />
          <Step n={3} icon={<FileText />} title="Read" text="A real page viewer with search, zoom, thumbnails and text selection, next to the extracted text." />
          <Step n={4} icon={<Sparkles />} title="Ask and learn" text="Simplify, summarise, extract, chat and generate study material, all tied to page numbers." />
        </ol>
      </section>

      {/* ---------------- Use cases ---------------- */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-semibold">Made for people who have to read things they didn't write</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <UseCase icon={<GraduationCap />} title="Students" items={['Turn a 40-page reading into section summaries and flashcards', 'Photograph the whiteboard and get editable notes', 'Quiz yourself before the exam']} />
            <UseCase icon={<BookOpen />} title="Researchers" items={['Section-by-section summaries of long papers', 'Pull every definition, figure and claim into one list', 'Ask where a method is described and jump to the page']} />
            <UseCase icon={<FileText />} title="Everyday readers" items={['Understand a rental contract or job offer before signing', 'Find the deadline and the fee in a government notice', 'Translate the parts you need into your language']} />
          </div>
        </div>
      </section>

      {/* ---------------- Privacy ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-3xl font-semibold">Your files stay yours</h2>
            <p className="mt-3 text-ink-soft">Honest about what happens to a document after you upload it.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ['Private storage', 'Uploaded files are stored outside any public folder and only ever served to the account that uploaded them.'],
              ['You control deletion', 'Deleted documents sit in the trash for 30 days, then the file, extracted text, chunks, chats and study material are removed together. Account deletion does the same for everything.'],
              ['AI provider disclosure', 'When you use an AI feature, the relevant extracted text is sent to the AI provider configured by the server administrator. The workspace shows which provider and model are in use.'],
              ['Documents are data, not instructions', 'Text inside your files is treated as untrusted content. Instructions hidden in a document cannot change how the assistant behaves.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-lg border border-line bg-surface p-4">
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-ink-soft">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section id="faq" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-semibold">Questions people ask first</h2>
          <div className="mt-8 divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/register">
              <Button size="lg">Create a free account</Button>
            </Link>
            <span className="text-sm text-ink-muted">No card needed. Works with free AI providers.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------------- Pieces ---------------- */

function ProductPreview() {
  return (
    <div className="relative" aria-label="Preview of the DocuEase workspace: a document page next to its AI explanation">
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-ink-soft">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium text-ink">Membership terms.pdf</span>
            <span className="text-ink-muted">page 1 of 2</span>
          </div>
          <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">Ready</span>
        </div>
        <div className="grid sm:grid-cols-[1fr_1fr]">
          {/* document page */}
          <div className="border-b border-line bg-canvas p-3 sm:border-b-0 sm:border-r">
            <div className="rounded-sm border border-line bg-white p-4 text-[11px] leading-[1.5] text-[#2a2f4a] shadow-card">
              <p className="text-[12px] font-semibold">4. Late returns</p>
              <p className="mt-1.5">
                Items returned after the due date incur a late fee of{' '}
                <mark className="rounded-sm bg-[#fde68a] px-0.5 text-inherit">0.50 per item per day, capped at 15.00 per item</mark>. Members with outstanding fees above 20.00 will have borrowing privileges suspended until the balance is cleared.
              </p>
              <p className="mt-3 text-[12px] font-semibold">5. Renewals</p>
              <p className="mt-1.5">Items may be renewed twice online or at the front desk unless another member has placed a hold on them. Renewal requests must be made before the due date.</p>
              <p className="mt-3 text-[12px] font-semibold">6. Study rooms</p>
              <p className="mt-1.5 text-ink-muted">Study rooms can be booked for up to 3 hours per day. Bookings must be made at least 24 hours in advance…</p>
            </div>
          </div>
          {/* AI panel */}
          <div className="p-3">
            <div className="flex gap-1 border-b border-line text-[11px] font-medium">
              <span className="border-b-2 border-accent px-2 py-1.5 text-accent-ink">Overview</span>
              <span className="px-2 py-1.5 text-ink-muted">Chat</span>
              <span className="px-2 py-1.5 text-ink-muted">Key info</span>
              <span className="px-2 py-1.5 text-ink-muted">Study</span>
            </div>
            <div className="mt-3 text-[12px] leading-relaxed">
              <p className="text-[10px] font-medium text-ink-muted">In plain language</p>
              <p className="mt-1 text-ink">If you bring something back late, you pay 50 paise per day for each item, but never more than 15 for one item. If you owe more than 20 in total, you can't borrow anything else until you pay it off.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip>Page 1</Chip>
                <Chip tone="neutral">Fee capped at 15.00</Chip>
                <Chip tone="neutral">Suspension above 20.00</Chip>
              </div>
              <div className="mt-4 rounded-md border border-line bg-surface-raised p-2.5">
                <p className="text-[10px] font-medium text-ink-muted">Ask about this document</p>
                <p className="mt-1 text-ink">Can I renew a book that someone else has reserved?</p>
                <p className="mt-2 text-ink-soft">
                  No. Renewals are allowed twice, but not when another member has placed a hold on the item. <span className="rounded bg-accent-soft px-1 text-accent-ink">p.1</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">A real workspace layout. Explanations shown are illustrative.</p>
    </div>
  );
}

function Chip({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'neutral' }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', tone === 'accent' ? 'bg-accent-soft text-accent-ink' : 'bg-line/70 text-ink-soft')}>{children}</span>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-5">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}

function Step({ n, icon, title, text }: { n: number; icon: ReactNode; title: string; text: string }) {
  return (
    <li className="relative rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-semibold text-canvas">{n}</span>
        <span className="text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{text}</p>
    </li>
  );
}

function UseCase({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-5">
      <div className="flex items-center gap-2.5">
        <span className="text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((it) => (
          <li key={it} className="flex gap-2.5 text-sm text-ink-soft">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

const FAQ = [
  { q: 'Which files can I upload?', a: 'PDF (including scanned, image-only PDFs), PNG, JPG, WebP, DOCX and TXT. The default limit is 25 MB and 300 pages per file; the upload screen shows the limits in force on your server.' },
  { q: 'Does OCR work on handwriting?', a: 'It is best-effort. Printed text usually recognises well; handwriting accuracy varies a lot with neatness and photo quality. Every OCR result is editable, and you can re-run OCR after rotating or enhancing the image.' },
  { q: 'Will the AI make things up?', a: 'The assistant is instructed to answer only from the extracted text and to say when something is not found. Chat answers carry page references that are checked against the real pages before they are shown. Still, treat AI output as a starting point and verify anything important.' },
  { q: 'Is a paid AI subscription needed?', a: 'No. The server works with free tiers from providers such as Groq, Google AI Studio, OpenRouter, Mistral and Cerebras, or fully offline with a local Ollama model. Free tiers have rate limits, so very heavy use may need to wait or switch provider.' },
  { q: 'What happens to a document I delete?', a: 'It moves to the trash and can be restored for 30 days. After that, or when you delete it permanently, the file and everything derived from it are removed.' },
  { q: 'Is my document sent anywhere?', a: 'Files are stored on the DocuEase server. When you use an AI feature, the relevant extracted text is sent to the configured AI provider. The workspace shows which provider and model are in use so you can decide what to share.' },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 py-4 text-left">
        <span className="font-medium text-ink">{q}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-ink-soft">{a}</p>}
    </div>
  );
}

