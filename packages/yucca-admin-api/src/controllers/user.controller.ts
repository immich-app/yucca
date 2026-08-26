import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import { ConnectionListResponseDto } from 'src/dto/connection.dto';
import { FeatureOverrideDto, FeatureOverrideSetRequestDto, UserFeaturesResponseDto } from 'src/dto/features.dto';
import { SessionListResponseDto } from 'src/dto/session.dto';
import {
  UserDiscordLinkDto,
  UserDiscordLinkRequestDto,
  UserGetResponseDto,
  UserListQueryDto,
  UserListResponseDto,
  UserUpdateRequestDto,
  UserUpdateResponseDto,
} from 'src/dto/user.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { FeaturesService } from 'src/services/features.service';
import { SessionService } from 'src/services/session.service';
import { UserService } from 'src/services/user.service';

@Controller('/user')
export class UserController {
  constructor(
    private readonly user: UserService,
    private readonly session: SessionService,
    private readonly features: FeaturesService,
    private readonly connections: ConnectionRepository,
  ) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: UserListResponseDto })
  listUsers(@Query() query: UserListQueryDto): Promise<UserListResponseDto> {
    return this.user.list(query);
  }

  @Get('/:id')
  @AuthRoute()
  @ApiOkResponse({ type: UserGetResponseDto })
  getUser(@Param('id') id: string): Promise<UserGetResponseDto> {
    return this.user.get(id);
  }

  @Patch('/:id')
  @AuthRoute()
  @ApiOkResponse({ type: UserUpdateResponseDto })
  updateUser(@Param('id') id: string, @Body() dto: UserUpdateRequestDto): Promise<UserUpdateResponseDto> {
    return this.user.update(id, dto);
  }

  @Delete('/:id')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Param('id') id: string): Promise<void> {
    return this.user.delete(id);
  }

  @Put('/:id/discord')
  @AuthRoute()
  @ApiOkResponse({ type: UserDiscordLinkDto })
  linkUserDiscord(@Param('id') id: string, @Body() dto: UserDiscordLinkRequestDto): Promise<UserDiscordLinkDto> {
    return this.user.linkDiscord(id, dto);
  }

  @Delete('/:id/discord')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkUserDiscord(@Param('id') id: string): Promise<void> {
    return this.user.unlinkDiscord(id);
  }

  @Get('/:userId/session')
  @AuthRoute()
  @ApiOkResponse({ type: SessionListResponseDto })
  listUserSessions(@Param('userId') userId: string): Promise<SessionListResponseDto> {
    return this.session.listForUser(userId);
  }

  @Delete('/:userId/session')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUserSessions(@Param('userId') userId: string): Promise<void> {
    return this.session.deleteForUser(userId);
  }

  @Get('/:id/features')
  @AuthRoute()
  @ApiOkResponse({ type: UserFeaturesResponseDto })
  getUserFeatures(@Param('id') id: string): Promise<UserFeaturesResponseDto> {
    return this.features.getForUser(id);
  }

  @Put('/:id/features/:flag')
  @AuthRoute()
  @ApiOkResponse({ type: FeatureOverrideDto })
  setUserFeature(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('flag') flag: string,
    @Body() dto: FeatureOverrideSetRequestDto,
  ): Promise<FeatureOverrideDto> {
    return this.features.set(auth, id, flag, dto);
  }

  @Delete('/:id/features/:flag')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  clearUserFeature(@Auth() auth: AuthDto, @Param('id') id: string, @Param('flag') flag: string): Promise<void> {
    return this.features.clear(auth, id, flag);
  }

  @Get('/:id/connections')
  @AuthRoute()
  @ApiOkResponse({ type: ConnectionListResponseDto })
  async listUserConnections(@Param('id') id: string): Promise<ConnectionListResponseDto> {
    return { connections: await this.connections.getByUser(id) };
  }
}
