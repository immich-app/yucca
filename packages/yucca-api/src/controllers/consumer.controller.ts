import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import {
  ConsumerAdoptRequestDto,
  ConsumerCreateRequestDto,
  ConsumerListResponseDto,
  ConsumerResponseDto,
  ConsumerUpdateRequestDto,
} from 'src/dto/consumer.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { ConsumerService } from 'src/services/consumer.service';

// The consumer surface is open to every authenticated user (multiple immich
// instances, adopt, management). Creating/binding a restic or fubar consumer
// is gated per-type by ConsumerService against the user's feature flags.
@Controller('/consumers')
export class ConsumerController {
  constructor(private readonly consumers: ConsumerService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: ConsumerListResponseDto })
  listConsumers(@Auth() auth: AuthDto): Promise<ConsumerListResponseDto> {
    return this.consumers.list(auth);
  }

  @Post()
  @AuthRoute()
  @ApiOkResponse({ type: ConsumerResponseDto })
  async createConsumer(@Auth() auth: AuthDto, @Body() dto: ConsumerCreateRequestDto): Promise<ConsumerResponseDto> {
    const consumer = await this.consumers.create(auth, dto);
    return { consumer: { ...consumer, repositoryCount: 0 } };
  }

  @Patch('/:id')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateConsumer(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Body() dto: ConsumerUpdateRequestDto,
  ): Promise<void> {
    await this.consumers.update(auth, id, dto);
  }

  @Delete('/:id')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteConsumer(@Auth() auth: AuthDto, @Param('id') id: string): Promise<void> {
    return this.consumers.delete(auth, id);
  }

  @Post('/:id/adopt')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  adoptRepositories(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Body() dto: ConsumerAdoptRequestDto,
  ): Promise<void> {
    return this.consumers.adopt(auth, id, dto);
  }
}
