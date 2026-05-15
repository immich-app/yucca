import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { DeviceFlowResponseDto } from '../dto/auth.dto';
import { AuthService } from '../services/auth.service';

@Controller('/yucca/auth')
export class AuthController {
  constructor(readonly auth: AuthService) {}

  @Get('/oidc/device')
  @ApiOkResponse({ type: DeviceFlowResponseDto })
  oidcDeviceFlow(): Promise<DeviceFlowResponseDto> {
    return this.auth.oidcDeviceFlow();
  }
}
