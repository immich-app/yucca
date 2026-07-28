import { isRevocableConnectionType } from '@common/server';
import { BadRequestException, Injectable, InternalServerErrorException, NotImplementedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import ms, { StringValue } from 'ms';
import { randomUUID } from 'node:crypto';
import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListQueryDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RepositoryUrlRequestDto,
  RepositoryUrlResponseDto,
} from 'src/dto/repository.dto';
import { env } from 'src/env';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { resolveLimit } from 'src/utils/pagination';

// Owner of admin-created repositories when no userId is given (e.g. yuctl
// bench repos). A plain DB row — it can never log in (the sub is not a real
// OIDC subject).
const serviceUser = {
  sub: 'yucca-admin-service',
  name: 'Admin service',
  email: 'admin-service@yucca.invalid',
};

@Injectable()
export class RepositoryService {
  constructor(
    private readonly repositories: RepositoryRepository,
    private readonly users: UserRepository,
    private readonly connections: ConnectionRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
    private readonly jwt: JwtService,
  ) {}

  list(query: RepositoryListQueryDto): Promise<RepositoryListResponseDto> {
    return this.repositories.list({
      cursor: query.cursor,
      limit: resolveLimit(query.limit),
      userId: query.userId,
    });
  }

  async get(id: string): Promise<RepositoryGetResponseDto> {
    return { repository: await this.repositories.get(id) };
  }

  async create(dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    let userId = dto.userId;
    let connection: { type: string; name: string };
    if (userId) {
      // Admin-provisioned repos on real users default to manual restic use.
      const type = dto.connectionType ?? 'restic';
      const names: Record<string, string> = { restic: 'Manual restic', immich: 'Immich' };
      connection = { type, name: names[type] ?? type };
    } else {
      const user = (await this.users.getBySub(serviceUser.sub)) ?? (await this.users.create(serviceUser));
      userId = user.id;
      connection = { type: 'restic', name: 'admin' };
    }
    const { id: connectionId } = await this.connections.getOrCreateByType(userId, connection.type, connection.name);
    const repository = await this.repositories.create({
      name: dto.name,
      userId,
      connectionId,
      worm: dto.worm ?? false,
    });
    return { repository };
  }

  // Mirrors yucca-api's createUrl: a restic rest: URL with an embedded JWT
  // that michael verifies against yucca-api's public key.
  async url(id: string, dto: RepositoryUrlRequestDto = {}): Promise<RepositoryUrlResponseDto> {
    if (!env.RESTIC_JWT_PRIVATE_KEY || !env.RESTIC_ENDPOINT) {
      throw new NotImplementedException('RESTIC_JWT_PRIVATE_KEY / RESTIC_ENDPOINT are not configured');
    }

    let expiresIn = env.RESTIC_JWT_EXPIRES_IN;
    if (dto.expiresIn) {
      const requested = ms(dto.expiresIn as StringValue);
      const cap = ms(env.RESTIC_JWT_MAX_EXPIRES_IN);
      if (!requested || requested <= 0) {
        throw new BadRequestException(`Invalid expiresIn '${dto.expiresIn}'`);
      }
      if (requested > cap) {
        throw new BadRequestException(`expiresIn exceeds the ${env.RESTIC_JWT_MAX_EXPIRES_IN} cap`);
      }
      expiresIn = dto.expiresIn as StringValue;
    }

    const repository = await this.repositories.get(id);
    const jti = randomUUID();
    const token = await this.jwt.signAsync(
      {
        user: repository.user.id,
        repository: repository.id,
        writeOnce: repository.worm,
        jti,
        connection: repository.connectionType,
      },
      { privateKey: env.RESTIC_JWT_PRIVATE_KEY, algorithm: 'ES256', expiresIn },
    );

    // expiresAt comes from the signed token itself, not re-derived.
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    const expiresAt = new Date(exp * 1000);
    await this.resticTokens.create({
      jti,
      repositoryId: repository.id,
      userId: repository.user.id,
      connectionId: repository.connectionId,
      mintedBy: 'admin',
      label: dto.label ?? null,
      expiresAt,
    });

    // Only revocable connection types (restic) carry a Redis validity marker.
    if (isRevocableConnectionType(repository.connectionType)) {
      await this.revocation.markValid(jti, expiresAt);
    }

    const url = new URL(env.RESTIC_ENDPOINT);
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}`, jti, expiresAt };
  }

  async update(id: string, dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    return { repository: await this.repositories.update(id, dto) };
  }

  async delete(id: string): Promise<void> {
    throw new InternalServerErrorException('unimplemented - must talk to S3');
    await this.repositories.delete(id);
  }
}
