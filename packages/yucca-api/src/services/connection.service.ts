import { connectionTypeFlag } from '@common/server';
import { BadRequestException, Injectable, NotFoundException, Scope, UnauthorizedException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import {
  ConnectionAdoptRequestDto,
  ConnectionCreateRequestDto,
  ConnectionListResponseDto,
  ConnectionResticRequestDto,
  ConnectionResticResponseDto,
  ConnectionUpdateRequestDto,
} from 'src/dto/connection.dto';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';
import { RepositoryService } from 'src/services/repository.service';
import { FeatureNotEnabledException } from 'src/utils/exceptions';

const RESTIC_TYPE = 'restic';

@Injectable({ scope: Scope.REQUEST })
export class ConnectionService {
  constructor(
    private readonly connections: ConnectionRepository,
    private readonly repositories: RepositoryRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
    private readonly repositoryService: RepositoryService,
  ) {}

  async list(auth: AuthDto): Promise<ConnectionListResponseDto> {
    const rows = await this.connections.getByUserWithRepositoryCounts(auth.id);
    return {
      connections: rows.map((row) => ({
        ...row,
        repositoryCount: Number(row.repositoryCount ?? 0),
        sizeBytes: Number(row.sizeBytes ?? 0),
        objectCount: Number(row.objectCount ?? 0),
        billableBytes: Number(row.billableBytes ?? 0),
      })),
    };
  }

  private async getOwned(auth: AuthDto, id: string) {
    const connection = await this.connections.getById(id);
    if (!connection) {
      throw new NotFoundException(`No connection with id ${id}`);
    }
    if (connection.userId !== auth.id) {
      throw new UnauthorizedException();
    }
    return connection;
  }

  create(auth: AuthDto, dto: ConnectionCreateRequestDto) {
    // immich (the default type) is free; restic is gated per-type.
    const flag = connectionTypeFlag(dto.type);
    if (flag && !auth.features[flag]) {
      throw new FeatureNotEnabledException(flag);
    }
    return this.connections.create({ userId: auth.id, type: dto.type, name: dto.name });
  }

  // One-shot self-serve restic: gate the flag, get-or-create the user's restic
  // connection, create a repository under it, and mint a long-lived rest: URL —
  // everything needed to paste into restic and start backing up. Idempotent on
  // the connection (reused across repos); each call creates a fresh repository.
  async createRestic(auth: AuthDto, dto: ConnectionResticRequestDto): Promise<ConnectionResticResponseDto> {
    const flag = connectionTypeFlag(RESTIC_TYPE);
    if (flag && !auth.features[flag]) {
      throw new FeatureNotEnabledException(flag);
    }

    const connection = await this.connections.getOrCreateByType(auth.id, RESTIC_TYPE, 'Restic');

    const repository = await this.repositoryService.create(auth, {
      name: dto.name ?? `restic-${new Date().toISOString().slice(0, 10)}`,
      worm: dto.worm ?? false,
      connectionId: connection.id,
    });

    let minted: { url: string; jti: string; expiresAt: Date };
    try {
      minted = await this.repositoryService.createUrl(auth, repository.id, {
        expiresIn: dto.expiresIn,
        label: dto.label,
      });
    } catch (error) {
      // Compensate: don't leave a credential-less orphan repository behind (a
      // retry would create yet another one). Best-effort — the repo is harmless
      // if this also fails.
      await this.repositories.delete(repository.id).catch(() => {});
      throw error;
    }
    const { url, jti, expiresAt } = minted;

    const rows = await this.connections.getByUserWithRepositoryCounts(auth.id);
    const row = rows.find((r) => r.id === connection.id);

    return {
      connection: {
        ...connection,
        repositoryCount: Number(row?.repositoryCount ?? 1),
        sizeBytes: Number(row?.sizeBytes ?? 0),
        objectCount: Number(row?.objectCount ?? 0),
        billableBytes: Number(row?.billableBytes ?? 0),
      },
      repository,
      url,
      jti,
      expiresAt,
    };
  }

  async update(auth: AuthDto, id: string, dto: ConnectionUpdateRequestDto) {
    await this.getOwned(auth, id);
    return this.connections.update(id, { name: dto.name });
  }

  // Deleting a connection kills its sessions (FK cascade) and revokes its
  // outstanding restic tokens; its repositories must be adopted or deleted
  // first (FK RESTRICT backs the check).
  async delete(auth: AuthDto, id: string) {
    const connection = await this.getOwned(auth, id);

    const defaultConnection = await this.connections.getOrCreateDefault(auth.id);
    if (connection.id === defaultConnection.id) {
      throw new BadRequestException('Refusing to delete the default connection');
    }

    const repositories = await this.connections.getByUserWithRepositoryCounts(auth.id);
    const withCount = repositories.find((row) => row.id === id);
    if (Number(withCount?.repositoryCount ?? 0) > 0) {
      throw new BadRequestException('Connection still owns repositories; adopt or delete them first');
    }

    const active = await this.resticTokens.getActiveByConnection(id);
    for (const token of active) {
      await this.resticTokens.revoke(token.jti, `connection-delete:${auth.id}`);
      await this.revocation.invalidateVerdict(token.jti);
    }

    await this.connections.delete(id);
  }

  // Client-driven instance attribution: a connection claims repositories that
  // currently sit on the user's default connection (the backfill bucket).
  async adopt(auth: AuthDto, id: string, dto: ConnectionAdoptRequestDto) {
    const target = await this.getOwned(auth, id);
    const defaultConnection = await this.connections.getOrCreateDefault(auth.id);

    const repositories = await this.repositories.getByIds(dto.repositoryIds);
    if (repositories.length !== dto.repositoryIds.length) {
      throw new NotFoundException('One or more repositories do not exist');
    }
    for (const repository of repositories) {
      if (repository.userId !== auth.id) {
        throw new UnauthorizedException();
      }
      if (repository.connectionId === target.id) {
        continue;
      }
      if (repository.connectionId !== defaultConnection.id) {
        throw new BadRequestException(
          `Repository ${repository.id} belongs to another connection; only default-connection repositories can be adopted`,
        );
      }
    }

    await this.repositories.reparent(dto.repositoryIds, target.id);
  }
}
