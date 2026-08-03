import { connectionTypeFlag } from '@common/server';
import { BadRequestException, Injectable, NotFoundException, Scope, UnauthorizedException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import {
  ConnectionAdoptRequestDto,
  ConnectionCreateRequestDto,
  ConnectionListResponseDto,
  ConnectionResponseDto,
  ConnectionUpdateRequestDto,
} from 'src/dto/connection.dto';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { FeatureNotEnabledException } from 'src/utils/exceptions';

@Injectable({ scope: Scope.REQUEST })
export class ConnectionService {
  constructor(
    private readonly connections: ConnectionRepository,
    private readonly repositories: RepositoryRepository,
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

  async create(auth: AuthDto, dto: ConnectionCreateRequestDto): Promise<ConnectionResponseDto> {
    const flag = connectionTypeFlag(dto.type);
    if (flag && !auth.features[flag]) {
      throw new FeatureNotEnabledException(flag);
    }
    const connection = await this.connections.create({ userId: auth.id, type: dto.type, name: dto.name });
    return { connection: { ...connection, repositoryCount: 0, sizeBytes: 0, objectCount: 0, billableBytes: 0 } };
  }

  async update(auth: AuthDto, id: string, dto: ConnectionUpdateRequestDto) {
    await this.getOwned(auth, id);
    return this.connections.update(id, { name: dto.name });
  }

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

    await this.connections.delete(id);
  }

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
