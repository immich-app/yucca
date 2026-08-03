import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import {
  ConnectionAdoptRequestDto,
  ConnectionCreateRequestDto,
  ConnectionListResponseDto,
  ConnectionResponseDto,
  ConnectionUpdateRequestDto,
} from 'src/dto/connection.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { ConnectionService } from 'src/services/connection.service';

@Controller('/connections')
export class ConnectionController {
  constructor(private readonly connections: ConnectionService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: ConnectionListResponseDto })
  listConnections(@Auth() auth: AuthDto): Promise<ConnectionListResponseDto> {
    return this.connections.list(auth);
  }

  @Post()
  @AuthRoute()
  @ApiOkResponse({ type: ConnectionResponseDto })
  createConnection(@Auth() auth: AuthDto, @Body() dto: ConnectionCreateRequestDto): Promise<ConnectionResponseDto> {
    return this.connections.create(auth, dto);
  }

  @Patch('/:id')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateConnection(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Body() dto: ConnectionUpdateRequestDto,
  ): Promise<void> {
    await this.connections.update(auth, id, dto);
  }

  @Delete('/:id')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteConnection(@Auth() auth: AuthDto, @Param('id') id: string): Promise<void> {
    return this.connections.delete(auth, id);
  }

  @Post('/:id/adopt')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  adoptRepositories(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Body() dto: ConnectionAdoptRequestDto,
  ): Promise<void> {
    return this.connections.adopt(auth, id, dto);
  }
}
