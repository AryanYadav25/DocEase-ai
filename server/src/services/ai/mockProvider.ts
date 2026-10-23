import type { CompletionOptions } from './llmClient.js';

/**
 * Deterministic mock used ONLY by automated tests (AI_PROVIDER=mock). It inspects the
 * prompt to decide which JSON shape to return and echoes real page numbers/chunk
 * indices from the supplied document text so citation validation can be exercised.
 * Every string is prefixed with "[MOCK]" so it can never be mistaken for real output.
 */
export function mockComplete(options: CompletionOptions): string {
  const system = options.messages.find((m) => m.role === 'system')?.content ?? '';
  const user = options.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const pages = [...user.matchAll(/\[Page (\d+)\]/g)].map((m) => Number(m[1]));
  const chunks = [...user.matchAll(/\[Excerpt chunk=(\d+) pages=(\d+)-(\d+)\]/g)].map((m) => ({ chunkIndex: Number(m[1]), page: Number(m[2]) }));
  const firstPage = pages[0] ?? chunks[0]?.page ?? 1;
  const words = user.replace(/<\/?document>/g, '').split(/\s+/).filter((w) => w.length > 4).slice(0, 6);
  const sample = words.join(' ') || 'document';

  const has = (s: string) => system.includes(s);

  if (has('"overview"')) {
    return JSON.stringify({
      overview: `[MOCK] Overview mentioning ${sample}.`,
      mainPurpose: '[MOCK] Main purpose.',
      keyPoints: ['[MOCK] Key point one', '[MOCK] Key point two'],
      importantFacts: ['[MOCK] Fact'],
      importantDates: [{ date: '[MOCK] 2024', meaning: 'mock date', page: firstPage }],
      peopleAndOrganizations: [{ name: '[MOCK] Org', role: 'mock role', page: firstPage }],
      technicalTerms: [{ term: '[MOCK] term', explanation: 'mock explanation', page: firstPage }],
      actionItems: ['[MOCK] Action'],
      unclearOrMissing: [],
      conclusion: '[MOCK] Conclusion.',
    });
  }
  if (has('"summary": "one coherent paragraph"') || has('Merge them into ONE final result')) {
    if (user.includes('"bullets"')) return JSON.stringify({ bullets: ['[MOCK] merged bullet'] });
    return JSON.stringify({ summary: `[MOCK] Paragraph summary about ${sample}.` });
  }
  if (has('"bullets"')) return JSON.stringify({ bullets: ['[MOCK] Bullet one', '[MOCK] Bullet two'] });
  if (has('"sections"')) return JSON.stringify({ sections: [{ title: '[MOCK] Section', summary: 'mock', pageStart: firstPage, pageEnd: firstPage }] });
  if (has('"headline"')) return JSON.stringify({ headline: '[MOCK] Headline', summary: '[MOCK] Executive summary', recommendations: ['[MOCK] Do X'] });
  if (has('"takeaways"')) return JSON.stringify({ takeaways: ['[MOCK] Takeaway'] });
  if (has('"quotes"')) return JSON.stringify({ quotes: [{ quote: `[MOCK] ${sample}`, whyItMatters: 'mock', page: firstPage }] });
  if (has('"notFound"')) {
    return JSON.stringify({
      names: [{ value: '[MOCK] Name', context: 'mock', page: firstPage }],
      dates: [],
      amounts: [{ value: '[MOCK] $100', context: 'mock', page: firstPage }],
      deadlines: [],
      requirements: [{ value: '[MOCK] Requirement', page: firstPage }],
      eligibilityCriteria: [],
      responsibilities: [],
      definitions: [],
      tasks: [],
      warnings: [],
      notFound: ['deadlines'],
    });
  }
  if (has('"terms"')) return JSON.stringify({ terms: [{ term: '[MOCK] term', simpleDefinition: 'mock', inContext: 'mock', exampleSentence: 'mock', page: firstPage }] });
  if (has('"translation"')) return JSON.stringify({ translation: `[MOCK translation] ${sample}`, preservedTerms: [], notes: [] });
  if (has('"flashcards"')) {
    return JSON.stringify({ flashcards: Array.from({ length: 5 }, (_, i) => ({ front: `[MOCK] Q${i + 1}`, back: `[MOCK] A${i + 1}`, page: firstPage })) });
  }
  if (has('"questions": [') && has('"correctOptionIndex"')) {
    return JSON.stringify({
      questions: [
        { type: 'multiple_choice', question: '[MOCK] Which?', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 1, answer: 'B', explanation: 'mock', page: firstPage },
        { type: 'short_answer', question: '[MOCK] Why?', answer: 'Because', explanation: 'mock', page: firstPage },
      ],
    });
  }
  if (has('"keyDefinitions"')) return JSON.stringify({ keyDefinitions: [{ term: '[MOCK] term', definition: 'mock', page: firstPage }], notes: [{ heading: '[MOCK] Topic', points: ['mock'], page: firstPage }] });
  if (has('"foundInDocument"')) {
    const found = chunks.length > 0;
    return JSON.stringify({
      answer: found ? `[MOCK] Answer based on ${sample}.` : '[MOCK] Not found in the document.',
      foundInDocument: found,
      citations: chunks.slice(0, 2).map((c) => ({ chunkIndex: c.chunkIndex, page: c.page, excerpt: 'mock' })),
    });
  }
  if (has('propose 5 specific')) return JSON.stringify({ questions: ['[MOCK] What is this about?', '[MOCK] Who is involved?'] });
  if (has('"answer": "markdown-formatted answer"')) return JSON.stringify({ answer: `[MOCK] ${sample}`, notes: [] });
  return JSON.stringify({ answer: '[MOCK] generic', notes: [] });
}
