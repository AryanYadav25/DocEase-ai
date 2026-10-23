import {
  Conversation,
  DocumentModel,
  Feedback,
  Message,
  StudyMaterial,
  Summary,
  User,
  toPublicDocument,
  toPublicStudyMaterial,
  toPublicSummary,
  toPublicUser,
} from '../models/index.js';
import { changePassword, clearSessionCookie, setSessionCookie, signSession, verifyPassword } from '../services/auth/authService.js';
import { permanentlyDeleteDocument } from '../services/documents/documentService.js';
import { AppError } from '../utils/errors.js';
import { asyncHandler, ok } from '../utils/http.js';

export const getMe = asyncHandler(async (req, res) => {
  ok(res, { user: toPublicUser(req.user!.doc) });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = req.user!.doc;
  const body = req.body as { displayName?: string; preferences?: Record<string, unknown> };
  if (body.displayName !== undefined) user.displayName = body.displayName;
  if (body.preferences) {
    user.set('preferences', { ...JSON.parse(JSON.stringify(user.preferences ?? {})), ...body.preferences });
  }
  await user.save();
  ok(res, { user: toPublicUser(user) });
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await changePassword(req.user!.id, currentPassword, newPassword);
  // Re-issue the cookie so the current session survives the sessionVersion bump.
  setSessionCookie(res, signSession(user));
  ok(res, { changed: true, message: 'Password updated. Other sessions have been signed out.' });
});

export const deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw AppError.notFound('User not found.');
  const { password } = req.body as { password: string };
  if (!(await verifyPassword(user.passwordHash, password))) throw AppError.badRequest('Your password is incorrect.');

  // Deletion workflow: every document (including trashed ones) and all derived data.
  const docs = await DocumentModel.find({ ownerId: user._id });
  for (const doc of docs) await permanentlyDeleteDocument(doc);
  await Promise.all([
    Summary.deleteMany({ ownerId: user._id }),
    Message.deleteMany({ ownerId: user._id }),
    Conversation.deleteMany({ ownerId: user._id }),
    StudyMaterial.deleteMany({ ownerId: user._id }),
    Feedback.updateMany({ ownerId: user._id }, { $unset: { ownerId: 1, contactEmail: 1 } }),
  ]);
  await user.deleteOne();
  clearSessionCookie(res);
  ok(res, { deleted: true });
});

/** Data export: everything we hold about the user, as JSON (no internal storage keys). */
export const exportMyData = asyncHandler(async (req, res) => {
  const ownerId = req.user!.id;
  const [docs, summaries, materials, conversations] = await Promise.all([
    DocumentModel.find({ ownerId }),
    Summary.find({ ownerId }),
    StudyMaterial.find({ ownerId }),
    Conversation.find({ ownerId }),
  ]);
  const messages = await Message.find({ ownerId }).sort({ createdAt: 1 }).lean();
  const payload = {
    exportedAt: new Date().toISOString(),
    user: toPublicUser(req.user!.doc),
    documents: docs.map(toPublicDocument),
    summaries: summaries.map(toPublicSummary),
    studyMaterials: materials.map(toPublicStudyMaterial),
    conversations: conversations.map((c) => ({
      id: String(c._id),
      documentId: String(c.documentId),
      title: c.title,
      createdAt: c.createdAt,
      messages: messages.filter((m) => String(m.conversationId) === String(c._id)).map((m) => ({ role: m.role, content: m.content, sourceReferences: m.sourceReferences, createdAt: m.createdAt })),
    })),
  };
  res.setHeader('Content-Disposition', `attachment; filename="docuease-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload, null, 2));
});

/** Dashboard statistics computed from real records. */
export const dashboard = asyncHandler(async (req, res) => {
  const ownerId = req.user!.id;
  const [totalDocuments, processedDocuments, processingDocuments, failedDocuments, favorites, trashed, summaries, materials, conversations, recentDocs, storageDocs] = await Promise.all([
    DocumentModel.countDocuments({ ownerId, deletedAt: null }),
    DocumentModel.countDocuments({ ownerId, deletedAt: null, processingStatus: { $in: ['completed', 'completed_with_warnings'] } }),
    DocumentModel.countDocuments({ ownerId, deletedAt: null, processingStatus: { $in: ['queued', 'processing', 'ocr_in_progress', 'indexing'] } }),
    DocumentModel.countDocuments({ ownerId, deletedAt: null, processingStatus: 'failed' }),
    DocumentModel.countDocuments({ ownerId, deletedAt: null, isFavorite: true }),
    DocumentModel.countDocuments({ ownerId, deletedAt: { $ne: null } }),
    Summary.countDocuments({ ownerId }),
    StudyMaterial.countDocuments({ ownerId }),
    Conversation.countDocuments({ ownerId }),
    DocumentModel.find({ ownerId, deletedAt: null }).sort({ createdAt: -1 }).limit(6),
    DocumentModel.find({ ownerId }).select('fileSize').lean(),
  ]);
  const storageBytes = storageDocs.reduce((s, d) => s + (d.fileSize || 0), 0);

  const [recentSummaries, recentMaterials, recentConversations] = await Promise.all([
    Summary.find({ ownerId }).sort({ createdAt: -1 }).limit(5).select('documentId summaryType createdAt').lean(),
    StudyMaterial.find({ ownerId }).sort({ createdAt: -1 }).limit(5).select('documentId materialType title createdAt').lean(),
    Conversation.find({ ownerId }).sort({ updatedAt: -1 }).limit(5).select('documentId title updatedAt').lean(),
  ]);
  const docTitles = new Map(recentDocs.map((d) => [String(d._id), d.title]));
  const missingIds = [...new Set([...recentSummaries, ...recentMaterials, ...recentConversations].map((x) => String(x.documentId)).filter((id) => !docTitles.has(id)))];
  if (missingIds.length) {
    const extra = await DocumentModel.find({ _id: { $in: missingIds }, ownerId }).select('title').lean();
    for (const d of extra) docTitles.set(String(d._id), d.title);
  }
  const activity = [
    ...recentDocs.map((d) => ({ type: 'upload' as const, documentId: String(d._id), documentTitle: d.title, label: `Uploaded "${d.title}"`, at: d.createdAt })),
    ...recentSummaries.map((s) => ({ type: 'summary' as const, documentId: String(s.documentId), documentTitle: docTitles.get(String(s.documentId)) ?? 'Document', label: `Generated ${s.summaryType.replace('_', ' ')}`, at: s.createdAt })),
    ...recentMaterials.map((m) => ({ type: 'study' as const, documentId: String(m.documentId), documentTitle: docTitles.get(String(m.documentId)) ?? 'Document', label: `Created ${m.materialType.replace('_', ' ')}`, at: m.createdAt })),
    ...recentConversations.map((c) => ({ type: 'chat' as const, documentId: String(c.documentId), documentTitle: docTitles.get(String(c.documentId)) ?? 'Document', label: `Chatted: "${c.title}"`, at: c.updatedAt })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  ok(res, {
    stats: { totalDocuments, processedDocuments, processingDocuments, failedDocuments, favorites, trashed, summaries, studyMaterials: materials, conversations, storageBytes },
    recentDocuments: recentDocs.map(toPublicDocument),
    activity,
  });
});

export const submitFeedback = asyncHandler(async (req, res) => {
  const body = req.body as { category: string; rating?: number; comments: string; documentId?: string; contactEmail?: string };
  const feedback = await Feedback.create({
    ownerId: req.user?.id,
    documentId: body.documentId,
    category: body.category,
    rating: body.rating,
    comments: body.comments,
    contactEmail: body.contactEmail ?? req.user?.doc.email,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 400),
  });
  ok(res, { id: String(feedback._id), received: true }, 201);
});
