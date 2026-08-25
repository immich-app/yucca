import { JwtService } from '@nestjs/jwt';
import { SessionService } from './session.service';

jest.mock('@futo-org/backups-api-client', () => ({}));

describe(SessionService.name, () => {
  const userId = 'a06b5b4e-3d21-4d3f-9d4b-c0ffee000001';

  const makeService = (overrides: { requireSession?: boolean; claimedUserId?: string } = {}) => {
    const config = {
      getSessionSecret: jest.fn().mockResolvedValue(Buffer.alloc(32, 1)),
    };
    const moduleConfig = { get: () => ({ requireSession: overrides.requireSession ?? true }) };
    const backend = {
      getBackend: jest.fn().mockResolvedValue({
        configuration: { type: 'yucca', userId: 'claimedUserId' in overrides ? overrides.claimedUserId : userId },
      }),
    };

    return {
      service: new SessionService(config as never, moduleConfig as never, backend as never, new JwtService()),
      config,
      backend,
    };
  };

  it('verifies a token it issued', async () => {
    const { service } = makeService();

    await expect(service.verify(await service.issue(userId))).resolves.toEqual({ userId });
  });

  it('rejects a token signed with a rotated secret', async () => {
    const { service, config } = makeService();
    const token = await service.issue(userId);
    config.getSessionSecret.mockResolvedValue(Buffer.alloc(32, 2));

    await expect(service.verify(token)).resolves.toBeUndefined();
  });

  it('is not required until the instance is claimed', async () => {
    const { service } = makeService({ claimedUserId: void 0 });

    await expect(service.isRequired()).resolves.toBe(false);
  });

  it('is not required when the host does not opt in', async () => {
    const { service } = makeService({ requireSession: false });

    await expect(service.isRequired()).resolves.toBe(false);
  });
});
