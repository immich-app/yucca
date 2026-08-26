import { MirrorMessage, escapeHtml, groupForMirror, toHtmlBody } from 'src/utils/mirror';

const message = (id: string, authorId: string, overrides: Partial<MirrorMessage> = {}): MirrorMessage => ({
  id,
  authorId,
  authorName: `user-${authorId}`,
  fromBot: false,
  content: `message ${id}`,
  attachments: [],
  ...overrides,
});

describe('groupForMirror', () => {
  it('emits each customer message as its own batch', () => {
    const batches = groupForMirror([message('1', 'customer'), message('2', 'customer')], 'customer');

    expect(batches).toEqual([
      expect.objectContaining({ kind: 'customer', lastMessageId: '1' }),
      expect.objectContaining({ kind: 'customer', lastMessageId: '2' }),
    ]);
  });

  it('groups consecutive staff messages into one batch', () => {
    const batches = groupForMirror(
      [message('1', 'staff-a'), message('2', 'staff-b'), message('3', 'staff-a')],
      'customer',
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(
      expect.objectContaining({ kind: 'staff', lastMessageId: '3', messages: expect.arrayContaining([]) }),
    );
  });

  it('splits staff groups on customer messages', () => {
    const batches = groupForMirror(
      [message('1', 'staff-a'), message('2', 'customer'), message('3', 'staff-a'), message('4', 'staff-b')],
      'customer',
    );

    expect(batches.map((batch) => batch.kind)).toEqual(['staff', 'customer', 'staff']);
    expect(batches.map((batch) => batch.lastMessageId)).toEqual(['1', '2', '4']);
  });

  it('skips bot messages without breaking staff grouping', () => {
    const batches = groupForMirror(
      [message('1', 'staff-a'), message('2', 'bot', { fromBot: true }), message('3', 'staff-b')],
      'customer',
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(expect.objectContaining({ kind: 'staff', lastMessageId: '3' }));
  });
});

describe('toHtmlBody', () => {
  it('escapes html and converts newlines', () => {
    expect(toHtmlBody('a <b>\nc & d')).toBe('a &lt;b&gt;<br>c &amp; d');
  });
});

describe('escapeHtml', () => {
  it('escapes quotes', () => {
    expect(escapeHtml('"name"')).toBe('&quot;name&quot;');
  });
});
