import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryCreateRequestDto, RepositoryUpdateRequestDto } from 'src/dto/repository.dto';
import { ConsumerRepository } from 'src/repositories/consumer.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticApiRepository } from 'src/repositories/resticApi.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
    private readonly resticApi: ResticApiRepository,
    private readonly consumer: ConsumerRepository,
    private readonly crypto: CryptoRepository,
    private readonly resticTokens: ResticTokenRepository,
  ) {}

  async create(auth: AuthDto, dto: RepositoryCreateRequestDto) {
    // Sessions bound to a consumer (device-flow logins) own their repos; web
    // sessions and pre-consumer sessions fall back to the default consumer.
    let consumerId = auth.consumerId;
    if (!consumerId) {
      const consumer = await this.consumer.getOrCreateDefault(auth.id);
      consumerId = consumer.id;
    }
    return this.repositoryRepository.create({ userId: auth.id, consumerId, ...dto });
  }

  async get(auth: AuthDto, id: string) {
    const repository = await this.repositoryRepository.get(id);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    return repository;
  }

  async getAll(auth: AuthDto) {
    return { repositories: await this.repositoryRepository.getByUser(auth.id) };
  }

  async update(auth: AuthDto, id: string, dto: RepositoryUpdateRequestDto) {
    const repository = await this.get(auth, id);

    if (repository.worm && typeof dto.worm === 'boolean' && dto.worm !== repository.worm) {
      throw new BadRequestException('Refusing to disable write-only on repository');
    }

    return { repository: await this.repositoryRepository.update(id, dto) };
  }

  async createUrl(auth: AuthDto, id: string) {
    const repository = await this.get(auth, id);

    const jti = this.crypto.randomUUID();
    const token = await this.jwt.signAsync({
      user: auth.id,
      repository: repository.id,
      writeOnce: repository.worm,
      jti,
      consumer: repository.consumerType,
    });

    // Track every minted token: the audit of live credentials and the basis
    // for revocation. expiresAt comes from the token itself, not re-derived.
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    await this.resticTokens.create({
      jti,
      repositoryId: repository.id,
      userId: auth.id,
      consumerId: repository.consumerId,
      mintedBy: 'user',
      expiresAt: new Date(exp * 1000),
    });

    this.wideContext.addContext('repositoryId', repository.id);

    const url = this.resticApi.getEndpoint();
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}` };
  }

  async delete(auth: AuthDto, id: string) {
    const repository = await this.get(auth, id);
    if (repository.worm) {
      throw new BadRequestException('Refusing to delete write-only repository');
    }

    await this.repositoryRepository.delete(id);
  }
}
