import { Injectable } from '@nestjs/common';
import { env } from 'src/env';

export type InvestigationRequest = {
  ticketThreadId: string;
  staffThreadId: string;
  discordUserId: string;
  username: string;
  userId: string;
  description: string;
};

@Injectable()
export class ColumboRepository {
  get enabled(): boolean {
    return !!env.COLUMBO_URL;
  }

  async requestInvestigation(request: InvestigationRequest): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const response = await fetch(new URL('/internal/investigations', env.COLUMBO_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.INTERNAL_SECRET,
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`columbo investigation request failed: ${response.status} ${response.statusText}`);
    }
  }
}
