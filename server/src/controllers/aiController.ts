import type { Request } from 'express';
import {
  Conversation,
  Message,
  StudyMaterial,
  Summary,
  toPublicConversation,
  toPublicMessage,
  toPublicStudyMaterial,
  toPublicSummary,
} from '../models/index.js';
import * as ai from '../services/ai/aiService.js';
import { assertAiConfigured, getAiStatus } from '../services/ai/llmClient.js';
import { assertDocumentReady, getOwnedDocument } from '../services/documents/documentService.js';
import { AppError } from '../utils/errors.js';
import { asyncHandler, ok } from '../utils/http.js';

type Level = 'very_simple' | 'beginner' | 'standard' | 'detailed';
type Length = 'short' | 'medium' | 'detailed';

function levelFor(req: Request, override?: Level): Level {
  return override ?? (req.user!.doc.preferences?.defaultExplanationLevel as Level) ?? 'standard';
}
function lengthFor(req: Request, override?: Length): Length {
  return override ?? (req.user!.doc.preferences?.defaultSummaryLength as Length) ?? 'medium';
}

async function readyDoc(req: Request) {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  assertDocumentReady(doc);
  assertAiConfigured();
  return doc;
}

export const status = asyncHandler(async (_req, res) => {
  ok(res, getAiStatus());
});

export const simplify = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const { explanationLevel, outputLength, force } = req.body as { explanationLevel?: Level; outputLength?: Length; force?: boolean };
  const { summary, cached } = await ai.simplifyDocument(doc, levelFor(req, explanationLevel), lengthFor(req, outputLength), force);
  ok(res, { summary: toPublicSummary(summary), cached });
});

export const summarize = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const body = req.body as { summaryType: 'paragraph' | 'bullets' | 'sections' | 'executive' | 'takeaways' | 'quotes'; explanationLevel?: Level; outputLength?: Length; force?: boolean };
  const { summary, cached } = await ai.summarizeDocument(doc, body.summaryType, levelFor(req, body.explanationLevel), lengthFor(req, body.outputLength), body.force);
  ok(res, { summary: toPublicSummary(summary), cached });
});

export const extractInformation = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const { summary, cached } = await ai.extractKeyInformation(doc, (req.body as { force?: boolean }).force);
  ok(res, { summary: toPublicSummary(summary), cached });
});

export const vocabulary = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const { summary, cached } = await ai.buildVocabulary(doc, levelFor(req), (req.body as { force?: boolean }).force);
  ok(res, { summary: toPublicSummary(summary), cached });
});

export const explainSelection = asyncHandler(async (req, res) => {
  await readyDoc(req);
  const body = req.body as { text: string; action: string; question?: string; targetLanguage?: string; pageNumber?: number; explanationLevel?: Level };
  const result = await ai.explainSelection({ ...body, level: levelFor(req, body.explanationLevel) });
  ok(res, result);
});

export const translate = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const body = req.body as { targetLanguage: string; scope: 'text' | 'summary'; text?: string; summaryId?: string; pageNumber?: number };
  const summary = await ai.translateText(doc, body);
  ok(res, { summary: toPublicSummary(summary) });
});

export const flashcards = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const body = req.body as { count: number; explanationLevel?: Level };
  const material = await ai.generateFlashcards(doc, body.count, levelFor(req, body.explanationLevel));
  ok(res, { material: toPublicStudyMaterial(material) }, 201);
});

export const quiz = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const body = req.body as { count: number; mixShortAnswer: boolean; explanationLevel?: Level };
  const material = await ai.generateQuiz(doc, body.count, body.mixShortAnswer, levelFor(req, body.explanationLevel));
  ok(res, { material: toPublicStudyMaterial(material) }, 201);
});

export const revisionNotes = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const material = await ai.generateRevisionNotes(doc, levelFor(req));
  ok(res, { material: toPublicStudyMaterial(material) }, 201);
});

/**
 * Chat. When the client sends `Accept: text/event-stream`, the answer is streamed as
 * server-sent events ("token" events while the model writes, then a final "done" event
 * containing the persisted messages with verified citations). Otherwise plain JSON.
 */
export const chat = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const body = req.body as { conversationId?: string; message: string; regenerateMessageId?: string };
  const wantsStream = (req.headers.accept ?? '').includes('text/event-stream');

  if (!wantsStream) {
    const result = await ai.answerDocumentQuestion(doc, body);
    ok(res, serializeChat(result));
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  try {
    // The model answers in JSON, so raw tokens are not shown verbatim; we stream a
    // "working" progress signal and deliver the parsed answer at the end.
    let streamed = 0;
    const result = await ai.answerDocumentQuestion(doc, {
      ...body,
      onToken: (delta) => {
        streamed += delta.length;
        if (streamed % 40 < delta.length) send('progress', { chars: streamed });
      },
    });
    send('done', serializeChat(result));
  } catch (err) {
    const appErr = err instanceof AppError ? err : AppError.internal('Chat failed.', err);
    send('error', { code: appErr.code, message: appErr.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

function serializeChat(result: Awaited<ReturnType<typeof ai.answerDocumentQuestion>>) {
  return {
    conversation: toPublicConversation(result.conversation),
    userMessage: toPublicMessage(result.userMessage),
    assistantMessage: toPublicMessage(result.assistantMessage),
    retrievedChunks: result.retrievedChunks,
  };
}

export const suggestedQuestions = asyncHandler(async (req, res) => {
  const doc = await readyDoc(req);
  const questions = await ai.suggestQuestions(doc);
  ok(res, { questions });
});

/* ---------- saved results ---------- */

export const listSummaries = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  const summaries = await Summary.find({ documentId: doc._id, ownerId: doc.ownerId }).sort({ createdAt: -1 }).limit(100);
  ok(res, { summaries: summaries.map(toPublicSummary) });
});

export const listStudyMaterials = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  const materials = await StudyMaterial.find({ documentId: doc._id, ownerId: doc.ownerId }).sort({ createdAt: -1 }).limit(100);
  ok(res, { materials: materials.map(toPublicStudyMaterial) });
});

export const listConversations = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  const conversations = await Conversation.find({ documentId: doc._id, ownerId: doc.ownerId }).sort({ updatedAt: -1 }).limit(50);
  ok(res, { conversations: conversations.map(toPublicConversation) });
});

export const createConversation = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  const conversation = await Conversation.create({ documentId: doc._id, ownerId: doc.ownerId });
  ok(res, { conversation: toPublicConversation(conversation) }, 201);
});

/* ---------- conversations (own router) ---------- */

async function ownedConversation(req: Request) {
  const c = await Conversation.findOne({ _id: req.params.id, ownerId: req.user!.id });
  if (!c) throw AppError.notFound('Conversation not found.');
  return c;
}

export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await ownedConversation(req);
  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).limit(500);
  ok(res, { conversation: toPublicConversation(conversation), messages: messages.map(toPublicMessage) });
});

export const postMessage = asyncHandler(async (req, res) => {
  const conversation = await ownedConversation(req);
  const doc = await getOwnedDocument(req.user!.id, String(conversation.documentId));
  assertDocumentReady(doc);
  assertAiConfigured();
  const body = req.body as { message: string; regenerateMessageId?: string };
  const result = await ai.answerDocumentQuestion(doc, { conversationId: String(conversation._id), ...body });
  ok(res, serializeChat(result));
});

export const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await ownedConversation(req);
  await Message.deleteMany({ conversationId: conversation._id });
  await conversation.deleteOne();
  ok(res, { deleted: true });
});

export const clearConversation = asyncHandler(async (req, res) => {
  const conversation = await ownedConversation(req);
  await Message.deleteMany({ conversationId: conversation._id });
  conversation.messageCount = 0;
  conversation.title = 'New conversation';
  await conversation.save();
  ok(res, { conversation: toPublicConversation(conversation) });
});

export const messageFeedback = asyncHandler(async (req, res) => {
  const message = await Message.findOne({ _id: req.params.messageId, ownerId: req.user!.id });
  if (!message) throw AppError.notFound('Message not found.');
  message.feedback = (req.body as { feedback: 'up' | 'down' | null }).feedback;
  await message.save();
  ok(res, { message: toPublicMessage(message) });
});

/* ---------- study materials (own router) ---------- */

export const listAllStudyMaterials = asyncHandler(async (req, res) => {
  const materials = await StudyMaterial.find({ ownerId: req.user!.id }).sort({ createdAt: -1 }).limit(200);
  ok(res, { materials: materials.map(toPublicStudyMaterial) });
});

export const getStudyMaterial = asyncHandler(async (req, res) => {
  const material = await StudyMaterial.findOne({ _id: req.params.id, ownerId: req.user!.id });
  if (!material) throw AppError.notFound('Study material not found.');
  ok(res, { material: toPublicStudyMaterial(material) });
});

export const updateStudyProgress = asyncHandler(async (req, res) => {
  const material = await StudyMaterial.findOne({ _id: req.params.id, ownerId: req.user!.id });
  if (!material) throw AppError.notFound('Study material not found.');
  const incoming = (req.body as { progress: Record<string, unknown> }).progress;
  material.progress = { ...(material.progress as Record<string, unknown>), ...incoming };
  material.markModified('progress');
  await material.save();
  ok(res, { material: toPublicStudyMaterial(material) });
});

export const deleteStudyMaterial = asyncHandler(async (req, res) => {
  const material = await StudyMaterial.findOne({ _id: req.params.id, ownerId: req.user!.id });
  if (!material) throw AppError.notFound('Study material not found.');
  await material.deleteOne();
  ok(res, { deleted: true });
});

export const deleteSummary = asyncHandler(async (req, res) => {
  const summary = await Summary.findOne({ _id: req.params.id, ownerId: req.user!.id });
  if (!summary) throw AppError.notFound('Summary not found.');
  await summary.deleteOne();
  ok(res, { deleted: true });
});
