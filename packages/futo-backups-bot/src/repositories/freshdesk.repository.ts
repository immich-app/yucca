import { LoggerRepository } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import { env } from 'src/env';
import { escapeHtml } from 'src/utils/mirror';
import { z } from 'zod';

export const TICKET_STATUS_OPEN = 2;
export const TICKET_STATUS_RESOLVED = 4;

const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024;

const ticketCreatedSchema = z.object({
  id: z.number(),
});

const ticketSchema = z.object({
  id: z.number(),
  status: z.number(),
});

const conversationSchema = z.object({
  id: z.number(),
  body_text: z.string().nullish(),
  user_id: z.number(),
  private: z.boolean(),
  incoming: z.boolean(),
  attachments: z.array(z.object({ name: z.string(), attachment_url: z.string() })).default([]),
});

const agentSchema = z.object({
  id: z.number(),
  contact: z.object({ name: z.string() }),
});

const updatedTicketsSchema = z.array(z.object({ id: z.number() }));

export type FreshdeskConversation = z.infer<typeof conversationSchema>;
export type OutboundAttachment = { name: string; url: string };

@Injectable()
export class FreshdeskRepository {
  private agentNames = new Map<number, string>();
  private ownAgentId: number | null = null;

  constructor(private readonly logger: LoggerRepository) {}

  get enabled(): boolean {
    return Boolean(env.FRESHDESK_URL && env.FRESHDESK_API_KEY);
  }

  async createTicket(input: { email: string; name: string; subject: string; description: string }): Promise<string> {
    const response = await this.request('POST', '/api/v2/tickets', {
      email: input.email,
      name: input.name,
      subject: input.subject,
      description: input.description,
      status: TICKET_STATUS_OPEN,
      priority: 1,
      tags: this.tags(),
      ...(env.FRESHDESK_GROUP_ID ? { group_id: Number(env.FRESHDESK_GROUP_ID) } : {}),
    });
    return String(ticketCreatedSchema.parse(await response.json()).id);
  }

  async getTicketStatus(ticketId: string): Promise<number> {
    const response = await this.request('GET', `/api/v2/tickets/${encodeURIComponent(ticketId)}`);
    return ticketSchema.parse(await response.json()).status;
  }

  async resolveTicket(ticketId: string): Promise<void> {
    await this.request('PUT', `/api/v2/tickets/${encodeURIComponent(ticketId)}`, { status: TICKET_STATUS_RESOLVED });
  }

  async setRequester(ticketId: string, email: string, name: string): Promise<void> {
    await this.request('PUT', `/api/v2/tickets/${encodeURIComponent(ticketId)}`, { email, name });
  }

  async createNote(
    ticketId: string,
    body: string,
    options: { private: boolean; incoming?: boolean },
    attachments: OutboundAttachment[] = [],
  ): Promise<void> {
    await this.createConversation(`/api/v2/tickets/${encodeURIComponent(ticketId)}/notes`, body, attachments, {
      private: options.private,
      incoming: options.incoming ?? false,
    });
  }

  async createReply(ticketId: string, body: string, attachments: OutboundAttachment[] = []): Promise<void> {
    await this.createConversation(`/api/v2/tickets/${encodeURIComponent(ticketId)}/reply`, body, attachments, {});
  }

  async listConversationsAfter(ticketId: string, afterId: string | null): Promise<FreshdeskConversation[]> {
    const since = afterId === null ? null : Number(afterId);
    const all: FreshdeskConversation[] = [];
    for (let page = 1; page <= 20; page++) {
      const response = await this.request(
        'GET',
        `/api/v2/tickets/${encodeURIComponent(ticketId)}/conversations?per_page=100&page=${page}`,
      );
      const batch = z.array(conversationSchema).parse(await response.json());
      all.push(...batch.filter((conversation) => since === null || conversation.id > since));
      if (batch.length < 100) {
        break;
      }
    }
    return all.toSorted((a, b) => a.id - b.id);
  }

  // null = more than five full pages changed inside the lookback — the
  // listing is incomplete and the caller must treat every ticket as updated.
  async listUpdatedTicketIds(since: Date): Promise<string[] | null> {
    const ids: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const response = await this.request(
        'GET',
        `/api/v2/tickets?updated_since=${encodeURIComponent(since.toISOString())}&order_by=updated_at&per_page=100&page=${page}`,
      );
      const batch = updatedTicketsSchema.parse(await response.json());
      ids.push(...batch.map((ticket) => String(ticket.id)));
      if (batch.length < 100) {
        return ids;
      }
    }
    return null;
  }

  async getOwnAgentId(): Promise<number> {
    if (this.ownAgentId === null) {
      const response = await this.request('GET', '/api/v2/agents/me');
      this.ownAgentId = agentSchema.parse(await response.json()).id;
    }
    return this.ownAgentId;
  }

  async getAgentName(agentId: number): Promise<string> {
    const cached = this.agentNames.get(agentId);
    if (cached) {
      return cached;
    }
    const response = await this.request('GET', `/api/v2/agents/${agentId}`, undefined, [404]);
    const name = response.status === 404 ? 'Support' : agentSchema.parse(await response.json()).contact.name;
    this.agentNames.set(agentId, name);
    return name;
  }

  private tags(): string[] {
    const extra = env.FRESHDESK_TAGS.split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return ['discord', ...extra];
  }

  private async createConversation(
    path: string,
    body: string,
    attachments: OutboundAttachment[],
    fields: Record<string, boolean>,
  ): Promise<void> {
    const { files, omitted } = await this.download(attachments);
    const fullBody = [
      body,
      ...omitted.map((name) => `<i>Attachment omitted (too large): ${escapeHtml(name)}</i>`),
    ].join('<br>');

    if (files.length === 0) {
      await this.request('POST', path, { body: fullBody, ...fields });
      return;
    }

    const form = new FormData();
    form.append('body', fullBody);
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, String(value));
    }
    for (const file of files) {
      form.append('attachments[]', file.blob, file.name);
    }
    await this.request('POST', path, form);
  }

  private async download(
    attachments: OutboundAttachment[],
  ): Promise<{ files: { name: string; blob: Blob }[]; omitted: string[] }> {
    const files: { name: string; blob: Blob }[] = [];
    const omitted: string[] = [];
    let total = 0;
    for (const attachment of attachments) {
      try {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        if (blob.size > MAX_ATTACHMENT_BYTES || total + blob.size > MAX_ATTACHMENT_BYTES) {
          omitted.push(attachment.name);
          continue;
        }
        total += blob.size;
        files.push({ name: attachment.name, blob });
      } catch (error) {
        this.logger.warn(error, `failed to download attachment ${attachment.name}`);
        omitted.push(attachment.name);
      }
    }
    return { files, omitted };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    allowedStatuses: number[] = [],
  ): Promise<Response> {
    const isForm = body instanceof FormData;
    const response = await fetch(new URL(path, env.FRESHDESK_URL), {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.FRESHDESK_API_KEY}:X`).toString('base64')}`,
        ...(body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) }),
    });
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new Error(
        `freshdesk ${method} ${path} failed: ${response.status} ${response.statusText} — ${await response.text()}`,
      );
    }
    return response;
  }
}
