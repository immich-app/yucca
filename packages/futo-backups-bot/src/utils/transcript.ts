export type TranscriptMessage = {
  createdAt: Date;
  author: string;
  content: string;
  attachmentUrls: string[];
};

export const formatTranscript = (name: string, messages: TranscriptMessage[]): string => {
  const lines = [`# ${name}`, ''];
  const ordered = messages.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const message of ordered) {
    lines.push(`[${message.createdAt.toISOString()}] ${message.author}: ${message.content}`);
    for (const url of message.attachmentUrls) {
      lines.push(`    attachment: ${url}`);
    }
  }
  return lines.join('\n') + '\n';
};
