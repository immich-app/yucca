import type { Messages } from '@lingui/core';
import { messages as defaultMessages } from './locales/en';

export { messages as defaultMessages } from './locales/en';

const loaders: Record<string, () => Promise<{ messages: Messages }>> = {
  'en-XA': () => import('./locales/en-XA'),
};

export const loadMessages = async (lang: string): Promise<Messages> => {
  const loader = loaders[lang];
  if (!loader) {
    return defaultMessages;
  }

  const { messages } = await loader();
  return messages;
};
