import { DocumentChunk, type DocumentChunkDoc } from '../../models/index.js';
import { stem, tokenize } from './textUtils.js';

export interface RetrievedChunk {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  text: string;
  score: number;
}

/**
 * Keyword retrieval with BM25 scoring over the pre-computed chunk terms.
 * Vector search is intentionally not required: this works on any MongoDB (including the
 * free Atlas tier and local instances) without extra infrastructure. The candidate set
 * is narrowed with the {documentId, terms} index before scoring in memory.
 */
export async function retrieveChunks(documentId: string, query: string, limit = 6): Promise<RetrievedChunk[]> {
  const queryTerms = [...new Set(tokenize(query).map(stem))];
  if (queryTerms.length === 0) {
    const first = await DocumentChunk.find({ documentId }).sort({ chunkIndex: 1 }).limit(limit).lean();
    return first.map((c) => ({ chunkIndex: c.chunkIndex, pageStart: c.pageStart, pageEnd: c.pageEnd, text: c.text, score: 0 }));
  }

  const [candidates, lengths] = await Promise.all([
    DocumentChunk.find({ documentId, terms: { $in: queryTerms } }).lean(),
    DocumentChunk.find({ documentId }).select('tokenEstimate').lean(),
  ]);

  if (candidates.length === 0) return [];

  const N = Math.max(lengths.length, 1);
  const avgLen = lengths.length ? lengths.reduce((s, c) => s + (c.tokenEstimate || 0), 0) / lengths.length || 350 : 350;
  const k1 = 1.4;
  const b = 0.75;

  // document frequency per query term (within this document's chunks)
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    df.set(term, candidates.filter((c) => c.terms.includes(term)).length);
  }

  const scored = candidates.map((c) => {
    const tokens = tokenize(c.text).map(stem);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const len = c.tokenEstimate || tokens.length;
    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / avgLen)));
    }
    // Phrase bonus: exact query substring present.
    if (query.length > 6 && c.text.toLowerCase().includes(query.toLowerCase())) score += 2;
    return { chunkIndex: c.chunkIndex, pageStart: c.pageStart, pageEnd: c.pageEnd, text: c.text, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b2) => b2.score - a.score || a.chunkIndex - b2.chunkIndex)
    .slice(0, limit);
}

export async function getChunksInOrder(documentId: string, maxChars: number): Promise<{ chunks: DocumentChunkDoc[]; truncated: boolean; total: number }> {
  const total = await DocumentChunk.countDocuments({ documentId });
  const cursor = DocumentChunk.find({ documentId }).sort({ chunkIndex: 1 }).cursor();
  const chunks: DocumentChunkDoc[] = [];
  let used = 0;
  let truncated = false;
  for await (const c of cursor) {
    if (used + c.text.length > maxChars) {
      truncated = true;
      break;
    }
    chunks.push(c);
    used += c.text.length;
  }
  return { chunks, truncated, total };
}
