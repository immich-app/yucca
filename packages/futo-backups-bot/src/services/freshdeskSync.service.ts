import { LoggerRepository } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttachmentBuilder, ChatInputCommandInteraction, EmbedBuilder, Message, MessageFlags } from 'discord.js';
import { env } from 'src/env';
import { Messages } from 'src/messages';
import { DiscordRepository } from 'src/repositories/discord.repository';
import {
  FreshdeskConversation,
  FreshdeskRepository,
  TICKET_STATUS_RESOLVED,
} from 'src/repositories/freshdesk.repository';
import { TicketMapping, YuccaApiRepository } from 'src/repositories/yuccaApi.repository';
import { MirrorMessage, escapeHtml, groupForMirror, toHtmlBody } from 'src/utils/mirror';
import { isStaff } from 'src/utils/staff';

const POLL_LOOKBACK_MS = 15 * 60_000;
const MAPPING_CACHE_TTL_MS = 60_000;
const MAX_DISCORD_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_EMBED_DESCRIPTION = 4000;
const SUBJECT_MAX_LENGTH = 80;

export type TicketOpened = {
  threadId: string;
  seedMessageId: string;
  staffThreadId: string;
  staffSeedMessageId: string;
  discordUserId: string;
  username: string;
  userId: string | null;
  description: string;
  staffNote: string;
};

@Injectable()
export class FreshdeskSyncService {
  private readonly mappingCache = new Map<string, { mapping: TicketMapping | null; at: number }>();
  private readonly pendingFlush = new Map<string, { timer: NodeJS.Timeout; firstAt: number }>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly logger: LoggerRepository,
    private readonly discord: DiscordRepository,
    private readonly freshdesk: FreshdeskRepository,
    private readonly api: YuccaApiRepository,
  ) {}

  get enabled(): boolean {
    return this.freshdesk.enabled;
  }

  async onTicketOpened(input: TicketOpened): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const firstLine = input.description.split('\n')[0].slice(0, SUBJECT_MAX_LENGTH);
    const freshdeskTicketId = await this.freshdesk.createTicket({
      email: this.dummyEmail(input.discordUserId),
      name: input.username,
      subject: `[Discord] ${input.username}: ${firstLine}`,
      description: toHtmlBody(input.description),
    });
    const mapping = await this.api.createTicketMapping({
      threadId: input.threadId,
      staffThreadId: input.staffThreadId,
      freshdeskTicketId,
      discordUserId: input.discordUserId,
      ...(input.userId ? { userId: input.userId } : {}),
      lastMirroredMessageId: input.seedMessageId,
      lastStaffMirroredMessageId: input.staffSeedMessageId,
    });
    this.mappingCache.set(mapping.threadId, { mapping, at: Date.now() });
    const threadLink = `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${input.threadId}`;
    await this.freshdesk.createNote(
      freshdeskTicketId,
      `${toHtmlBody(input.staffNote)}<br><br>Discord thread: <a href="${threadLink}">${threadLink}</a>`,
      { private: true },
    );
  }

  async handleMessage(message: Message): Promise<void> {
    try {
      if (!this.enabled || message.author.bot) {
        return;
      }
      const channel = message.channel;
      if (!channel.isThread() || channel.parentId !== env.DISCORD_SUPPORT_CHANNEL_ID) {
        return;
      }
      const mapping = await this.getMapping(channel.id);
      if (!mapping || mapping.closedAt) {
        return;
      }
      if (channel.id === mapping.staffThreadId) {
        await this.withLock(mapping.threadId, () => this.mirrorStaff(mapping.threadId));
        return;
      }
      if (message.author.id === mapping.discordUserId) {
        await this.withLock(mapping.threadId, () => this.mirrorTicket(mapping.threadId, false));
        return;
      }
      this.scheduleFlush(mapping.threadId);
    } catch (error) {
      this.logger.error(error, 'failed to mirror a discord message to freshdesk');
    }
  }

  async onTicketClosed(threadId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    await this.withLock(threadId, async () => {
      const mapping = await this.api.getTicketByThread(threadId);
      if (!mapping || mapping.closedAt) {
        return;
      }
      await this.mirrorTicket(threadId, true);
      await this.mirrorStaff(threadId);
      await this.freshdesk.resolveTicket(mapping.freshdeskTicketId);
      await this.finalizeRequester(mapping);
      await this.api.updateTicket(mapping.id, { closed: true });
      this.forgetMapping(mapping);
    });
  }

  async onFreshdeskPing(freshdeskTicketId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const mapping = await this.api.getTicketByFreshdeskId(freshdeskTicketId);
    if (!mapping || mapping.closedAt) {
      return;
    }
    await this.withLock(mapping.threadId, () => this.ingest(mapping.threadId));
  }

  async onEmailUpdatesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.enabled) {
      await interaction.reply({ content: Messages.emailUpdatesNotAvailable, flags: MessageFlags.Ephemeral });
      return;
    }
    const mapping = interaction.channelId ? await this.api.getTicketByThread(interaction.channelId) : null;
    if (!mapping || mapping.threadId !== interaction.channelId) {
      await interaction.reply({ content: Messages.emailUpdatesNotATicket, flags: MessageFlags.Ephemeral });
      return;
    }
    if (mapping.closedAt) {
      await interaction.reply({ content: Messages.emailUpdatesClosed, flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.user.id !== mapping.discordUserId) {
      await interaction.reply({ content: Messages.emailUpdatesOwnerOnly, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!mapping.userId) {
      await interaction.reply({ content: Messages.emailUpdatesNoAccount, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (mapping.emailSubscribed) {
      await this.freshdesk.setRequester(
        mapping.freshdeskTicketId,
        this.dummyEmail(mapping.discordUserId),
        interaction.user.username,
      );
      await this.api.updateTicket(mapping.id, { emailSubscribed: false });
      this.mappingCache.delete(mapping.threadId);
      await interaction.editReply({ content: Messages.emailUpdatesOff });
      return;
    }
    const summary = await this.api.getUserSummary(mapping.userId);
    await this.freshdesk.setRequester(mapping.freshdeskTicketId, summary.email, summary.name);
    await this.api.updateTicket(mapping.id, { emailSubscribed: true });
    this.mappingCache.delete(mapping.threadId);
    await interaction.editReply({ content: Messages.emailUpdatesOn(summary.email) });
  }

  async onHandoffCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.enabled) {
      await interaction.reply({ content: Messages.emailUpdatesNotAvailable, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isStaff(interaction)) {
      await interaction.reply({ content: Messages.staffOnlyHandoff, flags: MessageFlags.Ephemeral });
      return;
    }
    const mapping = interaction.channelId ? await this.api.getTicketByThread(interaction.channelId) : null;
    if (!mapping || mapping.threadId !== interaction.channelId) {
      await interaction.reply({ content: Messages.handoffNotATicket, flags: MessageFlags.Ephemeral });
      return;
    }
    if (mapping.closedAt) {
      await interaction.reply({ content: Messages.handoffClosed, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!mapping.userId) {
      await interaction.reply({ content: Messages.handoffNoAccount, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await this.withLock(mapping.threadId, async () => {
      const fresh = await this.api.getTicketByThread(mapping.threadId);
      if (!fresh?.userId || fresh.closedAt) {
        return;
      }
      await this.mirrorTicket(fresh.threadId, true);
      await this.mirrorStaff(fresh.threadId);
      // The Freshdesk ticket deliberately stays open — the handoff moves the
      // conversation to email, it does not resolve it.
      const summary = await this.api.getUserSummary(fresh.userId);
      await this.freshdesk.setRequester(fresh.freshdeskTicketId, summary.email, summary.name);
      await this.freshdesk.createNote(fresh.freshdeskTicketId, Messages.handoffNote(interaction.user.username), {
        private: true,
      });
      await this.discord.sendToThread(fresh.threadId, { content: Messages.handoffAnnouncement(fresh.discordUserId) });
      if (fresh.staffThreadId) {
        await this.discord.closeThread(await this.discord.getThreadById(fresh.staffThreadId));
      }
      await this.discord.closeThread(await this.discord.getThreadById(fresh.threadId));
      await this.api.updateTicket(fresh.id, { closed: true });
      this.forgetMapping(fresh);
    });
    await interaction.editReply({ content: Messages.handoffDone });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async poll(): Promise<void> {
    if (!this.discord.enabled || !this.enabled) {
      return;
    }
    let updated: Set<string> | null;
    try {
      const ids = await this.freshdesk.listUpdatedTicketIds(new Date(Date.now() - POLL_LOOKBACK_MS));
      updated = ids === null ? null : new Set(ids);
    } catch (error) {
      this.logger.warn(error, 'could not list updated freshdesk tickets — ingesting every open ticket');
      updated = null;
    }
    for (const { threadId, freshdeskTicketId } of await this.api.listOpenTickets()) {
      try {
        await this.withLock(threadId, async () => {
          if (!this.pendingFlush.has(threadId)) {
            await this.mirrorTicket(threadId, true);
          }
          await this.mirrorStaff(threadId);
          if (updated === null || updated.has(freshdeskTicketId)) {
            await this.ingest(threadId);
          }
        });
      } catch (error) {
        this.logger.error(error, `freshdesk sync failed for thread ${threadId}`);
      }
    }
  }

  private async mirrorTicket(threadId: string, force: boolean): Promise<void> {
    const mapping = await this.api.getTicketByThread(threadId);
    if (!mapping || mapping.closedAt) {
      return;
    }
    const messages = await this.discord.fetchMessagesAfter(mapping.threadId, mapping.lastMirroredMessageId);
    const batches = groupForMirror(
      messages.map((message) => this.toMirror(message)),
      mapping.discordUserId,
    );
    if (!force && batches.at(-1)?.kind === 'staff') {
      batches.pop();
    }
    for (const batch of batches) {
      await (batch.kind === 'customer'
        ? this.freshdesk.createNote(
            mapping.freshdeskTicketId,
            `<b>${escapeHtml(batch.message.authorName)}</b> (Discord):<br>${this.bodyOf(batch.message)}`,
            { private: false, incoming: true },
            batch.message.attachments,
          )
        : this.freshdesk.createReply(
            mapping.freshdeskTicketId,
            batch.messages
              .map((message) => `<b>${escapeHtml(message.authorName)}</b>:<br>${this.bodyOf(message)}`)
              .join('<br><br>'),
            batch.messages.flatMap((message) => message.attachments),
          ));
      await this.api.updateTicket(mapping.id, { lastMirroredMessageId: batch.lastMessageId });
    }
  }

  private async mirrorStaff(threadId: string): Promise<void> {
    const mapping = await this.api.getTicketByThread(threadId);
    if (!mapping?.staffThreadId || mapping.closedAt) {
      return;
    }
    const messages = await this.discord.fetchMessagesAfter(mapping.staffThreadId, mapping.lastStaffMirroredMessageId);
    let patched = mapping.lastStaffMirroredMessageId;
    for (const message of messages) {
      if (!message.author.bot) {
        const mirror = this.toMirror(message);
        await this.freshdesk.createNote(
          mapping.freshdeskTicketId,
          `<b>${escapeHtml(mirror.authorName)}</b> (staff notes):<br>${this.bodyOf(mirror)}`,
          { private: true },
          mirror.attachments,
        );
        await this.api.updateTicket(mapping.id, { lastStaffMirroredMessageId: message.id });
        patched = message.id;
      }
    }
    const last = messages.at(-1);
    if (last && last.id !== patched) {
      await this.api.updateTicket(mapping.id, { lastStaffMirroredMessageId: last.id });
    }
  }

  private async ingest(threadId: string): Promise<void> {
    const mapping = await this.api.getTicketByThread(threadId);
    if (!mapping || mapping.closedAt) {
      return;
    }
    const ownAgentId = await this.freshdesk.getOwnAgentId();
    const conversations = await this.freshdesk.listConversationsAfter(
      mapping.freshdeskTicketId,
      mapping.lastFreshdeskConversationId,
    );
    let patched = mapping.lastFreshdeskConversationId;
    for (const conversation of conversations) {
      if (!conversation.private && conversation.user_id !== ownAgentId) {
        await this.postToDiscord(mapping, conversation);
        await this.api.updateTicket(mapping.id, { lastFreshdeskConversationId: String(conversation.id) });
        patched = String(conversation.id);
      }
    }
    const last = conversations.at(-1);
    if (last && String(last.id) !== patched) {
      await this.api.updateTicket(mapping.id, { lastFreshdeskConversationId: String(last.id) });
    }
    if ((await this.freshdesk.getTicketStatus(mapping.freshdeskTicketId)) >= TICKET_STATUS_RESOLVED) {
      await this.closeFromFreshdesk(mapping);
    }
  }

  private async closeFromFreshdesk(mapping: TicketMapping): Promise<void> {
    await this.mirrorTicket(mapping.threadId, true);
    await this.mirrorStaff(mapping.threadId);
    await this.discord.sendToThread(mapping.threadId, { content: Messages.ticketResolvedByAgent });
    if (mapping.staffThreadId) {
      await this.discord.closeThread(await this.discord.getThreadById(mapping.staffThreadId));
    }
    await this.discord.closeThread(await this.discord.getThreadById(mapping.threadId));
    await this.finalizeRequester(mapping);
    await this.api.updateTicket(mapping.id, { closed: true });
    this.forgetMapping(mapping);
  }

  private async postToDiscord(mapping: TicketMapping, conversation: FreshdeskConversation): Promise<void> {
    const author = conversation.incoming
      ? Messages.viaEmailAuthor
      : Messages.supportAuthor(await this.freshdesk.getAgentName(conversation.user_id));
    const files: AttachmentBuilder[] = [];
    const links: string[] = [];
    for (const attachment of conversation.attachments) {
      try {
        const response = await fetch(attachment.attachment_url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_DISCORD_ATTACHMENT_BYTES) {
          links.push(Messages.attachmentTooLarge(attachment.name, attachment.attachment_url));
          continue;
        }
        files.push(new AttachmentBuilder(buffer, { name: attachment.name }));
      } catch (error) {
        this.logger.warn(error, `failed to fetch freshdesk attachment ${attachment.name}`);
        links.push(Messages.attachmentTooLarge(attachment.name, attachment.attachment_url));
      }
    }
    const body = (conversation.body_text ?? '').trim() || '(attachment)';
    const description = [body, ...links].join('\n').slice(0, MAX_EMBED_DESCRIPTION);
    await this.discord.sendToThread(mapping.threadId, {
      embeds: [new EmbedBuilder().setAuthor({ name: author }).setDescription(description)],
      files,
    });
  }

  private async finalizeRequester(mapping: TicketMapping): Promise<void> {
    if (mapping.emailSubscribed || !mapping.userId) {
      return;
    }
    const summary = await this.api.getUserSummary(mapping.userId);
    await this.freshdesk.setRequester(mapping.freshdeskTicketId, summary.email, summary.name);
  }

  private scheduleFlush(threadId: string): void {
    const existing = this.pendingFlush.get(threadId);
    const firstAt = existing?.firstAt ?? Date.now();
    if (existing) {
      clearTimeout(existing.timer);
    }
    const debounceMs = env.TICKET_MIRROR_DEBOUNCE_SECONDS * 1000;
    const maxWaitMs = env.TICKET_MIRROR_MAX_WAIT_SECONDS * 1000;
    const wait = Math.min(debounceMs, Math.max(0, firstAt + maxWaitMs - Date.now()));
    const timer = setTimeout(() => {
      this.pendingFlush.delete(threadId);
      void this.withLock(threadId, () => this.mirrorTicket(threadId, true)).catch((error: unknown) =>
        this.logger.error(error, `debounced mirror failed for thread ${threadId}`),
      );
    }, wait);
    timer.unref();
    this.pendingFlush.set(threadId, { timer, firstAt });
  }

  private withLock<T>(threadId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(threadId) ?? Promise.resolve();
    const next = previous.then(run, run);
    this.locks.set(
      threadId,
      next.then(
        () => {},
        () => {},
      ),
    );
    return next;
  }

  private async getMapping(threadId: string): Promise<TicketMapping | null> {
    const cached = this.mappingCache.get(threadId);
    if (cached && Date.now() - cached.at < MAPPING_CACHE_TTL_MS) {
      return cached.mapping;
    }
    const mapping = await this.api.getTicketByThread(threadId);
    this.mappingCache.set(threadId, { mapping, at: Date.now() });
    return mapping;
  }

  private forgetMapping(mapping: TicketMapping): void {
    this.mappingCache.delete(mapping.threadId);
    if (mapping.staffThreadId) {
      this.mappingCache.delete(mapping.staffThreadId);
    }
  }

  private toMirror(message: Message): MirrorMessage {
    return {
      id: message.id,
      authorId: message.author.id,
      authorName: message.author.username,
      fromBot: message.author.bot,
      content: message.content,
      attachments: [...message.attachments.values()].map((attachment) => ({
        name: attachment.name,
        url: attachment.url,
      })),
    };
  }

  private bodyOf(message: MirrorMessage): string {
    return toHtmlBody(message.content) || '<i>(attachment)</i>';
  }

  private dummyEmail(discordUserId: string): string {
    return `${discordUserId}@${env.FRESHDESK_DUMMY_EMAIL_DOMAIN}`;
  }
}
