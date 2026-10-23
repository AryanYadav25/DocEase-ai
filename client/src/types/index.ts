export type ExplanationLevel = 'very_simple' | 'beginner' | 'standard' | 'detailed';
export type OutputLength = 'short' | 'medium' | 'detailed';
export type Theme = 'light' | 'dark' | 'system';

export interface UserPreferences {
  theme: Theme;
  defaultExplanationLevel: ExplanationLevel;
  defaultSummaryLength: OutputLength;
  preferredLanguage: string;
  autoOcrScannedPages: boolean;
  enhanceImagesBeforeOcr: boolean;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  preferences: UserPreferences;
  createdAt?: string;
}

export type ProcessingStatus = 'queued' | 'uploading' | 'processing' | 'ocr_in_progress' | 'indexing' | 'completed' | 'completed_with_warnings' | 'failed';
export type FileKind = 'pdf' | 'image' | 'text' | 'docx';
export type OcrStatus = 'not_needed' | 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed';

export interface ProcessingWarning {
  code: string;
  message: string;
  pageNumber?: number | null;
}

export interface ExtractedTextMeta {
  totalChars: number;
  textPages: number;
  ocrPages: number;
  emptyPages: number;
  chunkCount: number;
}

export interface DocumentItem {
  id: string;
  title: string;
  description: string;
  originalFilename: string;
  mimeType: string;
  fileKind: FileKind;
  fileSize: number;
  pageCount: number;
  processingStatus: ProcessingStatus;
  processingStage: string;
  processingProgress: number;
  processingError: string | null;
  processingWarnings: ProcessingWarning[];
  extractedTextMeta: ExtractedTextMeta;
  ocrStatus: OcrStatus;
  language: string;
  tags: string[];
  isFavorite: boolean;
  lastViewedPage: number;
  lastOpenedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPage {
  id: string;
  pageNumber: number;
  text: string;
  charCount: number;
  extractionMethod: 'text_layer' | 'ocr' | 'docx' | 'plain_text' | 'manual' | 'none';
  ocr: { attempted: boolean; confidence?: number; lowConfidenceWords?: number; engine?: string; durationMs?: number; error?: string };
  warnings: string[];
  editedByUser: boolean;
  width: number | null;
  height: number | null;
  updatedAt: string;
}

export interface SourceReference {
  pageNumber: number;
  chunkIndex?: number;
  excerpt?: string;
}

export interface ModelMeta {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  isMock: boolean;
}

export type SummaryType = 'simplify' | 'paragraph' | 'bullets' | 'sections' | 'executive' | 'takeaways' | 'quotes' | 'key_information' | 'vocabulary' | 'translation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Summary<T = any> {
  id: string;
  documentId: string;
  summaryType: SummaryType;
  explanationLevel: ExplanationLevel | null;
  outputLength: OutputLength | null;
  language: string | null;
  content: T;
  sourceReferences: SourceReference[];
  modelMeta: ModelMeta | null;
  coverage: { pagesCovered: number; totalPages: number; truncated: boolean };
  createdAt: string;
}

export interface SimplifyContent {
  overview: string;
  mainPurpose: string;
  keyPoints: string[];
  importantFacts: string[];
  importantDates: Array<{ date: string; meaning: string; page?: number | null }>;
  peopleAndOrganizations: Array<{ name: string; role: string; page?: number | null }>;
  technicalTerms: Array<{ term: string; explanation: string; page?: number | null }>;
  actionItems: string[];
  unclearOrMissing: string[];
  conclusion: string;
}

export interface KeyInformationContent {
  names: Array<{ value: string; context: string; page?: number | null }>;
  dates: Array<{ value: string; context: string; page?: number | null }>;
  amounts: Array<{ value: string; context: string; page?: number | null }>;
  deadlines: Array<{ value: string; context: string; page?: number | null }>;
  requirements: Array<{ value: string; page?: number | null }>;
  eligibilityCriteria: Array<{ value: string; page?: number | null }>;
  responsibilities: Array<{ party: string; value: string; page?: number | null }>;
  definitions: Array<{ term: string; definition: string; page?: number | null }>;
  tasks: Array<{ value: string; page?: number | null }>;
  warnings: Array<{ value: string; page?: number | null }>;
  notFound: string[];
}

export interface VocabularyContent {
  terms: Array<{ term: string; simpleDefinition: string; inContext: string; exampleSentence: string; page?: number | null }>;
}

export interface TranslationContent {
  translation: string;
  preservedTerms: string[];
  notes: string[];
  original: string;
  sourceLabel: string;
  truncated: boolean;
}

export interface Conversation {
  id: string;
  documentId: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sourceReferences: SourceReference[];
  foundInDocument: boolean | null;
  modelMeta: ModelMeta | null;
  feedback: 'up' | 'down' | null;
  createdAt: string;
}

export interface ChatResult {
  conversation: Conversation;
  userMessage: Message;
  assistantMessage: Message;
  retrievedChunks: Array<{ chunkIndex: number; pageStart: number; pageEnd: number; score: number }>;
}

export type MaterialType = 'flashcards' | 'quiz' | 'revision_notes';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  page?: number | null;
}

export interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  options?: string[];
  correctOptionIndex?: number | null;
  answer: string;
  explanation: string;
  page?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StudyMaterial<T = any> {
  id: string;
  documentId: string;
  materialType: MaterialType;
  title: string;
  content: T;
  progress: Record<string, unknown>;
  sourceReferences: SourceReference[];
  modelMeta: ModelMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadPolicy {
  maxFileSizeMb: number;
  maxFileSizeBytes: number;
  maxPageCount: number;
  maxImageDimension: number;
  maxFilesPerUpload: number;
  acceptedExtensions: string[];
  acceptedMimeTypes: string[];
  trashRetentionDays: number;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  providerLabel: string;
  model: string;
  baseUrl: string | null;
  problem: string | null;
  isMock: boolean;
  supportsStreaming: boolean;
  translationLanguages: string[];
  limits: { maxInputChars: number; maxOutputTokens: number; requestsPerHour: number };
}

export interface DashboardData {
  stats: {
    totalDocuments: number;
    processedDocuments: number;
    processingDocuments: number;
    failedDocuments: number;
    favorites: number;
    trashed: number;
    summaries: number;
    studyMaterials: number;
    conversations: number;
    storageBytes: number;
  };
  recentDocuments: DocumentItem[];
  activity: Array<{ type: 'upload' | 'summary' | 'study' | 'chat'; documentId: string; documentTitle: string; label: string; at: string }>;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
