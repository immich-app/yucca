import { NotFoundException, NotImplementedException } from '@nestjs/common';
import { ColumboService } from 'src/services/columbo.service';
import { Mocks, newMocks } from '../../test/mocks';

describe(ColumboService.name, () => {
  let sut: ColumboService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new ColumboService(mocks.columbo as never, mocks.user as never);
  });

  describe('startInvestigation', () => {
    it('returns 501 when columbo is not configured', async () => {
      (mocks.columbo as { enabled: boolean }).enabled = false;

      await expect(sut.startInvestigation({ userId: 'user-1', prompt: 'why slow' })).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('rejects an unknown user', async () => {
      mocks.user.get.mockRejectedValue(new Error('no result'));

      await expect(sut.startInvestigation({ userId: 'user-1', prompt: 'why slow' })).rejects.toThrow(NotFoundException);
      expect(mocks.columbo.startInvestigation).not.toHaveBeenCalled();
    });

    it('starts an investigation for a known user', async () => {
      mocks.user.get.mockResolvedValue({ id: 'user-1' } as never);

      await expect(sut.startInvestigation({ userId: 'user-1', prompt: 'why slow' })).resolves.toEqual({
        id: 'job-1',
        status: 'running',
        note: null,
        queries: [],
        error: null,
        toolCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
      });
      expect(mocks.columbo.startInvestigation).toHaveBeenCalledWith('user-1', 'why slow');
    });
  });

  describe('getInvestigation', () => {
    it('maps a missing job to 404', async () => {
      mocks.columbo.getInvestigation.mockResolvedValue(null);

      await expect(sut.getInvestigation('nope')).rejects.toThrow(NotFoundException);
    });

    it('returns the job with defaults filled in', async () => {
      mocks.columbo.getInvestigation.mockResolvedValue({ id: 'job-1', status: 'done', note: 'all good', toolCalls: 3 });

      await expect(sut.getInvestigation('job-1')).resolves.toEqual({
        id: 'job-1',
        status: 'done',
        note: 'all good',
        queries: [],
        error: null,
        toolCalls: 3,
        promptTokens: 0,
        completionTokens: 0,
      });
    });
  });
});
