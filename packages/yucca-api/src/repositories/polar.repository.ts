import { Injectable } from '@nestjs/common';
import { Polar } from '@polar-sh/sdk';
import { Customer } from '@polar-sh/sdk/models/components/customer.js';
import { ResourceNotFound } from '@polar-sh/sdk/models/errors/resourcenotfound.js';
import { validateEvent } from '@polar-sh/sdk/webhooks';
import { env } from 'src/env';

@Injectable()
export class PolarRepository {
  private polar = new Polar({
    server: env.POLAR_HOST,
    accessToken: env.POLAR_ACCESS_TOKEN,
  });

  constructor() {}

  async createOrFindCustomer(sub: string, email: string) {
    let customer: Customer;

    try {
      customer = await this.polar.customers.getExternal({
        externalId: sub,
      });
    } catch (error) {
      if (error instanceof ResourceNotFound) {
        customer = await this.polar.customers.create({
          type: 'individual',
          email,
          externalId: sub,
        });
      } else {
        throw error;
      }
    }

    return customer;
  }

  async findActiveSubscription(customerId: string) {
    const state = await this.polar.customers.getState({
      id: customerId,
    });

    return state.activeSubscriptions.find((subscription) => subscription.productId === env.POLAR_PRODUCT_ID);
  }

  createCheckout(customerId: string, successUrl?: string) {
    return this.polar.checkouts.create({
      customerId,
      products: [env.POLAR_PRODUCT_ID],
      discountId: env.POLAR_APPLY_DISCOUNT_ID,
      successUrl,
    });
  }

  createCustomerSession(externalCustomerId: string) {
    return this.polar.customerSessions.create({
      externalCustomerId,
    });
  }

  validateWebhook(body: string | Buffer, headers: Record<string, string>) {
    return validateEvent(body, headers, env.POLAR_WEBHOOK_SECRET);
  }

  async mockIngest(customerId: string) {
    await this.polar.events.ingest({
      events: [
        {
          name: 'storage',
          customerId,
          metadata: {
            bytes: 1200,
          },
        },
      ],
    });
  }
}
