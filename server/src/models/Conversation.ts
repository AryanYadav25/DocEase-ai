import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { modelMetaSchema, sourceRefSchema } from './Summary.js';

const conversationSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'New conversation', maxlength: 200 },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date },
  },
  { timestamps: true },
);

conversationSchema.index({ ownerId: 1, documentId: 1, updatedAt: -1 });

export type ConversationAttrs = InferSchemaType<typeof conversationSchema>;
export type ConversationDoc = HydratedDocument<ConversationAttrs>;
export const Conversation = mongoose.model('Conversation', conversationSchema);

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true, maxlength: 20000 },
    sourceReferences: { type: [sourceRefSchema], default: [] },
    foundInDocument: { type: Boolean },
    modelMeta: { type: modelMetaSchema },
    feedback: { type: String, enum: ['up', 'down', null], default: null },
    regeneratedFrom: { type: Schema.Types.ObjectId, ref: 'Message' },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ ownerId: 1, documentId: 1 });

export type MessageAttrs = InferSchemaType<typeof messageSchema>;
export type MessageDoc = HydratedDocument<MessageAttrs>;
export const Message = mongoose.model('Message', messageSchema);

export function toPublicConversation(c: ConversationDoc) {
  return {
    id: String(c._id),
    documentId: String(c.documentId),
    title: c.title,
    messageCount: c.messageCount,
    lastMessageAt: c.lastMessageAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function toPublicMessage(m: MessageDoc) {
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    role: m.role,
    content: m.content,
    sourceReferences: m.sourceReferences,
    foundInDocument: m.foundInDocument ?? null,
    modelMeta: m.modelMeta ?? null,
    feedback: m.feedback ?? null,
    createdAt: m.createdAt,
  };
}
