import { AllowlistService } from 'src/services/allowlist.service';
import { Mocks, newMocks } from '../../test/mocks';

const row = (overrides: object = {}) => ({
  id: 'entry-1',
  email: 'user@example.com',
  inviteCode: 'ABC123DEF4',
  invited: true,
  inviteUsed: false,
  inviteUsedAt: null,
  inviteEmailSentAt: null,
  createdAt: new Date('2026-08-01'),
  ...overrides,
});

describe(AllowlistService.name, () => {
  let mocks: Mocks;
  let sut: AllowlistService;

  beforeEach(() => {
    mocks = newMocks();
    sut = new AllowlistService(mocks.allowlist as never, mocks.email as never, mocks.logger);
  });

  describe('invite', () => {
    it('emails newly invited entries and records the send', async () => {
      const created = row();
      const sent = row({ inviteEmailSentAt: new Date('2026-08-19') });
      mocks.allowlist.create.mockResolvedValue(created as never);
      mocks.allowlist.update.mockResolvedValue(sent as never);
      mocks.email.sendBatch.mockResolvedValue([{ to: created.email, errorCode: 0, message: 'OK' }]);

      const { items } = await sut.invite({ emails: ['User@Example.com'] });

      expect(mocks.email.sendBatch).toHaveBeenCalledWith([
        expect.objectContaining({ to: 'user@example.com', tag: 'invite', subject: "You're invited to FUTO Backups" }),
      ]);
      const [messages] = mocks.email.sendBatch.mock.calls[0];
      expect(messages[0].htmlBody).toContain('ABC123DEF4');
      expect(messages[0].htmlBody).toContain('/login/invite');
      expect(messages[0].textBody).toContain('ABC123DEF4');
      expect(mocks.allowlist.update).toHaveBeenCalledWith('entry-1', { inviteEmailSentAt: expect.any(Date) });
      expect(items).toEqual([sent]);
    });

    it('does not resend to entries that already got their invite email', async () => {
      const delivered = row({ inviteEmailSentAt: new Date('2026-08-02') });
      mocks.allowlist.getByEmail.mockResolvedValue(delivered as never);

      const { items } = await sut.invite({ emails: ['user@example.com'] });

      expect(mocks.email.sendBatch).not.toHaveBeenCalled();
      expect(mocks.allowlist.update).not.toHaveBeenCalled();
      expect(items).toEqual([delivered]);
    });

    it('keeps rejected sends retryable', async () => {
      const created = row();
      mocks.allowlist.create.mockResolvedValue(created as never);
      mocks.email.sendBatch.mockResolvedValue([{ to: created.email, errorCode: 406, message: 'Inactive recipient' }]);

      const { items } = await sut.invite({ emails: ['user@example.com'] });

      expect(mocks.allowlist.update).not.toHaveBeenCalled();
      expect(items).toEqual([created]);
      expect(mocks.logger.warn).toHaveBeenCalled();
    });

    it('returns entries unchanged when the batch send fails outright', async () => {
      const created = row();
      mocks.allowlist.create.mockResolvedValue(created as never);
      mocks.email.sendBatch.mockRejectedValue(new Error('postmark down'));

      const { items } = await sut.invite({ emails: ['user@example.com'] });

      expect(items).toEqual([created]);
      expect(mocks.logger.error).toHaveBeenCalled();
    });
  });

  describe('inviteBatch', () => {
    it('invites the oldest staged entries and emails them', async () => {
      const staged = row({ invited: false });
      const invited = row();
      const sent = row({ inviteEmailSentAt: new Date('2026-08-19') });
      mocks.allowlist.oldestStaged.mockResolvedValue([staged] as never);
      mocks.allowlist.update.mockResolvedValueOnce(invited as never).mockResolvedValueOnce(sent as never);
      mocks.email.sendBatch.mockResolvedValue([{ to: staged.email, errorCode: 0, message: 'OK' }]);

      const { items } = await sut.inviteBatch({ count: 1 });

      expect(mocks.allowlist.update).toHaveBeenNthCalledWith(1, 'entry-1', { invited: true });
      expect(mocks.allowlist.update).toHaveBeenNthCalledWith(2, 'entry-1', { inviteEmailSentAt: expect.any(Date) });
      expect(items).toEqual([sent]);
    });
  });
});
