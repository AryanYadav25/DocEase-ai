# DocuEase AI — API reference

Base URL: `http://localhost:4000/api/v1`

- Authentication: HTTP-only cookie `docuease_session` set by `/auth/register` and `/auth/login` (a `Authorization: Bearer <jwt>` header is also accepted).
- CSRF: every `POST`, `PATCH`, `DELETE` request that carries the cookie must send `X-Requested-With: DocuEase`.
- Responses: `{ "success": true, "data": … }`, list endpoints add `"pagination": { page, pageSize, total, totalPages }`.
- Errors: `{ "success": false, "error": { "code", "message", "requestId", "details?" } }`. Codes include `VALIDATION_ERROR`, `UNAUTHORIZED`, `SESSION_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `EMPTY_FILE`, `ENCRYPTED_PDF`, `CORRUPT_FILE`, `PAGE_LIMIT_EXCEEDED`, `DOCUMENT_NOT_READY`, `OCR_FAILED`, `AI_NOT_CONFIGURED`, `AI_PROVIDER_ERROR`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_INVALID_OUTPUT`, `AI_USAGE_LIMIT`, `DATABASE_UNAVAILABLE`, `INTERNAL_ERROR`.
- Rate limits (per user/IP): 300 req/min overall; 20 auth attempts / 15 min; 40 uploads / 10 min; `AI_USER_REQUESTS_PER_HOUR` AI calls (default 60).

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Database, OCR and AI status plus queue depth |

## Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, displayName }` | password ≥ 8 chars with a letter and a number. 201 + cookie |
| POST | `/auth/login` | `{ email, password }` | 200 + cookie; 401 `Incorrect email or password.` |
| POST | `/auth/logout` | — | clears cookie |
| GET | `/auth/me` | — | current user |
| POST | `/auth/forgot-password` | `{ email }` | always 200; when SMTP is not configured (non-production) returns `devResetUrl` |
| POST | `/auth/reset-password` | `{ token, password }` | invalidates other sessions |

User object: `{ id, email, displayName, role, emailVerified, preferences: { theme, defaultExplanationLevel, defaultSummaryLength, preferredLanguage, autoOcrScannedPages, enhanceImagesBeforeOcr }, createdAt }`

## Documents

| Method | Path | Description |
|---|---|---|
| GET | `/documents/upload-policy` | limits and accepted types |
| POST | `/documents` | multipart `files[]` (≤ `MAX_FILES_PER_UPLOAD`). Returns per-file results; 201 if any succeeded |
| GET | `/documents` | query: `page, pageSize, search, sort (name|uploaded|lastOpened), order, fileKind, status, favorite, trashed, tag` |
| POST | `/documents/bulk` | `{ ids[], action: delete|restore|favorite|unfavorite|permanent_delete|add_tag, tag? }` |
| GET | `/documents/:id` | document (also records `lastOpenedAt`) |
| PATCH | `/documents/:id` | `{ title?, description?, tags?, isFavorite?, lastViewedPage? }` |
| DELETE | `/documents/:id` | move to trash |
| POST | `/documents/:id/restore` | restore from trash |
| DELETE | `/documents/:id/permanent` | delete file + all derived data |
| GET | `/documents/:id/download` | original file (`?inline=true` for viewing) |
| GET | `/documents/:id/status` | processing state and progress |
| POST | `/documents/:id/reprocess` | re-run the pipeline (202) |
| POST | `/documents/:id/extract` | alias of reprocess |
| GET | `/documents/:id/pages/:n` | one page's text and OCR metadata |
| GET | `/documents/:id/extracted-text` | all pages |
| PATCH | `/documents/:id/pages/:n/text` | `{ text }` manual correction; re-indexes |
| POST | `/documents/:id/ocr` | `{ pages?[], rotate?, enhance?, grayscale? }` OCR up to 50 pages |
| POST | `/documents/:id/pages/:n/retry-ocr` | same options for one page |

Document object: `{ id, title, description, originalFilename, mimeType, fileKind (pdf|image|text|docx), fileSize, pageCount, processingStatus, processingStage, processingProgress, processingError, processingWarnings[], extractedTextMeta { totalChars, textPages, ocrPages, emptyPages, chunkCount }, ocrStatus, language, tags[], isFavorite, lastViewedPage, lastOpenedAt, deletedAt, createdAt, updatedAt }`

Processing states: `queued → processing → ocr_in_progress → indexing → completed | completed_with_warnings | failed`.

## AI

All AI routes require the document to be ready and the provider to be configured (otherwise `409 DOCUMENT_NOT_READY` / `503 AI_NOT_CONFIGURED`). Results are validated against schemas before being saved.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/ai/status` | — | provider, model, limits, translation languages |
| POST | `/documents/:id/simplify` | `{ explanationLevel?, outputLength?, force? }` | `{ summary, cached }` (summaryType `simplify`) |
| POST | `/documents/:id/summarize` | `{ summaryType: paragraph|bullets|sections|executive|takeaways|quotes, explanationLevel?, outputLength?, force? }` | `{ summary, cached }` |
| POST | `/documents/:id/extract-information` | `{ force? }` | `{ summary }` (summaryType `key_information`) |
| POST | `/documents/:id/vocabulary` | `{ force? }` | `{ summary }` |
| POST | `/documents/:id/explain-selection` | `{ text, action: simplify|explain|example|define|translate|ask, question?, targetLanguage?, pageNumber?, explanationLevel? }` | `{ answer, notes[], modelMeta, scope: "selection" }` |
| POST | `/documents/:id/translate` | `{ targetLanguage, scope: text|summary, text?, pageNumber?, summaryId? }` | `{ summary }` (summaryType `translation`) |
| POST | `/documents/:id/flashcards` | `{ count (3–30), explanationLevel? }` | `{ material }` |
| POST | `/documents/:id/quiz` | `{ count (3–20), mixShortAnswer, explanationLevel? }` | `{ material }` |
| POST | `/documents/:id/revision-notes` | — | `{ material }` |
| POST | `/documents/:id/chat` | `{ conversationId?, message, regenerateMessageId? }` | `{ conversation, userMessage, assistantMessage, retrievedChunks }`; send `Accept: text/event-stream` for SSE (`progress` events, then `done` or `error`) |
| GET | `/documents/:id/suggested-questions` | — | `{ questions[] }` |
| GET | `/documents/:id/summaries` | — | saved results |
| DELETE | `/summaries/:id` | — | |
| GET | `/documents/:id/study-materials` | — | |
| GET | `/documents/:id/conversations` | — | |
| POST | `/documents/:id/conversations` | — | new empty conversation |

`explanationLevel`: `very_simple | beginner | standard | detailed`. `outputLength`: `short | medium | detailed`.

Summary object: `{ id, documentId, summaryType, explanationLevel, outputLength, language, content (shape per type), sourceReferences[{ pageNumber, chunkIndex?, excerpt? }], modelMeta { provider, model, promptTokens, completionTokens, totalTokens, latencyMs, isMock }, coverage { pagesCovered, totalPages, truncated }, createdAt }`

Message object: `{ id, conversationId, role, content, sourceReferences[], foundInDocument, modelMeta, feedback, createdAt }`

## Conversations and study materials

| Method | Path | Body |
|---|---|---|
| GET | `/conversations/:id` | — → `{ conversation, messages[] }` |
| POST | `/conversations/:id/messages` | `{ message, regenerateMessageId? }` |
| POST | `/conversations/:id/clear` | — |
| DELETE | `/conversations/:id` | — |
| PATCH | `/conversations/messages/:messageId/feedback` | `{ feedback: "up" | "down" | null }` |
| GET | `/study-materials` | — all of the user's materials |
| GET | `/study-materials/:id` | — |
| PATCH | `/study-materials/:id/progress` | `{ progress: { … } }` merged into saved progress |
| DELETE | `/study-materials/:id` | — |

## Account and feedback

| Method | Path | Body |
|---|---|---|
| GET | `/users/me` | — |
| PATCH | `/users/me` | `{ displayName?, preferences? }` |
| POST | `/users/me/change-password` | `{ currentPassword, newPassword }` |
| DELETE | `/users/me` | `{ password, confirmation: "DELETE MY ACCOUNT" }` |
| GET | `/users/me/export` | JSON download of all user data |
| GET | `/users/me/dashboard` | stats, recent documents, activity |
| POST | `/feedback` | `{ category, rating?, comments, documentId?, contactEmail? }` (auth optional) |

## curl examples

```bash
API=http://localhost:4000/api/v1
H='X-Requested-With: DocuEase'

# register (saves the cookie)
curl -c cj.txt -H "$H" -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"Passw0rd123","displayName":"Me"}' $API/auth/register

# upload two files
curl -b cj.txt -H "$H" -F files=@sample-documents/sample-library-terms.pdf \
  -F files=@sample-documents/sample-notes-photo.png $API/documents

# poll status
curl -b cj.txt $API/documents/<id>/status

# simplify
curl -b cj.txt -H "$H" -H 'Content-Type: application/json' \
  -d '{"explanationLevel":"beginner","outputLength":"short"}' $API/documents/<id>/simplify

# chat (JSON)
curl -b cj.txt -H "$H" -H 'Content-Type: application/json' \
  -d '{"message":"What is the late fee?"}' $API/documents/<id>/chat

# chat (streaming)
curl -N -b cj.txt -H "$H" -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"message":"Who can apply?"}' $API/documents/<id>/chat

# correct page text
curl -b cj.txt -H "$H" -H 'Content-Type: application/json' -X PATCH \
  -d '{"text":"Corrected text"}' $API/documents/<id>/pages/1/text

# trash, restore, permanent delete
curl -b cj.txt -H "$H" -X DELETE $API/documents/<id>
curl -b cj.txt -H "$H" -X POST   $API/documents/<id>/restore
curl -b cj.txt -H "$H" -X DELETE $API/documents/<id>/permanent
```
