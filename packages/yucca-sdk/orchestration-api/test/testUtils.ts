import { INestApplication } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import Database from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import { KyselyModule } from 'nestjs-kysely';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackendType } from 'src/enum';
import { EventsGateway, GatewayEvent } from 'src/events/events.gateway';
import { ModuleConfigProvider } from 'src/moduleConfig';
import { controllers, repositories, services } from 'src/orchestrationApi.module';
import { BackendRepository } from 'src/repositories/backend.repository';
import { ResticRepository } from 'src/repositories/restic.repository';
import { newResticRepositoryMock } from './mocks';

export interface TestContext {
  app: INestApplication;
  module: TestingModule;
  gateway: EventsGateway;
  database: InstanceType<typeof Database>;
  resticMock: jest.Mocked<ResticRepository>;
  backendId: string;
  statePath: string;
  backendPath: string;
}

export async function createTestingModule(): Promise<TestContext> {
  const statePath = await mkdtemp(join(tmpdir(), 'yucca-test-'));
  const backendPath = await mkdtemp(join(tmpdir(), 'yucca-backend-'));
  await mkdir(join(statePath, 'logs'), { recursive: true });

  const database = new Database(':memory:');
  database.pragma('journal_mode = WAL');

  const resticMock = newResticRepositoryMock();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      KyselyModule.forRoot([
        {
          namespace: 'orchestrator',
          dialect: new SqliteDialect({ database }),
        },
      ]),
      EventEmitterModule.forRoot(),
      ScheduleModule.forRoot(),
    ],
    controllers,
    providers: [
      {
        provide: ModuleConfigProvider,
        useValue: {
          statePath,
          requireLock: false,
          requireWsAuth: false,
        },
      },
      EventsGateway,
      ...repositories,
      ...services,
    ],
  })
    .overrideProvider(ResticRepository)
    .useValue(resticMock)
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  const backendId = 'test-backend';
  await moduleFixture.get(BackendRepository).updateBackend(backendId, {
    type: BackendType.Local,
    path: backendPath,
  });

  return {
    app,
    module: moduleFixture,
    gateway: moduleFixture.get(EventsGateway),
    database,
    resticMock,
    backendId,
    statePath,
    backendPath,
  };
}

export function waitForEvent(gateway: EventsGateway, type: GatewayEvent['type']): Promise<GatewayEvent> {
  return new Promise((resolve) => {
    const onEvent = (event: GatewayEvent) => {
      if (event.type === type) {
        gateway.off(onEvent);
        resolve(event);
      }
    };
    gateway.on(onEvent);
  });
}

export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
