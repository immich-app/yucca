import { BadRequestException, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { join } from 'node:path';
import {
  ConfigureImmichIntegrationRequestDto,
  ImmichRollbackRequestDto,
  IntegrationsResponseDto,
} from '../dto/integrations.dto';
import { InternalEvent } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import type { ImmichIntegration, ModuleConfig } from '../moduleConfig';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { RepositoryIntegrationImmichRepository } from '../repositories/repositoryIntegrationImmich.repository';
import { RepositoryPathRepository } from '../repositories/repositoryPath.repository';
import { ImmichRepositoryConfig } from '../schema/tables/repositoryIntegrationImmich.table';
import { RepositoryService } from './repository.service';
import { ScheduleService } from './schedule.service';
import { TelemetryService } from './telemetry.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly events: EventsGateway,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly repositoryIntegrationImmich: RepositoryIntegrationImmichRepository,
    private readonly repositoryPath: RepositoryPathRepository,
    private readonly repositoryService: RepositoryService,
    private readonly scheduleService: ScheduleService,
    private readonly telemetry: TelemetryService,
  ) {}

  @OnEvent(InternalEvent.ModuleConfigUpdated)
  async onModuleConfigUpdate(moduleConfig: ModuleConfig) {
    if (moduleConfig.immichIntegration) {
      const integration = await this.repositoryIntegrationImmich.get();
      if (!integration) {
        return;
      }

      await this.syncImmichRepositoryPaths(integration.id, integration.configuration, moduleConfig.immichIntegration);
    }
  }

  async getIntegrationsConfig(): Promise<IntegrationsResponseDto> {
    const { immichIntegration: immichState } = this.moduleConfig.get();
    const immichIntegration = await this.repositoryIntegrationImmich.get();

    return {
      immichState,
      immichIntegration,
    };
  }

  async configureImmichIntegration(dto: ConfigureImmichIntegrationRequestDto) {
    const { immichIntegration } = this.moduleConfig.get();
    if (!immichIntegration) {
      throw new BadRequestException('Immich integration is not enabled.');
    }

    const existing = await this.repositoryIntegrationImmich.get();

    let repositoryId: string;
    let scheduleId: string;

    if (existing) {
      repositoryId = existing.id;
      scheduleId = existing.scheduleId;
      await this.repositoryService.updateRepository(existing.id, {
        name: dto.name,
        retentionPolicy: dto.retentionPolicy,
      });
      await this.scheduleService.applyScheduleUpdate(scheduleId, { cron: dto.cron });
    } else {
      ({
        repository: { id: repositoryId },
      } = await this.repositoryService.createRepository({
        name: dto.name,
        worm: dto.worm,
      }));

      if (dto.retentionPolicy !== undefined) {
        await this.repositoryService.updateRepository(repositoryId, {
          retentionPolicy: dto.retentionPolicy,
        });
      }

      ({
        schedule: { id: scheduleId },
      } = await this.scheduleService.createSchedule({
        name: 'Immich Backup',
        cron: dto.cron,
        repositories: [repositoryId],
      }));
    }

    const configuration: ImmichRepositoryConfig = {
      dataFolders: dto.dataFolders,
      backupConfiguration: dto.backupConfiguration,
      libraries: dto.libraries,
    };

    await this.repositoryIntegrationImmich.upsert(repositoryId, scheduleId, configuration);
    await this.syncImmichRepositoryPaths(repositoryId, configuration, immichIntegration);

    this.telemetry.submitStructuredLog('Configured Immich integration', {
      repositoryId,
      scheduleId,
    });

    this.events.publish({
      type: 'IntegrationUpdate',
      integrations: await this.getIntegrationsConfig(),
    });
  }

  async enterImmichMaintenanceRollback(dto: ImmichRollbackRequestDto) {
    const { immichIntegration } = this.moduleConfig.get();
    if (!immichIntegration) {
      throw new BadRequestException('Immich integration is not enabled.');
    }

    await immichIntegration.hooks.enterMaintenanceRollback(dto.repositoryId, dto.snapshotId, dto.backupFileName);
  }

  private async syncImmichRepositoryPaths(
    repositoryId: string,
    config: ImmichRepositoryConfig,
    immich: ImmichIntegration,
  ) {
    const newPaths = new Set(this.getImmichBackupPaths(config, immich));
    const currentPaths = new Set(await this.repositoryPath.get(repositoryId));

    const toAdd = newPaths.difference(currentPaths);
    const toRemove = currentPaths.difference(newPaths);

    for (const path of toRemove) {
      await this.repositoryPath.delete(repositoryId, path);
    }

    for (const path of toAdd) {
      await this.repositoryPath.create({ id: repositoryId, path });
    }
  }

  private getImmichBackupPaths(config: ImmichRepositoryConfig, immich: ImmichIntegration): string[] {
    const paths: string[] = [];

    for (const folder of config.dataFolders) {
      if (immich.dataFolders.includes(folder)) {
        paths.push(join(immich.dataPath, folder));
      }
    }

    if (config.backupConfiguration) {
      paths.push(this.moduleConfig.get().statePath);
    }

    if (config.libraries === 'all') {
      for (const library of immich.libraries) {
        paths.push(...library.importPaths);
      }
    } else {
      const selectedIds = new Set(config.libraries);
      for (const library of immich.libraries) {
        if (selectedIds.has(library.id)) {
          paths.push(...library.importPaths);
        }
      }
    }

    return [...new Set(paths)];
  }
}
