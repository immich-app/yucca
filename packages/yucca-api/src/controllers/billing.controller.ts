import { Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import { CreateCustomerPortalResponseDto, StartSubscriptionResponseDto } from 'src/dto/billing.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { BillingService } from 'src/services/billing.service';

@ApiTags('billing')
@Controller('/billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('/portal')
  @AuthRoute()
  @ApiOkResponse({ type: CreateCustomerPortalResponseDto })
  getCustomerBillingPortal(@Auth() auth: AuthDto): Promise<CreateCustomerPortalResponseDto> {
    return this.service.createCustomerPortal(auth);
  }

  @Post('/subscribe')
  @AuthRoute()
  @ApiOkResponse({ type: StartSubscriptionResponseDto })
  startSubscription(@Auth() auth: AuthDto): Promise<StartSubscriptionResponseDto> {
    return this.service.startSubscription(auth);
  }
}
