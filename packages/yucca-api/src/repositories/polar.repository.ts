import { WideContextRepository } from '@common/server/otel';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Polar } from '@polar-sh/sdk';
import { Customer } from '@polar-sh/sdk/models/components/customer.js';
import { ResourceNotFound } from '@polar-sh/sdk/models/errors/resourcenotfound.js';
import { env } from 'src/env';

@Injectable()
export class PolarRepository {
  private polar = new Polar({
    server: env.POLAR_HOST,
    accessToken: env.POLAR_ACCESS_TOKEN,
  });

  constructor(private readonly wideContext: WideContextRepository) {}

  async createOrFindCustomer(sub: string, email: string) {
    let customer: Customer;

    try {
      customer = await this.polar.customers.getExternal({
        externalId: sub,
      });
    } catch (error) {
      if (error instanceof ResourceNotFound) {
        try {
          customer = await this.polar.customers.create({
            type: 'individual',
            email,
            externalId: sub,
          });
        } catch (error) {
          this.wideContext.setErrorCause(error);
          throw new InternalServerErrorException("Couldn't create billing customer");
        }
      } else {
        this.wideContext.setErrorCause(error);
        console.info(error);
        throw new InternalServerErrorException("Couldn't query for billing customer");
      }
    }

    return customer;
  }

  async findActiveSubscription(customerId: string) {
    const state = await this.polar.customers.getState({
      id: customerId,
    });

    for (const subscription of state.activeSubscriptions) {
      if (subscription.productId === env.POLAR_PRODUCT_ID) {
        return subscription;
      }
    }

    return undefined;
  }

  createCheckout(customerId: string) {
    return this.polar.checkouts.create({
      customerId,
      products: [env.POLAR_PRODUCT_ID],
      discountId: env.POLAR_APPLY_DISCOUNT_ID,
    });
  }

  createCustomerSession(externalCustomerId: string) {
    return this.polar.customerSessions.create({
      externalCustomerId,
    });
  }
}
