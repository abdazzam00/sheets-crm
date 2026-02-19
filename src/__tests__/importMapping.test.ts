import { describe, expect, test } from 'vitest';
import { guessMappingHeuristics } from '@/lib/importMapping';

describe('guessMappingHeuristics', () => {
  test('maps custom headers: Website URL, Executive names, Top Executive Email', () => {
    const headers = ['Website URL', 'Executive names', 'Top Executive Email', 'Other'];
    const m = guessMappingHeuristics(headers);
    expect(m.domain).toBe('Website URL');
    expect(m.executiveName).toBe('Executive names');
    expect(m.email).toBe('Top Executive Email');
  });
});
