const STOPWORDS = new Set(
  `a an and are as at be but by for from had has have he her his i if in into is it its of on or our she so than that the their them then there these they this to was we were what when where which who will with you your not no yes can could would should may might do does did been being am about above after again against all any because before below between both down during each few further here how more most off once only other out over own same some such through too under until up very while why`.split(
    /\s+/,
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9ऀ-ॿ一-鿿]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Light stemming: strips common English suffixes so "payments" matches "payment". */
export function stem(token: string): string {
  if (token.length <= 4) return token;
  return token
    .replace(/(ings|ies|ness|ment|tion|ions)$/, (m) => (m === 'ies' ? 'y' : m === 'tion' || m === 'ions' ? 'tion' : ''))
    .replace(/(ing|ed|es|ly|s)$/, '')
    .replace(/^$/, token);
}

export function termsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const t of tokenize(text)) seen.add(stem(t));
  return [...seen];
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface Chunk {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  text: string;
}

/**
 * Split page texts into overlapping chunks (~1400 chars) that never lose page
 * references. Chunks may span pages when pages are short.
 */
export function chunkPages(pages: Array<{ pageNumber: number; text: string }>, target = 1400, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  let buf = '';
  let bufStart = 0;
  let bufEnd = 0;

  const flush = () => {
    const text = buf.trim();
    if (text) chunks.push({ chunkIndex: chunks.length, pageStart: bufStart, pageEnd: bufEnd, text });
  };

  for (const page of pages) {
    const paragraphs = page.text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/).map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      const pieces = para.length > target * 1.5 ? hardSplit(para, target) : [para];
      for (const piece of pieces) {
        if (!buf) {
          bufStart = page.pageNumber;
        }
        if (buf && buf.length + piece.length + 1 > target) {
          flush();
          const tail = buf.slice(-overlap);
          buf = tail.includes(' ') ? tail.slice(tail.indexOf(' ') + 1) + '\n' : '';
          bufStart = buf ? bufEnd : page.pageNumber;
        }
        buf += (buf && !buf.endsWith('\n') ? '\n' : '') + piece;
        bufEnd = page.pageNumber;
      }
    }
  }
  flush();
  return chunks;
}

function hardSplit(text: string, size: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + size);
    const space = text.lastIndexOf(' ', end);
    if (space > i + size / 2) end = space;
    out.push(text.slice(i, end).trim());
    i = end;
  }
  return out.filter(Boolean);
}
