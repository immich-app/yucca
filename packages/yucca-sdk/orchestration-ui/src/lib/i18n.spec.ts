import { defaultMessages, loadMessages } from '$lib/i18n';
import { gt, locale } from 'svelte-i18n-lingui';
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

  it('substitutes named placeholders in a translated message', async () => {
    locale.set('en-XA', await loadMessages('en-XA'));
    expect(
      gt({ message: 'Configure {name}', values: { name: 'Photos' } }),
    ).toBe('Ćōńƒĩĝũŕē Photos');
  });
});
