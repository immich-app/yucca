import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CustomerStateSubscription } from '@polar-sh/sdk/models/components/customerstatesubscription.js';
import { IncomingHttpHeaders } from 'node:http';
import { AuthDto } from 'src/dto/auth.dto';
import {
  CreateCustomerPortalResponseDto,
  CustomerBillingStateResponseDto,
  StartSubscriptionResponseDto,
} from 'src/dto/billing.dto';
import { env } from 'src/env';
import { PolarRepository } from 'src/repositories/polar.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class BillingService {
  constructor(
    private readonly polar: PolarRepository,
    private readonly user: UserRepository,
    private readonly wideContext: WideContextRepository,
  ) {}

  async getBillingStatus(auth: AuthDto, refresh?: boolean): Promise<CustomerBillingStateResponseDto> {
    const user = await this.user.getBySub(auth.sub);

    if (!user) {
      throw new InternalServerErrorException('User missing');
    }

    if (refresh && user.polarUserId) {
      try {
        const subscription = await this.polar.findActiveSubscription(user.polarUserId);
        const subscriptionId = subscription?.id;

        if (subscriptionId !== user.polarSubscriptionId) {
          await this.user.update(
            user.id,
            subscriptionId
              ? {
                  polarSubscriptionId: subscriptionId,
                  polarSubscriptionState: subscription.status,
                }
              : {
                  polarSubscriptionId: null!,
                  polarSubscriptionState: null!,
                },
          );

          user.polarSubscriptionId = subscriptionId;
        }
      } catch {
        // no-op
      }
    }

    return {
      subscriptionActive: !!user.polarSubscriptionId,
    };
  }

  async createCustomerPortal(auth: AuthDto): Promise<CreateCustomerPortalResponseDto> {
    const session = await this.polar.createCustomerSession(auth.sub);

    return {
      customerPortalUrl: session.customerPortalUrl,
    };
  }

  async startSubscription(auth: AuthDto, headers: IncomingHttpHeaders): Promise<StartSubscriptionResponseDto> {
    const user = await this.user.getBySub(auth.sub);

    if (!user) {
      throw new InternalServerErrorException('User missing');
    }

    if (!user.polarUserId) {
      try {
        const customer = await this.polar.createOrFindCustomer(user.sub, user.email);
        user.polarUserId = customer.id;

        await this.user.update(user.id, {
          polarUserId: customer.id,
        });
      } catch (error) {
        this.wideContext.setErrorCause(error);
        throw new InternalServerErrorException('Failed to create Polar customer');
      }
    }

    if (user.polarSubscriptionId) {
      throw new BadRequestException('Already subscribed');
    }

    let activeSubscription: CustomerStateSubscription | undefined;
    try {
      activeSubscription = await this.polar.findActiveSubscription(user.polarUserId);
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new InternalServerErrorException('Failed to create Polar customer');
    }

    if (activeSubscription) {
      await this.user.update(auth.id, {
        polarSubscriptionId: activeSubscription.id,
        polarSubscriptionState: activeSubscription.status,
      });

      return {
        checkoutUrl: '/dashboard/billing',
      };
    }

    const successUrl = new URL('/dashboard/billing', headers.origin);
    const checkout = await this.polar.createCheckout(user.polarUserId, successUrl.href);

    return {
      checkoutUrl: checkout.url,
    };
  }

  async polarWebhook(body: string | Buffer | null, headers: Record<string, string>) {
    if (!body) {
      return;
    }

    const event = this.polar.validateWebhook(body, headers);

    switch (event.type) {
      case 'customer.state_changed': {
        const user = await this.user.getByPolarId(event.data.id);
        if (!user) {
          break;
        }

        if (event.data.deletedAt) {
          await this.user.update(user.id, {
            polarUserId: null!,
            polarSubscriptionId: null!,
            polarSubscriptionState: null!,
          });
        } else {
          const activeSub = event.data.activeSubscriptions.find(
            (subscription) => subscription.productId === env.POLAR_PRODUCT_ID,
          );

          await this.user.update(
            user.id,
            activeSub
              ? {
                  polarSubscriptionId: activeSub.id,
                  polarSubscriptionState: activeSub.status,
                }
              : {
                  polarSubscriptionId: null!,
                  polarSubscriptionState: null!,
                },
          );
        }

        break;
      }
    }
  }
}
