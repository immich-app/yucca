import { BadRequestException, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { CreateCustomerPortalResponseDto, StartSubscriptionResponseDto } from 'src/dto/billing.dto';
import { PolarRepository } from 'src/repositories/polar.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class BillingService implements OnApplicationBootstrap {
  constructor(
    private readonly polar: PolarRepository,
    private readonly user: UserRepository,
  ) {}

  async onApplicationBootstrap() {
    //
  }

  async createCustomerPortal(auth: AuthDto): Promise<CreateCustomerPortalResponseDto> {
    const session = await this.polar.createCustomerSession(auth.sub);

    return {
      customerPortalUrl: session.customerPortalUrl,
    };
  }

  async startSubscription(auth: AuthDto): Promise<StartSubscriptionResponseDto> {
    const user = await this.user.getBySub(auth.sub);

    if (!user?.polarUserId) {
      throw new BadRequestException('No billing customer linked to this account');
    }

    if (user.polarSubscriptionId) {
      throw new BadRequestException('Already subscribed');
    }

    const checkout = await this.polar.createCheckout(user.polarUserId);

    return {
      checkoutUrl: checkout.url,
    };
  }
}
