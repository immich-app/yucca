export type MirrorMessage = {
  id: string;
  authorId: string;
  authorName: string;
  fromBot: boolean;
  content: string;
  attachments: { name: string; url: string }[];
};

export type MirrorBatch =
  | { kind: 'customer'; lastMessageId: string; message: MirrorMessage }
  | { kind: 'staff'; lastMessageId: string; messages: MirrorMessage[] };

export const groupForMirror = (messages: MirrorMessage[], customerId: string): MirrorBatch[] => {
  const batches: MirrorBatch[] = [];
  for (const message of messages) {
    if (message.fromBot) {
      continue;
    }
    if (message.authorId === customerId) {
      batches.push({ kind: 'customer', lastMessageId: message.id, message });
      continue;
    }
    const last = batches.at(-1);
    if (last?.kind === 'staff') {
      last.messages.push(message);
      last.lastMessageId = message.id;
    } else {
      batches.push({ kind: 'staff', lastMessageId: message.id, messages: [message] });
    }
  }
  return batches;
};

export const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export const toHtmlBody = (value: string): string => escapeHtml(value).replaceAll('\n', '<br>');
