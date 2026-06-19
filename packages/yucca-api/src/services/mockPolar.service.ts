import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { env } from 'src/env';
import { PolarRepository } from 'src/repositories/polar.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class MockPolarService implements OnApplicationBootstrap {
  constructor(
    private readonly user: UserRepository,
    private readonly polar: PolarRepository,
  ) {}

  async onApplicationBootstrap() {
    if (!env.POLAR_MOCK) {
      return;
    }

    const users = await this.user.testGetAllUsers();

    for (const user of users) {
      if (user.polarUserId && user.polarSubscriptionId) {
        await this.polar.mockIngest(user.polarUserId);
      }
    }
  }
}
