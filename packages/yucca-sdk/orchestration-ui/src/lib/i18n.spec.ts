import { defaultMessages, loadMessages } from '$lib/i18n';
import { describe, expect, it } from 'vitest';

describe('loadMessages', () => {
  it('falls back to English for a language without a catalogue', async () => {
    const messages = await loadMessages('xx');
    expect(messages).toBe(defaultMessages);
  });

  it('loads the catalogue for a supported language', async () => {
    const messages = await loadMessages('en-XA');
    expect(messages).not.toBe(defaultMessages);
    expect(Object.keys(messages)).toEqual(Object.keys(defaultMessages));
  });
});
