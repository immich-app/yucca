import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { SessionListResponseDto } from 'src/dto/session.dto';
import {
  UserGetResponseDto,
  UserListQueryDto,
  UserListResponseDto,
  UserUpdateRequestDto,
  UserUpdateResponseDto,
} from 'src/dto/user.dto';
import { AuthRoute } from 'src/middleware/auth.guard';
import { SessionService } from 'src/services/session.service';
import { UserService } from 'src/services/user.service';

@Controller('/user')
export class UserController {
  constructor(
    private readonly user: UserService,
    private readonly session: SessionService,
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
}
