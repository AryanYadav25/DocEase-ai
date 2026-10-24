import type { ZodTypeAny, z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  Conversation,
  DocumentPage,
  Message,
  StudyMaterial,
  Summary,
  type DocumentDoc,
  type MaterialType,
  type SummaryType,
} from '../../models/index.js';
import { AppError } from '../../utils/errors.js';
import { retrieveChunks } from '../retrieval/retrievalService.js';
import { complete, parseJsonObject, toModelMeta, type ChatMessage, type CompletionResult, type ModelMeta } from './llmClient.js';
import * as P from './prompts.js';
import * as S from './schemas.js';

type Level = P.ExplanationLevel;
type Length = P.OutputLength;

/* ------------------------------------------------------------------ */
/* Document text assembly                                              */
/* ------------------------------------------------------------------ */

interface DocText {
  parts: string[]; // each part ≤ maxChars, with [Page N] markers
  totalPages: number;
  pagesWithText: number;
  pagesCovered: number;
  truncated: boolean;
  isEmpty: boolean;
}

/** Load page text in order and split it into provider-sized parts. */
async function loadDocumentText(doc: DocumentDoc, maxChars = env.AI_MAX_INPUT_CHARS, maxParts = 8): Promise<DocText> {
  const pages = await DocumentPage.find({ documentId: doc._id }).sort({ pageNumber: 1 }).select('pageNumber text').lean();
  const parts: string[] = [];
  let current = '';
  let pagesCovered = 0;
  let truncated = false;
  const withText = pages.filter((p) => p.text.trim().length > 0);
  for (const page of withText) {
    const block = `[Page ${page.pageNumber}]\n${page.text.trim()}\n\n`;
    if (current.length + block.length > maxChars) {
      if (current) parts.push(current);
      current = '';
      if (parts.length >= maxParts) {
        truncated = true;
        break;
      }
      if (block.length > maxChars) {
        // a single page that exceeds the budget: hard-split it
        for (let i = 0; i < block.length; i += maxChars) {
          if (parts.length >= maxParts) {
            truncated = true;
            break;
          }
          parts.push(block.slice(i, i + maxChars));
        }
        pagesCovered++;
        continue;
      }
    }
    current += block;
    pagesCovered++;
  }
  if (current && !truncated) parts.push(current);
  else if (current && truncated && parts.length < maxParts) parts.push(current);
  return {
    parts,
    totalPages: pages.length,
    pagesWithText: withText.length,
    pagesCovered,
    truncated,
    isEmpty: withText.length === 0,
  };
}

function coverageNote(t: DocText, partIndex?: number): string {
  if (partIndex !== undefined && t.parts.length > 1) {
    return `Note: you are reading part ${partIndex + 1} of ${t.parts.length} of the document. Summarise this part only; parts will be merged later.`;
  }
  if (t.truncated) return `Note: only the first ${t.pagesCovered} of ${t.totalPages} pages are included because the document is very long. Mention this limitation in "unclearOrMissing" or notes if the shape allows.`;
  return `The full extracted text of the document (${t.totalPages} page(s)) is included.`;
}

function assertHasText(t: DocText) {
  if (t.isEmpty) {
    throw new AppError(422, 'DOCUMENT_NOT_READY', 'This document has no extracted text yet. Run OCR or correct the extracted text first.', { expose: true });
  }
}

/* ------------------------------------------------------------------ */
/* Generic structured call with validation                             */
/* ------------------------------------------------------------------ */

async function structured<T extends ZodTypeAny>(schema: T, system: string, user: string, opts: { maxOutputTokens?: number } = {}): Promise<{ data: z.infer<T>; result: CompletionResult }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: `${P.SYSTEM_BASE}\n\n${system}` },
    { role: 'user', content: user },
  ];
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await complete({ messages, json: true, maxOutputTokens: opts.maxOutputTokens });
    try {
      const parsed = schema.safeParse(parseJsonObject(result.text));
      if (parsed.success) return { data: parsed.data, result };
      lastError = parsed.error;
      logger.warn({ issues: parsed.error.issues.slice(0, 3) }, 'AI output failed schema validation, retrying');
      messages.push({ role: 'assistant', content: result.text.slice(0, 4000) });
      messages.push({ role: 'user', content: `That response did not match the required JSON shape (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}). Return ONLY the corrected JSON object.` });
    } catch (err) {
      lastError = err;
      messages.push({ role: 'user', content: 'Your previous reply was not valid JSON. Return ONLY a single valid JSON object.' });
    }
  }
  throw new AppError(502, 'AI_INVALID_OUTPUT', 'The AI model did not return a valid structured answer. Please try again or switch models.', { cause: lastError, expose: true });
}

/* ------------------------------------------------------------------ */
/* Map-reduce for long documents                                        */
/* ------------------------------------------------------------------ */

async function mapReduce<T extends ZodTypeAny>(schema: T, text: DocText, buildSystem: (partIndex?: number) => string): Promise<{ data: z.infer<T>; metas: ModelMeta[] }> {
  if (text.parts.length === 1) {
    const { data, result } = await structured(schema, buildSystem(), P.docBlock(text.parts[0]));
    return { data, metas: [toModelMeta(result)] };
  }
  const metas: ModelMeta[] = [];
  const partials: unknown[] = [];
  for (let i = 0; i < text.parts.length; i++) {
    if (i > 0) await pacePartRequests();
    const { data, result } = await structured(schema, buildSystem(i), P.docBlock(text.parts[i]));
    partials.push(data);
    metas.push(toModelMeta(result));
  }
  const merged = partials.map((p, i) => `[Part ${i + 1}]\n${JSON.stringify(p)}`).join('\n\n');
  const { data, result } = await structured(schema, `${P.COMBINE_SUMMARIES_PROMPT}\n\nRequired JSON shape: same as the parts.`, P.docBlock(merged));
  metas.push(toModelMeta(result));
  return { data, metas };
}

/** Small pause between parts of a long document so free-tier per-minute budgets are not exhausted in a burst. */
const pacePartRequests = () => new Promise((r) => setTimeout(r, env.AI_PART_DELAY_MS));

function mergeMetas(metas: ModelMeta[]): ModelMeta {
  const first = metas[0];
  return {
    provider: first.provider,
    model: first.model,
    promptTokens: metas.reduce((s, m) => s + (m.promptTokens ?? 0), 0) || undefined,
    completionTokens: metas.reduce((s, m) => s + (m.completionTokens ?? 0), 0) || undefined,
    totalTokens: metas.reduce((s, m) => s + (m.totalTokens ?? 0), 0) || undefined,
    latencyMs: metas.reduce((s, m) => s + m.latencyMs, 0),
    isMock: first.isMock,
  };
}

function collectPageRefs(obj: unknown, max = 20): Array<{ pageNumber: number }> {
  const pages = new Set<number>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((k === 'page' || k === 'pageStart' || k === 'pageEnd') && typeof val === 'number' && val >= 1) pages.add(val);
      else walk(val);
    }
  };
  walk(obj);
  return [...pages]
    .sort((a, b) => a - b)
    .slice(0, max)
    .map((pageNumber) => ({ pageNumber }));
}

async function findCached(doc: DocumentDoc, summaryType: SummaryType, extra: Record<string, unknown>) {
  return Summary.findOne({ documentId: doc._id, ownerId: doc.ownerId, summaryType, ...extra }).sort({ createdAt: -1 });
}

/* ------------------------------------------------------------------ */
/* Public feature functions                                             */
/* ------------------------------------------------------------------ */

export async function simplifyDocument(doc: DocumentDoc, level: Level, length: Length, force = false) {
  if (!force) {
    const cached = await findCached(doc, 'simplify', { explanationLevel: level, outputLength: length });
    if (cached) return { summary: cached, cached: true };
  }
  const text = await loadDocumentText(doc);
  assertHasText(text);
  const { data, metas } = await mapReduce(S.simplifyOutputSchema, text, (i) => P.simplifyPrompt(level, length, coverageNote(text, i)));
  const summary = await Summary.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    summaryType: 'simplify',
    explanationLevel: level,
    outputLength: length,
    content: data,
    sourceReferences: collectPageRefs(data),
    modelMeta: mergeMetas(metas),
    coverage: { pagesCovered: text.pagesCovered, totalPages: text.totalPages, truncated: text.truncated },
  });
  return { summary, cached: false };
}

const SUMMARY_SCHEMAS: Record<string, ZodTypeAny> = {
  paragraph: S.paragraphSummarySchema,
  bullets: S.bulletSummarySchema,
  sections: S.sectionSummarySchema,
  executive: S.executiveSummarySchema,
  takeaways: S.takeawaysSchema,
  quotes: S.quotesSchema,
};

export async function summarizeDocument(doc: DocumentDoc, summaryType: 'paragraph' | 'bullets' | 'sections' | 'executive' | 'takeaways' | 'quotes', level: Level, length: Length, force = false) {
  if (!force) {
    const cached = await findCached(doc, summaryType, { explanationLevel: level, outputLength: length });
    if (cached) return { summary: cached, cached: true };
  }
  const text = await loadDocumentText(doc);
  assertHasText(text);
  const { data, metas } = await mapReduce(SUMMARY_SCHEMAS[summaryType], text, (i) => P.summaryPrompt(summaryType, level, length, coverageNote(text, i)));
  const summary = await Summary.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    summaryType,
    explanationLevel: level,
    outputLength: length,
    content: data,
    sourceReferences: collectPageRefs(data),
    modelMeta: mergeMetas(metas),
    coverage: { pagesCovered: text.pagesCovered, totalPages: text.totalPages, truncated: text.truncated },
  });
  return { summary, cached: false };
}

export async function extractKeyInformation(doc: DocumentDoc, force = false) {
  if (!force) {
    const cached = await findCached(doc, 'key_information', {});
    if (cached) return { summary: cached, cached: true };
  }
  const text = await loadDocumentText(doc);
  assertHasText(text);
  const { data, metas } = await mapReduce(S.keyInformationSchema, text, (i) => P.keyInformationPrompt(coverageNote(text, i)));
  const summary = await Summary.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    summaryType: 'key_information',
    content: data,
    sourceReferences: collectPageRefs(data),
    modelMeta: mergeMetas(metas),
    coverage: { pagesCovered: text.pagesCovered, totalPages: text.totalPages, truncated: text.truncated },
  });
  return { summary, cached: false };
}

export async function buildVocabulary(doc: DocumentDoc, level: Level, force = false) {
  if (!force) {
    const cached = await findCached(doc, 'vocabulary', { explanationLevel: level });
    if (cached) return { summary: cached, cached: true };
  }
  const text = await loadDocumentText(doc, env.AI_MAX_INPUT_CHARS, 3);
  assertHasText(text);
  const { data, metas } = await mapReduce(S.vocabularySchema, text, (i) => P.vocabularyPrompt(level, coverageNote(text, i)));
  const summary = await Summary.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    summaryType: 'vocabulary',
    explanationLevel: level,
    content: data,
    sourceReferences: collectPageRefs(data),
    modelMeta: mergeMetas(metas),
    coverage: { pagesCovered: text.pagesCovered, totalPages: text.totalPages, truncated: text.truncated },
  });
  return { summary, cached: false };
}

export async function explainSelection(input: { text: string; action: string; question?: string; targetLanguage?: string; pageNumber?: number; level: Level }) {
  const user = P.docBlock(`${input.pageNumber ? `[Page ${input.pageNumber}]\n` : ''}${input.text}`);
  const { data, result } = await structured(S.selectionOutputSchema, P.selectionPrompt(input.action, input.level, input.question, input.targetLanguage), user);
  return { ...data, modelMeta: toModelMeta(result), scope: 'selection' as const };
}

export async function translateText(doc: DocumentDoc, input: { targetLanguage: string; text?: string; pageNumber?: number; summaryId?: string; scope: 'text' | 'summary' }) {
  let source = '';
  let sourceLabel = '';
  if (input.scope === 'summary' && input.summaryId) {
    const summary = await Summary.findOne({ _id: input.summaryId, documentId: doc._id, ownerId: doc.ownerId });
    if (!summary) throw AppError.notFound('Summary not found.');
    source = flattenForTranslation(summary.content);
    sourceLabel = `summary:${summary.summaryType}`;
  } else if (input.text) {
    source = input.text;
    sourceLabel = input.pageNumber ? `page:${input.pageNumber}` : 'selection';
  } else if (input.pageNumber) {
    const page = await DocumentPage.findOne({ documentId: doc._id, pageNumber: input.pageNumber }).lean();
    if (!page) throw AppError.notFound('Page not found.');
    source = page.text;
    sourceLabel = `page:${input.pageNumber}`;
  } else {
    const text = await loadDocumentText(doc, Math.min(env.AI_MAX_INPUT_CHARS, 12000), 1);
    assertHasText(text);
    source = text.parts[0];
    sourceLabel = text.truncated ? `pages:1-${text.pagesCovered}` : 'document';
  }
  if (!source.trim()) throw AppError.badRequest('There is no text to translate.');
  const { data, result } = await structured(S.translationOutputSchema, P.translatePrompt(input.targetLanguage), P.docBlock(source.slice(0, 12000)));
  const saved = await Summary.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    summaryType: 'translation',
    language: input.targetLanguage,
    content: { ...data, original: source.slice(0, 12000), sourceLabel, truncated: source.length > 12000 },
    sourceReferences: input.pageNumber ? [{ pageNumber: input.pageNumber }] : [],
    modelMeta: toModelMeta(result),
  });
  return saved;
}

function flattenForTranslation(content: unknown): string {
  const lines: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (typeof v === 'string') lines.push(key ? `${key}: ${v}` : v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, val]) => (typeof val === 'number' ? undefined : walk(val, k)));
  };
  walk(content);
  return lines.join('\n');
}

/* ---------- study materials ---------- */

function withIds<T extends { id?: string }>(items: T[], prefix: string): Array<T & { id: string }> {
  return items.map((it, i) => ({ ...it, id: it.id && /^[\w-]{1,40}$/.test(it.id) ? it.id : `${prefix}-${i + 1}` }));
}

export async function generateFlashcards(doc: DocumentDoc, count: number, level: Level) {
  const text = await loadDocumentText(doc, env.AI_MAX_INPUT_CHARS, 4);
  assertHasText(text);
  const perPart = Math.max(3, Math.ceil(count / text.parts.length));
  const metas: ModelMeta[] = [];
  let cards: S.FlashcardsOutput['flashcards'] = [];
  for (let i = 0; i < text.parts.length; i++) {
    const { data, result } = await structured(S.flashcardsOutputSchema, P.flashcardsPrompt(perPart, level, coverageNote(text, i)), P.docBlock(text.parts[i]));
    cards = cards.concat(data.flashcards);
    metas.push(toModelMeta(result));
  }
  cards = withIds(cards.slice(0, count), 'card');
  return StudyMaterial.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    materialType: 'flashcards' satisfies MaterialType,
    title: `Flashcards — ${doc.title}`,
    content: { flashcards: cards, explanationLevel: level },
    progress: { knownCardIds: [] },
    sourceReferences: collectPageRefs(cards),
    modelMeta: mergeMetas(metas),
  });
}

export async function generateQuiz(doc: DocumentDoc, count: number, mixShortAnswer: boolean, level: Level) {
  const text = await loadDocumentText(doc, env.AI_MAX_INPUT_CHARS, 4);
  assertHasText(text);
  const perPart = Math.max(3, Math.ceil(count / text.parts.length));
  const metas: ModelMeta[] = [];
  let questions: S.QuizOutput['questions'] = [];
  for (let i = 0; i < text.parts.length; i++) {
    const { data, result } = await structured(S.quizOutputSchema, P.quizPrompt(perPart, mixShortAnswer, level, coverageNote(text, i)), P.docBlock(text.parts[i]));
    questions = questions.concat(data.questions);
    metas.push(toModelMeta(result));
  }
  // Keep only well-formed multiple-choice questions.
  questions = questions.filter((q) => q.type === 'short_answer' || (q.options && q.options.length >= 2 && q.correctOptionIndex != null && q.correctOptionIndex < q.options.length));
  if (questions.length === 0) throw new AppError(502, 'AI_INVALID_OUTPUT', 'The model did not produce usable quiz questions. Please try again.', { expose: true });
  const final = withIds(questions.slice(0, count), 'q');
  return StudyMaterial.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    materialType: 'quiz' satisfies MaterialType,
    title: `Practice quiz — ${doc.title}`,
    content: { questions: final, explanationLevel: level },
    progress: { attempts: [] },
    sourceReferences: collectPageRefs(final),
    modelMeta: mergeMetas(metas),
  });
}

export async function generateRevisionNotes(doc: DocumentDoc, level: Level) {
  const text = await loadDocumentText(doc);
  assertHasText(text);
  const { data, metas } = await mapReduce(S.revisionNotesSchema, text, (i) => P.revisionNotesPrompt(level, coverageNote(text, i)));
  return StudyMaterial.create({
    documentId: doc._id,
    ownerId: doc.ownerId,
    materialType: 'revision_notes' satisfies MaterialType,
    title: `Revision notes — ${doc.title}`,
    content: { ...data, explanationLevel: level },
    sourceReferences: collectPageRefs(data),
    modelMeta: mergeMetas(metas),
  });
}

/* ---------- chat (RAG) ---------- */

export async function answerDocumentQuestion(doc: DocumentDoc, input: { conversationId?: string; message: string; regenerateMessageId?: string; onToken?: (d: string) => void }) {
  // 1. conversation
  let conversation = input.conversationId ? await Conversation.findOne({ _id: input.conversationId, documentId: doc._id, ownerId: doc.ownerId }) : null;
  if (input.conversationId && !conversation) throw AppError.notFound('Conversation not found.');
  if (!conversation) {
    conversation = await Conversation.create({ documentId: doc._id, ownerId: doc.ownerId, title: input.message.slice(0, 80) });
  }

  // 2. history (bounded)
  const history = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1 }).limit(8).lean();
  history.reverse();

  // 3. retrieval — question plus a little recent context for follow-ups
  const retrievalQuery = [input.message, ...history.filter((h) => h.role === 'user').slice(-2).map((h) => h.content)].join(' ');
  const chunks = await retrieveChunks(String(doc._id), retrievalQuery, 6);
  const excerpts = chunks.map((c) => `[Excerpt chunk=${c.chunkIndex} pages=${c.pageStart}-${c.pageEnd}]\n${c.text}`).join('\n\n');

  // 4. model call
  const messages: ChatMessage[] = [
    { role: 'system', content: `${P.SYSTEM_BASE}\n\n${P.chatPrompt()}` },
    ...history.filter((h) => h.role !== 'system').map((h) => ({ role: h.role as 'user' | 'assistant', content: h.role === 'assistant' ? h.content : h.content })),
    { role: 'user', content: `${P.docBlock(excerpts || '(no relevant excerpts were found for this question)')}\n\nQuestion: ${input.message}` },
  ];

  let data: S.ChatOutput | null = null;
  let result: CompletionResult | null = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    result = await complete({ messages, json: true });
    try {
      const parsed = S.chatOutputSchema.safeParse(parseJsonObject(result.text));
      if (parsed.success) data = parsed.data;
      else messages.push({ role: 'assistant', content: result.text.slice(0, 4000) }, { role: 'user', content: 'Return ONLY the JSON object in the required shape.' });
    } catch {
      messages.push({ role: 'user', content: 'Your reply was not valid JSON. Return ONLY a single JSON object.' });
    }
  }
  if (!data || !result) {
    // Last resort: use the raw text as the answer, with no citations.
    data = { answer: result?.text ?? 'The model returned no answer.', foundInDocument: false, citations: [] };
  }

  // 5. verify citations point to real retrieved chunks and pages
  const byIndex = new Map(chunks.map((c) => [c.chunkIndex, c]));
  const verified = data.citations
    .filter((c) => byIndex.has(c.chunkIndex))
    .map((c) => {
      const chunk = byIndex.get(c.chunkIndex)!;
      const page = c.page >= chunk.pageStart && c.page <= chunk.pageEnd ? c.page : chunk.pageStart;
      return { pageNumber: page, chunkIndex: c.chunkIndex, excerpt: (c.excerpt && chunk.text.toLowerCase().includes(c.excerpt.toLowerCase().slice(0, 40)) ? c.excerpt : chunk.text.slice(0, 220)).slice(0, 600) };
    });
  const dedup = verified.filter((v, i, arr) => arr.findIndex((x) => x.chunkIndex === v.chunkIndex) === i);
  const foundInDocument = data.foundInDocument && dedup.length > 0;

  // 6. persist
  const userMsg = await Message.create({ conversationId: conversation._id, documentId: doc._id, ownerId: doc.ownerId, role: 'user', content: input.message });
  const assistantMsg = await Message.create({
    conversationId: conversation._id,
    documentId: doc._id,
    ownerId: doc.ownerId,
    role: 'assistant',
    content: data.answer,
    sourceReferences: dedup,
    foundInDocument,
    modelMeta: toModelMeta(result!),
    regeneratedFrom: input.regenerateMessageId,
  });
  conversation.messageCount = await Message.countDocuments({ conversationId: conversation._id });
  conversation.lastMessageAt = new Date();
  if (conversation.title === 'New conversation') conversation.title = input.message.slice(0, 80);
  await conversation.save();

  return { conversation, userMessage: userMsg, assistantMessage: assistantMsg, retrievedChunks: chunks.map((c) => ({ chunkIndex: c.chunkIndex, pageStart: c.pageStart, pageEnd: c.pageEnd, score: Number(c.score.toFixed(3)) })) };
}

export async function suggestQuestions(doc: DocumentDoc): Promise<string[]> {
  const text = await loadDocumentText(doc, 6000, 1);
  if (text.isEmpty) return [];
  const { data } = await structured(S.suggestedQuestionsSchema, P.SUGGESTED_QUESTIONS_PROMPT, P.docBlock(text.parts[0]));
  return data.questions;
}
