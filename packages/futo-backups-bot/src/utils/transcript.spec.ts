import { formatTranscript } from 'src/utils/transcript';

describe('formatTranscript', () => {
  it('orders messages oldest first and lists attachments', () => {
    const transcript = formatTranscript('ticket-someone', [
      {
        createdAt: new Date('2026-08-25T10:05:00.000Z'),
        author: 'staff',
        content: 'On it.',
        attachmentUrls: [],
      },
      {
        createdAt: new Date('2026-08-25T10:00:00.000Z'),
        author: 'someone',
        content: 'My backup fails.',
        attachmentUrls: ['https://cdn.example/log.txt'],
      },
    ]);

    expect(transcript).toBe(
      [
        '# ticket-someone',
        '',
        '[2026-08-25T10:00:00.000Z] someone: My backup fails.',
        '    attachment: https://cdn.example/log.txt',
        '[2026-08-25T10:05:00.000Z] staff: On it.',
        '',
      ].join('\n'),
    );
  });
});
