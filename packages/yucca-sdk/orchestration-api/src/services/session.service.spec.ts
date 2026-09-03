import { JwtService } from '@nestjs/jwt';
import { SessionService } from './session.service';

jest.mock('@futo-org/backups-api-client', () => ({}));

describe(SessionService.name, () => {
  const userId = 'a06b5b4e-3d21-4d3f-9d4b-c0ffee000001';

  const makeService = (overrides: { requireSession?: boolean; connected?: boolean; claimedUserId?: string } = {}) => {
    const config = {
      getSessionSecret: jest.fn().mockResolvedValue(Buffer.alloc(32, 1)),
    };
    const moduleConfig = { get: () => ({ requireSession: overrides.requireSession ?? true }) };
    const connected = overrides.connected ?? true;
    const configuration = connected
      ? { type: 'yucca', userId: 'claimedUserId' in overrides ? overrides.claimedUserId : userId }
      : undefined;
    const backend = { getBackend: jest.fn().mockResolvedValue(connected ? { configuration } : undefined) };

    return {
      service: new SessionService(config as never, moduleConfig as never, backend as never, new JwtService()),
      config,
      backend,
      configuration: configuration as never,
    };
  };

  it('verifies a token it issued', async () => {
    const { service, configuration } = makeService();
    const token = await service.issue(userId);

    await expect(service.verify(token, configuration)).resolves.toEqual({ userId });
  });

  it('rejects a token signed with a different secret', async () => {
    const { service, config, configuration } = makeService();
    const token = await service.issue(userId);
    config.getSessionSecret.mockResolvedValue(Buffer.alloc(32, 2));

    await expect(service.verify(token, configuration)).resolves.toBeUndefined();
  });

  it('is required once the cloud backend is connected, even without a recorded account', () => {
    const { service, configuration } = makeService({ claimedUserId: void 0 });

    expect(service.isRequired(configuration)).toBe(true);
  });

  it('is not required without a cloud backend', () => {
    const { service, configuration } = makeService({ connected: false });

    expect(service.isRequired(configuration)).toBe(false);
  });

  it('is not required when the host does not opt in', () => {
    const { service, configuration } = makeService({ requireSession: false });

    expect(service.isRequired(configuration)).toBe(false);
  });
});
