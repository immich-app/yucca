import { Injectable } from '@nestjs/common';
import { env } from 'src/env';
import { z } from 'zod';

const linkRequestCreatedSchema = z.object({
  code: z.string(),
  expiresAt: z.coerce.date(),
});

const linkSchema = z.object({
  userId: z.string(),
  discordUserId: z.string(),
  discordUsername: z.string(),
});

const userSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.coerce.date(),
  connectionCount: z.number(),
  repositoryCount: z.number(),
  lastSeenAt: z.coerce.date().nullable(),
});

export type DiscordLink = z.infer<typeof linkSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type LinkRequestCreated = z.infer<typeof linkRequestCreatedSchema>;

@Injectable()
export class YuccaApiRepository {
  async createLinkRequest(discordUserId: string, discordUsername: string): Promise<LinkRequestCreated> {
    const response = await this.request('POST', '/api/internal/discord/link-requests', {
      discordUserId,
      discordUsername,
    });
    return linkRequestCreatedSchema.parse(await response.json());
  }

  async getLink(discordUserId: string): Promise<DiscordLink | null> {
    const response = await this.request(
      'GET',
      `/api/internal/discord/links/${encodeURIComponent(discordUserId)}`,
      undefined,
      [404],
    );
    if (response.status === 404) {
      return null;
    }
    return linkSchema.parse(await response.json());
  }

  async updateLinkUsername(discordUserId: string, discordUsername: string): Promise<void> {
    await this.request(
      'PATCH',
      `/api/internal/discord/links/${encodeURIComponent(discordUserId)}`,
      { discordUsername },
      [404],
    );
  }

  async getUserSummary(userId: string): Promise<UserSummary> {
    const response = await this.request('GET', `/api/internal/discord/users/${encodeURIComponent(userId)}/summary`);
    return userSummarySchema.parse(await response.json());
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    allowedStatuses: number[] = [],
  ): Promise<Response> {
    const response = await fetch(new URL(path, env.YUCCA_API_URL), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.INTERNAL_SECRET,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new Error(
        `yucca-api ${method} ${path} failed: ${response.status} ${response.statusText} — ${await response.text()}`,
      );
    }
    return response;
  }
}
