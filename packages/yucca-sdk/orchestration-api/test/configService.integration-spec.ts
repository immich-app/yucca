import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigController } from 'src/controllers/config.controller';
import { InternalEvent } from 'src/enum';
import { ModuleConfig } from 'src/moduleConfig';
import { UNTHROTTLED } from 'src/proxy/resticProxy';
import { ConfigRepository } from 'src/repositories/config.repository';
import { ModuleConfigRepository } from 'src/repositories/moduleConfig.repository';
import { ConfigService } from 'src/services/config.service';
import { createTestingModule, TestContext } from './testUtils';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestingModule();
}, 15_000);

afterEach(async () => {
  await ctx.app.close();
});

describe('Config service', () => {
  const bandwidth = { bytesPerSec: 5_000_000, quietHours: '22:00-06:00' };

  it('reports unthrottled until a throttle is set', () => {
    expect(ctx.module.get(ConfigService).getConfig()).toEqual({ bandwidth: UNTHROTTLED });
  });

  it('loads a stored throttle on bootstrap', async () => {
    const service = ctx.module.get(ConfigService);
    await ctx.module.get(ConfigRepository).setThrottle(bandwidth);

    await service.bootstrap();

    expect(service.getConfig()).toEqual({ bandwidth });
  });

  it('stores an updated throttle and reports it back', async () => {
    const service = ctx.module.get(ConfigService);

    await expect(service.updateConfig({ bandwidth })).resolves.toEqual({ bandwidth });

    expect(service.getConfig()).toEqual({ bandwidth });
    await expect(ctx.module.get(ConfigRepository).getThrottle()).resolves.toEqual(bandwidth);
  });

  it('announces an updated throttle to module config listeners', async () => {
    const updates: ModuleConfig[] = [];
    ctx.module.get(EventEmitter2).on(InternalEvent.ModuleConfigUpdated, (config: ModuleConfig) => updates.push(config));

    await ctx.module.get(ConfigService).updateConfig({ bandwidth });

    expect(updates).toEqual([expect.objectContaining({ throttle: bandwidth })]);
    expect(ctx.module.get(ModuleConfigRepository).get().throttle).toEqual(bandwidth);
  });

  it('serves the throttle through the config controller', async () => {
    const controller = ctx.module.get(ConfigController);

    await expect(controller.updateConfig({ bandwidth })).resolves.toEqual({ bandwidth });

    expect(controller.getConfig()).toEqual({ bandwidth });
  });
});
