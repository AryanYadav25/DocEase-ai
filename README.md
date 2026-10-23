# DocuEase AI — AI Document Simplifier

DocuEase AI turns complicated documents — PDFs, scanned PDFs, photos of notes, screenshots, Word and text files — into plain-language explanations, summaries, grounded answers and study materials. Every AI result points back to the page it came from, and the app says plainly when text could not be read or an answer was not found.

Built as a college project with a working frontend, backend, database, document-processing pipeline, OCR and a provider-agnostic AI layer that runs on **free** LLM tiers (or fully offline with Ollama).

## Features

- **Upload centre** – drag-and-drop or pick multiple files (PDF, PNG, JPG, WebP, DOCX, TXT), progress, cancel, retry, size/type validation by file *content*, duplicate detection
- **Processing pipeline** – text-layer extraction, scanned-page detection, OCR with image clean-up, page-aware chunking and indexing, with queued → processing → OCR → indexing → completed/failed states
- **PDF reader** – real page rendering (pdf.js), page navigation, zoom, fit width/page, rotate, fullscreen, in-document search with highlights, thumbnails, text selection, keyboard shortcuts, remembers the last page per document
- **Image reader** – preview, rotate/zoom, OCR with enhance/grayscale options, confidence badge, editable extracted text, re-run OCR
- **AI simplification** – plain-language overview, purpose, key points, facts, dates, people/organisations, technical terms, action items, unclear/missing items, conclusion; 4 explanation levels × 3 lengths
- **Summaries** – paragraph, bullets, section-by-section, executive, takeaways, quotations with page refs; long documents summarised in parts and merged
- **Explain selected text** – simplify / explain / example / define / translate / ask, scoped to the selection only
- **Key information extraction** and a **vocabulary assistant**
- **Chat with your document** – retrieval-augmented (BM25 over page chunks), citations verified against real pages, click-to-jump, follow-ups, history, clear, regenerate, 👍/👎, SSE streaming, honest "not found in the document"
- **Study mode** – flashcards (mark known), quizzes (multiple-choice + short answer, retry wrong answers, saved attempts), revision notes
- **Translation** of pages, selections and summaries into a configurable language list
- **Library** – list/grid, search, sort, filters, rename, description, tags, favourites, bulk actions, pagination, trash with 30-day retention, restore, permanent delete
- **Exports** – Markdown / TXT / CSV for AI results, TXT for extracted text, JSON export of all account data
- **Settings** – profile, password change, theme, AI defaults, processing preferences, data export, account deletion
- **Security** – Argon2 password hashing, HTTP-only cookie sessions with CSRF header check, rate limits, Helmet, strict CORS, magic-number file validation, private storage, ownership checks on every route, Zod validation everywhere, prompt-injection defence (document text is treated as untrusted data)

## Architecture

```
 Browser (React + Vite + Tailwind)                      Node.js API (Express + TypeScript)
 ┌──────────────────────────────┐   /api/v1 (cookie)   ┌──────────────────────────────────────┐
 │ Public site · Auth · Dashboard│ ───────────────────▶ │ routes → validators → controllers    │
 │ Library · Upload · Workspace  │ ◀─────────────────── │ services:                            │
 │  ├ pdf.js viewer / image reader│   JSON + SSE        │  auth · documents · storage (local)  │
 │  └ AI panels (overview, summary│                     │  extraction (pdf.js, mammoth, txt)   │
 │    chat, key info, study, text)│                     │  ocr (tesseract.js + sharp)          │
 └──────────────────────────────┘                     │  processing queue (in-process)       │
                                                       │  retrieval (BM25 over chunks)        │
                                                       │  ai (OpenAI-compatible adapter)      │
                                                       └───────┬──────────────────────┬───────┘
                                                               │ Mongoose              │ HTTPS
                                                       ┌───────▼───────┐      ┌───────▼────────────┐
                                                       │   MongoDB     │      │ Free LLM provider  │
                                                       │ (Atlas M0 or  │      │ Groq · Gemini ·    │
                                                       │  local)       │      │ OpenRouter · … ·   │
                                                       └───────────────┘      │ Ollama (offline)   │
                                                                              └────────────────────┘
```

Uploaded files live in `server/storage/` (outside any public directory). Each document is split into pages (`DocumentPage`) and overlapping chunks (`DocumentChunk`) that keep page numbers, so summaries, chat answers and study materials can cite pages. Long documents are never sent whole: whole-document features work in parts and merge, chat retrieves only the best-matching chunks.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query, React Hook Form + Zod, Lucide icons, pdf.js, react-markdown |
| Backend | Node.js 20+, Express 4, TypeScript (ESM), Mongoose 8, Zod, Argon2, JWT (HTTP-only cookie), Multer 2, Helmet, express-rate-limit, Pino |
| Documents | pdf.js (text layer + page rendering via @napi-rs/canvas), mammoth (DOCX), Tesseract.js (OCR), sharp (image preprocessing), file-type (magic-number validation) |
| AI | One OpenAI-compatible adapter with presets for Groq, Google Gemini (AI Studio), OpenRouter, Mistral, Cerebras, GitHub Models, Ollama, custom; mock provider for tests |
| Tests | Vitest + Supertest (API), Vitest + Testing Library (UI) |

## Prerequisites

- **Node.js 20 or newer** and npm
- **MongoDB** – one of:
  - a free [MongoDB Atlas](https://www.mongodb.com/atlas) M0 cluster (recommended: nothing to install), or
  - [MongoDB Community Server](https://www.mongodb.com/try/download/community) running locally
- **A free AI API key** from one provider (see *AI provider setup*), or [Ollama](https://ollama.com) installed locally for a fully offline setup
- ~1 GB disk for dependencies; no paid services anywhere

## Installation

```bash
git clone <this repo> docuease-ai
cd docuease-ai

# 1. environment
cp .env.example .env          # then edit MONGODB_URI, JWT_SECRET, AI_PROVIDER, AI_API_KEY

# 2. backend
cd server
npm install
npm run setup:ocr             # downloads English OCR data (~4 MB) into server/tessdata
cd ..

# 3. frontend
cd client
npm install
cd ..
```

### Environment variables

All variables are documented in [`.env.example`](.env.example). The ones you must set:

| Variable | What it is |
|---|---|
| `MONGODB_URI` | Atlas connection string or `mongodb://127.0.0.1:27017/docuease` |
| `JWT_SECRET` | A long random string, e.g. `openssl rand -hex 32` (the server refuses to start in production with the default) |
| `AI_PROVIDER` | `groq`, `gemini`, `openrouter`, `mistral`, `cerebras`, `github`, `ollama`, `custom` or `mock` |
| `AI_API_KEY` | The free key for that provider (not needed for `ollama`/`mock`) |

Optional: `AI_MODEL` / `AI_BASE_URL` override the preset, `MAX_FILE_SIZE_MB`, `MAX_PAGE_COUNT`, `OCR_LANGUAGES`, `EMAIL_PROVIDER`/`SMTP_*`, `AI_TRANSLATION_LANGUAGES`, rate limits.

### MongoDB configuration

- **Atlas (free)**: create an M0 cluster → *Database Access* → add a user → *Network Access* → allow your IP (or `0.0.0.0/0` for development) → *Connect* → copy the `mongodb+srv://` string into `MONGODB_URI`, replacing `<password>` and adding `/docuease` as the database name.
- **Local**: install MongoDB Community, start the `mongod` service, keep the default `MONGODB_URI`.

Indexes are created automatically by Mongoose on first start.

### AI provider setup (free tiers only)

| `AI_PROVIDER` | Get a key | Default model | Notes |
|---|---|---|---|
| `groq` | https://console.groq.com/keys | `openai/gpt-oss-120b` | Very fast. Free tier has per-minute and per-day limits. Alternatives: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` |
| `gemini` | https://aistudio.google.com/apikey | `gemini-3.5-flash-lite` | Google AI Studio free tier; also `gemini-3.8-flash` |
| `openrouter` | https://openrouter.ai/keys | `openrouter/free` | Routes to any free model; pin one with `AI_MODEL=<model>:free` |
| `mistral` | https://console.mistral.ai/api-keys | `mistral-small-latest` | "Experiment" tier |
| `cerebras` | https://cloud.cerebras.ai | `llama-3.3-70b` | Daily token limits |
| `github` | GitHub personal access token | `openai/gpt-4o-mini` | GitHub Models, free for GitHub accounts |
| `ollama` | — | `llama3.2` | Install Ollama, `ollama pull llama3.2`. Fully offline, slower on small machines |
| `custom` | — | set `AI_MODEL` | Any OpenAI-compatible endpoint (`AI_BASE_URL`) |
| `mock` | — | — | Tests only. Output is placeholder text marked `[MOCK]` |

Free tiers are rate-limited; the app shows a clear "rate-limited, try again" message and retries transient errors with backoff. Model names change over time — if a provider returns "model not found", set `AI_MODEL` to a current model from that provider's docs. Check `GET /api/v1/health` to see whether AI is configured.

### OCR setup

OCR runs locally with Tesseract.js; no service or key is needed. `npm run setup:ocr` (in `server/`) downloads the language data. For other languages: `npm run setup:ocr -- hin eng` and set `OCR_LANGUAGES=hin+eng`. Handwriting is best-effort; the UI warns about low confidence and lets you edit the result.

## Running locally

Open two terminals:

```bash
# terminal 1 – API on http://localhost:4000
cd server && npm run dev

# terminal 2 – web app on http://localhost:5173 (proxies /api to the server)
cd client && npm run dev
```

Then open http://localhost:5173, create an account and upload a file from `sample-documents/`.

Demo account (development only): `cd server && npm run seed` creates `demo@docuease.local` / `DemoPass123`.

## Tests

```bash
cd server && npm test     # 29 API/integration tests: auth, uploads, OCR, ownership, trash, AI (mock), adapter, rate limits
cd client && npm test     # UI unit tests
```

The server tests need a MongoDB-compatible server at `TEST_MONGODB_URI` (default `mongodb://127.0.0.1:27017/docuease_test`; the database is emptied before each file). They use the mock AI provider and a fake OpenAI-compatible HTTP server for the adapter, so no keys or network are required. The end-to-end user journey (register → upload → wait → read → summarise → ask → verify citations → open cited page → save study material → delete → access denied) is covered by `documents.test.ts` and `ai.test.ts`.

## Production build

```bash
cd client && npm run build      # outputs client/dist (static files)
cd server && npm run build      # outputs server/dist
cd server && NODE_ENV=production npm start
```

Serve `client/dist` from any static host (Netlify, Vercel, Nginx) and set `VITE_API_URL` at build time to the API's public URL. Set `CLIENT_ORIGIN` and `APP_BASE_URL` on the server to that frontend URL and `COOKIE_SECURE=true` (HTTPS). The session cookie is `SameSite=Lax`, so host the frontend and API on the same site (e.g. `app.example.com` and `api.example.com`), or put both behind one reverse proxy.

`docker-compose.yml` starts MongoDB + API + a static build of the client for a one-command local deployment (`docker compose up --build`).

## API

Versioned REST API under `/api/v1`, JSON responses of the form `{ "success": true, "data": … }` or `{ "success": false, "error": { "code", "message", "requestId" } }`. Full endpoint list with request/response shapes and curl examples: [docs/API.md](docs/API.md).

## Security notes

- Passwords: Argon2id. Sessions: signed JWT in an HTTP-only, SameSite=Lax cookie; every state-changing request must send `X-Requested-With: DocuEase` (CSRF). Changing or resetting a password invalidates other sessions.
- Uploads: extension *and* magic-number check, size/page limits, random storage keys, files stored outside public folders and served only to their owner with `nosniff` + sandboxed CSP. Temp files are removed after processing. DOCX is read as text only; nothing embedded is executed.
- Every document route checks ownership and returns 404 for other users' documents.
- Rate limits on auth, uploads, processing and AI calls; global request ceiling; 1 MB JSON body limit; Helmet headers.
- All input is validated with typed Zod schemas, which also blocks NoSQL operator injection.
- Document text is sent to the model as untrusted data inside `<document>` tags with explicit instructions to ignore embedded instructions; citations are verified against real chunks before display.
- Logs never contain document text, passwords, tokens or keys (pino redaction).
- **Retention**: trashed documents are purged after `TRASH_RETENTION_DAYS` (30). Permanent deletion removes the file, pages, chunks, summaries, conversations and study materials; account deletion removes everything. Backups are the operator's responsibility and should follow the same policy.
- **Third-party AI**: extracted text (not the original file) is sent to the configured provider when AI features are used. The app discloses the provider/model in the UI. Retention by the provider depends on its terms — check them before using sensitive documents.
- A malware-scanning hook can be added in `server/src/services/documents/documentService.ts` after `detectFileType`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `AI is not configured` banner | Set `AI_PROVIDER` and `AI_API_KEY` in `.env`, restart the server |
| AI returns "model not found" / 400 | Set `AI_MODEL` to a model currently listed by the provider |
| "rate-limited" | Free tier limit hit; wait a minute, or switch provider / use Ollama |
| OCR says language data missing | Run `npm run setup:ocr` in `server/` |
| `MongoServerSelectionError` | Check `MONGODB_URI`, that `mongod` is running, or that your IP is allowed in Atlas |
| Scanned PDF shows "No text on this page" | Run OCR from the *Text* tab (or enable auto-OCR in Settings) |
| Login works via curl but not in the browser | `CLIENT_ORIGIN` must match the frontend URL exactly (scheme, host, port) |
| `sharp` / `@napi-rs/canvas` install errors | Use Node 20+; on Alpine/ARM run `npm rebuild sharp @napi-rs/canvas` |
| Port in use | Change `PORT` (server) or `--port` (client) and update `CLIENT_ORIGIN`/proxy |

## Known limitations

- The job queue is in-process: a server restart re-queues unfinished documents, but there is no multi-instance scaling. For production scale, swap `server/src/jobs/queue.ts` for BullMQ + Redis and the local storage driver for S3.
- Retrieval is keyword (BM25) based rather than vector search, so it is strong on specific terms and weaker on paraphrased questions. An embedding field is reserved on chunks for a future vector index.
- Very long documents: whole-document features read at most `AI_MAX_INPUT_CHARS` × 8 parts (~190k characters); the UI shows when a result covered only part of the document.
- Free LLM tiers vary in quality and strictness of JSON output; the app validates and retries once, and reports an error rather than showing malformed results.
- OCR accuracy depends heavily on image quality; handwriting is best-effort.
- Email verification is not enabled; password-reset links are shown in the UI when SMTP is not configured (development) and not sent at all in production without SMTP.
- The project was verified against MongoDB-compatible storage during development and with Playwright in Chromium; Safari/Firefox PDF-viewer behaviour was not tested.

## Project structure

```
docuease-ai/
  client/            React app (see src/features/* for each area)
  server/            Express API (src/config, middleware, models, routes, controllers, services, jobs, validators, tests)
  sample-documents/  Synthetic test files with no personal data
  docs/API.md        Endpoint reference
  .env.example       All configuration with placeholders
  docker-compose.yml Optional one-command local stack
```
