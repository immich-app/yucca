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

const inviteBatchCreatedSchema = z.object({
  id: z.string(),
});

const inviteCreatedSchema = z.object({
  code: z.string(),
  expiresAt: z.coerce.date(),
  remaining: z.number().nullable(),
});

const conflictSchema = z.object({
  message: z.string(),
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

const ticketMappingSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  staffThreadId: z.string().nullable(),
  freshdeskTicketId: z.string(),
  discordUserId: z.string(),
  userId: z.string().nullable(),
  emailSubscribed: z.boolean(),
  lastMirroredMessageId: z.string().nullable(),
  lastStaffMirroredMessageId: z.string().nullable(),
  lastFreshdeskConversationId: z.string().nullable(),
  closedAt: z.coerce.date().nullable(),
});

const ticketMappingListSchema = z.object({
  items: z.array(ticketMappingSchema),
});

export type DiscordLink = z.infer<typeof linkSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type LinkRequestCreated = z.infer<typeof linkRequestCreatedSchema>;
export type TicketMapping = z.infer<typeof ticketMappingSchema>;
export type TicketMappingUpdate = Partial<
  Pick<
    TicketMapping,
    'emailSubscribed' | 'lastMirroredMessageId' | 'lastStaffMirroredMessageId' | 'lastFreshdeskConversationId'
  > & { closed: boolean }
>;
export type InviteResult =
  | ({ status: 'ok' } & z.infer<typeof inviteCreatedSchema>)
  | { status: 'already-linked' | 'invite-used' | 'exhausted' | 'cancelled' };

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

  async createInviteBatch(
    guildId: string,
    channelId: string,
    maxClaims: number,
    createdByDiscordUserId: string,
  ): Promise<string> {
    const response = await this.request('POST', '/api/internal/discord/invite-batches', {
      guildId,
      channelId,
      maxClaims,
      createdByDiscordUserId,
    });
    return inviteBatchCreatedSchema.parse(await response.json()).id;
  }

  async setInviteBatchMessage(batchId: string, messageId: string): Promise<void> {
    await this.request('PATCH', `/api/internal/discord/invite-batches/${encodeURIComponent(batchId)}/message`, {
      messageId,
    });
  }

  async createInvite(discordUserId: string, discordUsername: string, batchId?: string): Promise<InviteResult> {
    const response = await this.request(
      'POST',
      '/api/internal/discord/invites',
      { discordUserId, discordUsername, ...(batchId ? { batchId } : {}) },
      [409],
    );
    if (response.status === 409) {
      const { message } = conflictSchema.parse(await response.json());
      switch (message) {
        case 'ALREADY_LINKED': {
          return { status: 'already-linked' };
        }
        case 'INVITE_USED': {
          return { status: 'invite-used' };
        }
        case 'BATCH_EXHAUSTED': {
          return { status: 'exhausted' };
        }
        case 'BATCH_CANCELLED': {
          return { status: 'cancelled' };
        }
      }
      throw new Error(`Unexpected invite conflict: ${message}`);
    }
    return { status: 'ok', ...inviteCreatedSchema.parse(await response.json()) };
  }

  async getUserSummary(userId: string): Promise<UserSummary> {
    const response = await this.request('GET', `/api/internal/discord/users/${encodeURIComponent(userId)}/summary`);
    return userSummarySchema.parse(await response.json());
  }

  async createTicketMapping(mapping: {
    threadId: string;
    staffThreadId?: string;
    freshdeskTicketId: string;
    discordUserId: string;
    userId?: string;
    lastMirroredMessageId?: string;
    lastStaffMirroredMessageId?: string;
  }): Promise<TicketMapping> {
    const response = await this.request('POST', '/api/internal/discord/tickets', mapping);
    return ticketMappingSchema.parse(await response.json());
  }

  async getTicketByThread(threadId: string): Promise<TicketMapping | null> {
    const response = await this.request(
      'GET',
      `/api/internal/discord/tickets/by-thread/${encodeURIComponent(threadId)}`,
      undefined,
      [404],
    );
    if (response.status === 404) {
      return null;
    }
    return ticketMappingSchema.parse(await response.json());
  }

  async getTicketByFreshdeskId(freshdeskTicketId: string): Promise<TicketMapping | null> {
    const response = await this.request(
      'GET',
      `/api/internal/discord/tickets/by-freshdesk/${encodeURIComponent(freshdeskTicketId)}`,
      undefined,
      [404],
    );
    if (response.status === 404) {
      return null;
    }
    return ticketMappingSchema.parse(await response.json());
  }

  async listOpenTickets(): Promise<TicketMapping[]> {
    const response = await this.request('GET', '/api/internal/discord/tickets/open');
    return ticketMappingListSchema.parse(await response.json()).items;
  }

  async updateTicket(id: string, updates: TicketMappingUpdate): Promise<void> {
    await this.request('PATCH', `/api/internal/discord/tickets/${encodeURIComponent(id)}`, updates);
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
