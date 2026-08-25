import { AnyThreadChannel, ThreadChannel } from 'discord.js';
import { SweepService } from 'src/services/sweep.service';
import { Mocks, newMocks } from '../../test/mocks';

const DAY_MS = 24 * 60 * 60 * 1000;

const thread = (name: string, archivedAt: Date) =>
  Object.defineProperties(Object.create(ThreadChannel.prototype) as ThreadChannel, {
    id: { value: `${name}-id` },
    name: { value: name },
    archivedAt: { value: archivedAt },
  }) as AnyThreadChannel;

describe(SweepService.name, () => {
  let sut: SweepService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new SweepService(mocks.logger as never, mocks.discord as never, mocks.storage as never);
  });

  it('does nothing when transcript storage is not configured', async () => {
    mocks.storage.enabled = false;

    await sut.sweep();

    expect(mocks.discord.listClosedTicketThreads).not.toHaveBeenCalled();
  });

  it('uploads a transcript and deletes threads past retention', async () => {
    const old = thread('ticket-old', new Date(Date.now() - 20 * DAY_MS));
    const recent = thread('ticket-recent', new Date(Date.now() - DAY_MS));
    mocks.discord.listClosedTicketThreads.mockResolvedValue([old, recent]);
    mocks.discord.fetchAllMessages.mockResolvedValue([]);

    await sut.sweep();

    expect(mocks.storage.put).toHaveBeenCalledTimes(1);
    expect(mocks.storage.put).toHaveBeenCalledWith(expect.stringContaining('ticket-old'), expect.any(String));
    expect(mocks.discord.deleteThread).toHaveBeenCalledTimes(1);
    expect(mocks.discord.deleteThread).toHaveBeenCalledWith(old);
  });

  it('keeps the thread when the upload fails', async () => {
    const old = thread('ticket-old', new Date(Date.now() - 20 * DAY_MS));
    mocks.discord.listClosedTicketThreads.mockResolvedValue([old]);
    mocks.discord.fetchAllMessages.mockResolvedValue([]);
    mocks.storage.put.mockRejectedValue(new Error('s3 down'));

    await sut.sweep();

    expect(mocks.discord.deleteThread).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
