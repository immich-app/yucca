import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Get, Headers, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import { AuthDto } from 'src/dto/auth.dto';
import {
  CreateCustomerPortalResponseDto,
  CustomerBillingStateResponseDto,
  StartSubscriptionResponseDto,
} from 'src/dto/billing.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { BillingService } from 'src/services/billing.service';

@ApiTags('billing')
@Controller('/billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: CustomerBillingStateResponseDto })
  getBillingStatus(
    @Auth() auth: AuthDto,
    @Query('refresh') refresh?: boolean,
  ): Promise<CustomerBillingStateResponseDto> {
    return this.service.getBillingStatus(auth, refresh);
  }

  @Get('/portal')
  @AuthRoute()
  @ApiOkResponse({ type: CreateCustomerPortalResponseDto })
  getCustomerBillingPortal(@Auth() auth: AuthDto): Promise<CreateCustomerPortalResponseDto> {
    return this.service.createCustomerPortal(auth);
  }

  @Post('/subscribe')
  @AuthRoute()
  @ApiOkResponse({ type: StartSubscriptionResponseDto })
  startSubscription(
    @Auth() auth: AuthDto,
    @Headers() headers: IncomingHttpHeaders,
  ): Promise<StartSubscriptionResponseDto> {
    return this.service.startSubscription(auth, headers);
  }

  @Post('/polar/webhook')
  @ApiOkResponse()
  async polarWebhook(@Req() request: RawBodyRequest<Request>) {
    await this.service.polarWebhook(request.rawBody ?? null, request.headers as Record<string, string>);
  }
}
