import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { DeviceFlowResponseDto } from '../dto/auth.dto';
import { TicketCreateRequestDto, TicketCreateResponseDto } from '../dto/ticket.dto';
import { AuthService } from '../services/auth.service';

@Controller('/yucca/auth')
export class AuthController {
  constructor(readonly auth: AuthService) {}

  @Get('/oidc/device')
  @ApiOkResponse({ type: DeviceFlowResponseDto })
  oidcDeviceFlow(): Promise<DeviceFlowResponseDto> {
    return this.auth.oidcDeviceFlow();
  }

  @Post('/ticket')
  @ApiOkResponse({ type: TicketCreateResponseDto })
  async createTicket(@Body() dto: TicketCreateRequestDto): Promise<TicketCreateResponseDto> {
    return await this.auth.createTicket(dto);
  }
}
