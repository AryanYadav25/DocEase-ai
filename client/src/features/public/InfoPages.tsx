import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, FileText, GraduationCap, Languages, ListChecks, MessageSquareText, ScanText, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Alert } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError, request } from '@/lib/api';

function Page({ title, lead, children, wide }: { title: string; lead?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'mx-auto max-w-6xl px-4 py-14 sm:px-6' : 'mx-auto max-w-3xl px-4 py-14 sm:px-6'}>
      <h1 className="text-4xl font-semibold">{title}</h1>
      {lead && <p className="mt-4 text-lg text-ink-soft">{lead}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

/* ---------------- Features ---------------- */
export function FeaturesPage() {
  const groups: Array<{ icon: ReactNode; title: string; intro: string; items: string[] }> = [
    { icon: <FileText />, title: 'Reader', intro: 'A real PDF viewer, not a preview image.', items: ['Page navigation, zoom, fit to width or page, rotation and fullscreen', 'Search inside the document with highlighted matches', 'Thumbnails, keyboard shortcuts and a help dialog', 'Remembers the page you were on per document', 'Select text to simplify, explain, define or translate it'] },
    { icon: <ScanText />, title: 'OCR and image reading', intro: 'Scanned PDFs, screenshots and photos of notes.', items: ['Automatic detection of pages without a text layer', 'Image clean-up before recognition: orientation, grayscale, contrast, de-noise', 'Per-page confidence shown when the engine reports it', 'Editable extracted text with re-run OCR after corrections', 'Runs locally with Tesseract; no paid OCR service required'] },
    { icon: <Sparkles />, title: 'Simplify and summarise', intro: 'Four explanation levels and three lengths.', items: ['Plain-language overview, purpose, key points and facts', 'Dates, people and organisations, technical terms with page numbers', 'Action items and a list of what is unclear or missing', 'Paragraph, bullet, section-by-section, executive and takeaway summaries', 'Important quotations with page references'] },
    { icon: <MessageSquareText />, title: 'Chat with the document', intro: 'Grounded answers, not general knowledge.', items: ['Retrieval over the extracted text so long documents are never sent whole', 'Citations that are verified against real pages before display', 'Click a citation to jump to that page', 'Follow-up questions, conversation history, regenerate and feedback', 'An explicit "not found in the document" answer when evidence is missing'] },
    { icon: <ListChecks />, title: 'Key information', intro: 'Structured cards you can export.', items: ['Names, dates, amounts, deadlines, requirements', 'Eligibility criteria, responsibilities, definitions, tasks and warnings', 'A vocabulary assistant for difficult terms in context', 'Export as CSV, Markdown or plain text'] },
    { icon: <GraduationCap />, title: 'Study mode', intro: 'Everything linked to its source page.', items: ['Flashcards you can flip and mark as known', 'Multiple-choice and short-answer quizzes with explanations', 'Retry wrong answers; progress is saved', 'Revision notes with key definitions'] },
    { icon: <Languages />, title: 'Translation', intro: 'A configurable set of languages.', items: ['Translate a page, a selection or a summary', 'Names, numbers and dates are preserved and listed', 'Original text shown beside the translation', 'Copy or download the result'] },
    { icon: <Search />, title: 'Library', intro: 'Keep everything organised.', items: ['List and grid views, search, sorting and filters', 'Tags, favourites, descriptions and bulk actions', 'Trash with restore and permanent delete', 'Download the original file at any time'] },
  ];
  return (
    <Page title="Features" lead="Built around one idea: every explanation should point back to the page it came from." wide>
      <div className="grid gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} className="rounded-lg border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent [&>svg]:h-5 [&>svg]:w-5">{g.icon}</span>
              <div>
                <h2 className="text-lg font-semibold">{g.title}</h2>
                <p className="text-sm text-ink-muted">{g.intro}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {g.items.map((it) => (
                <li key={it} className="flex gap-2 text-sm text-ink-soft">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {it}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-10">
        <Link to="/register">
          <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
            Start with a document
          </Button>
        </Link>
      </div>
    </Page>
  );
}

/* ---------------- About ---------------- */
export function AboutPage() {
  return (
    <Page title="About DocuEase AI" lead="A college project about reading comprehension, built as a working product rather than a demo.">
      <div className="space-y-5 text-ink-soft">
        <p>Most people run into documents they struggle with: a lease, a scholarship notice, a research paper outside their field, a lecturer's scanned handout. DocuEase AI exists to make those documents understandable without hiding the original from you.</p>
        <p>The project has three design rules. First, the original document is always visible and the AI output sits beside it, never in place of it. Second, every AI answer must be traceable to a page, and the system checks those references before showing them. Third, when something cannot be read or found, the application says so plainly.</p>
        <h2 className="pt-2 text-xl font-semibold text-ink">What it is built with</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>React, Vite, TypeScript and Tailwind CSS on the front end, with pdf.js for rendering.</li>
          <li>Node.js, Express and MongoDB on the back end, with Tesseract for OCR.</li>
          <li>A provider-agnostic AI layer that works with free tiers from several providers or a local model.</li>
        </ul>
        <h2 className="pt-2 text-xl font-semibold text-ink">What it is not</h2>
        <p>DocuEase AI is not a substitute for a lawyer, accountant, doctor or teacher, and it has not been certified or audited by any organisation. It is a tool for understanding, and AI explanations can be wrong. Check anything important against the original text.</p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/features">
          <Button variant="outline">See the features</Button>
        </Link>
        <Link to="/contact">
          <Button variant="ghost">Send feedback</Button>
        </Link>
      </div>
    </Page>
  );
}

/* ---------------- Legal ---------------- */
function LegalNotice() {
  return (
    <Alert tone="warning" title="Sample policy" className="mb-6">
      This text is a starting point written for a student project. Have it reviewed and adapted before using DocuEase AI in production or with real users.
    </Alert>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Privacy policy" lead="What DocuEase AI stores, why, and how to remove it.">
      <LegalNotice />
      <div className="space-y-6 text-ink-soft">
        <Section h="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>Account details: your email address, display name and a hashed password.</li>
            <li>Documents you upload, the text extracted from them, OCR results and page metadata.</li>
            <li>Content generated from your documents: summaries, chat conversations, study materials and translations.</li>
            <li>Preferences such as theme, default explanation level and language.</li>
            <li>Feedback you submit, with the browser user-agent string.</li>
          </ul>
        </Section>
        <Section h="How it is used">
          <p>Your data is used only to provide the service to you: storing and displaying your documents, running extraction and OCR, and generating explanations on request. We do not sell data or use it for advertising.</p>
        </Section>
        <Section h="AI providers">
          <p>When you use an AI feature, the relevant extracted text (not the original file) is sent to the AI provider configured by the server administrator. Each provider has its own retention terms. The workspace shows the provider and model in use; if you are not comfortable sending a document to that provider, do not use the AI features on it.</p>
        </Section>
        <Section h="Retention and deletion">
          <p>Deleted documents stay in the trash for 30 days and are then permanently removed together with their extracted text, search index, summaries, conversations and study materials. Deleting your account removes all of your data immediately. You can download everything we hold about you from Settings.</p>
        </Section>
        <Section h="Security">
          <p>Passwords are hashed with Argon2. Sessions use HTTP-only cookies. Uploaded files are stored outside any public directory and checked by content, not just by file extension. See the Terms of service for limitations.</p>
        </Section>
        <Section h="Contact">
          <p>
            Questions about privacy can be sent through the <Link to="/contact" className="text-accent underline">contact form</Link>.
          </p>
        </Section>
      </div>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Terms of service" lead="The rules for using DocuEase AI.">
      <LegalNotice />
      <div className="space-y-6 text-ink-soft">
        <Section h="Your account">
          <p>You need an account to upload documents. Keep your password private and do not share your account. You are responsible for the documents you upload and must have the right to process them.</p>
        </Section>
        <Section h="Acceptable use">
          <p>Do not upload content that is illegal, that you do not have permission to use, or that attempts to interfere with the service (for example, files designed to exploit the processing pipeline). Do not use the service to generate content that harms others.</p>
        </Section>
        <Section h="AI output">
          <p>Summaries, explanations, answers, translations and study materials are generated by machine-learning models and may be inaccurate, incomplete or out of date. They are provided for understanding only and are not legal, financial, medical or academic advice. Always verify important information against the original document.</p>
        </Section>
        <Section h="Availability">
          <p>The service is provided as-is, without warranty. Free AI provider tiers have rate limits, so AI features may be temporarily unavailable. We may change or discontinue features.</p>
        </Section>
        <Section h="Termination">
          <p>You can delete your account at any time from Settings. We may suspend accounts that break these terms.</p>
        </Section>
      </div>
    </Page>
  );
}

function Section({ h, children }: { h: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink">{h}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

/* ---------------- Contact / feedback ---------------- */
export function ContactPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState('general');
  const [email, setEmail] = useState(user?.email ?? '');
  const [comments, setComments] = useState('');
  const [rating, setRating] = useState<number | undefined>();
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ status: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (comments.trim().length < 3) return setState({ status: 'error', message: 'Please write a few words.' });
    setState({ status: 'sending' });
    try {
      await request('/feedback', { method: 'POST', body: { category, comments: comments.trim(), rating, contactEmail: email || undefined } });
      setState({ status: 'sent' });
      setComments('');
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Could not send your message.' });
    }
  }

  return (
    <Page title="Contact and feedback" lead="Bug reports, feature ideas and notes on AI or OCR quality all land in the same inbox.">
      {state.status === 'sent' ? (
        <Alert tone="success" title="Message received">
          Thanks. Feedback is stored with your category and rating so it can be reviewed.{' '}
          <button className="underline" onClick={() => setState({ status: 'idle' })}>
            Send another
          </button>
        </Alert>
      ) : (
        <form onSubmit={submit} className="grid gap-4 rounded-lg border border-line bg-surface p-6">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: 'general', label: 'General feedback' },
              { value: 'bug', label: 'Something is broken' },
              { value: 'feature_request', label: 'Feature request' },
              { value: 'ai_quality', label: 'AI answer quality' },
              { value: 'ocr_quality', label: 'OCR quality' },
              { value: 'contact', label: 'Other question' },
            ]}
          />
          <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" hint="Only used to reply to you." />
          <div>
            <p className="text-sm font-medium">Rating (optional)</p>
            <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(rating === n ? undefined : n)} className={`h-9 w-9 rounded-md border text-sm font-medium ${rating && n <= rating ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-soft'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Textarea label="Message" value={comments} onChange={(e) => setComments(e.target.value)} rows={5} placeholder="What happened, or what would help?" maxLength={4000} />
          {state.status === 'error' && <Alert tone="danger">{state.message}</Alert>}
          <div>
            <Button type="submit" loading={state.status === 'sending'}>
              Send feedback
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}

/* ---------------- 404 ---------------- */
export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <BookOpen className="h-10 w-10 text-ink-muted" />
      <h1 className="mt-4 text-2xl font-semibold">This page doesn't exist</h1>
      <p className="mt-2 text-ink-muted">The link may be old or mistyped.</p>
      <Link to="/" className="mt-6">
        <Button variant="outline">Back to the home page</Button>
      </Link>
    </div>
  );
}
