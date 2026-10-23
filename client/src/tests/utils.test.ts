import { describe, expect, it } from 'vitest';
import { formatBytes, isProcessing, isReady, toCsv, slugFilename } from '@/lib/utils';

describe('utils', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(26214400)).toBe('25 MB');
  });
  it('classifies processing states', () => {
    expect(isProcessing('ocr_in_progress')).toBe(true);
    expect(isReady('completed_with_warnings')).toBe(true);
    expect(isReady('failed')).toBe(false);
  });
  it('escapes CSV values', () => {
    expect(toCsv([{ a: 'x,y', b: 'he said "hi"' }])).toBe('a,b\n"x,y","he said ""hi"""');
  });
  it('builds safe filenames', () => {
    expect(slugFilename('My Doc: Final (v2)', 'md')).toBe('my-doc-final-v2.md');
  });
});
