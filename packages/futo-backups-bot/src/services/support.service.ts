import { LoggerRepository } from '@common/server/otel';
import { BadRequestException, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
  User,
} from 'discord.js';
import { ComponentId } from 'src/enum';
import { env } from 'src/env';
import { Messages } from 'src/messages';
import { ColumboRepository } from 'src/repositories/columbo.repository';
import { DiscordRepository } from 'src/repositories/discord.repository';
import { DiscordLink, UserSummary, YuccaApiRepository } from 'src/repositories/yuccaApi.repository';
import { FreshdeskSyncService } from 'src/services/freshdeskSync.service';
import { InviteService } from 'src/services/invite.service';
import { isStaff } from 'src/utils/staff';

const LINK_POLL_INTERVAL_MS = 5000;
const LINK_LOOKUP_TIMEOUT_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

@Injectable()
export class SupportService implements OnApplicationBootstrap {
  private readonly creating = new Set<string>();

  constructor(
    private readonly logger: LoggerRepository,
    private readonly discord: DiscordRepository,
    private readonly api: YuccaApiRepository,
    private readonly invite: InviteService,
    private readonly freshdeskSync: FreshdeskSyncService,
    private readonly columbo: ColumboRepository,
  ) {}

  async onApplicationBootstrap() {
    if (!this.discord.enabled) {
      return;
    }
    await this.discord.start(
      (interaction) => this.handleInteraction(interaction),
      (message) => this.freshdeskSync.handleMessage(message),
    );
    try {
      await this.discord.registerCommands();
    } catch (error) {
      this.logger.error(error, 'failed to register slash commands — is the applications.commands scope granted?');
    }
    await this.discord.ensurePinnedMessage(
      env.DISCORD_SUPPORT_CHANNEL_ID,
      {
        content: Messages.supportSticky,
        components: [this.buttonRow(ComponentId.OpenTicket, Messages.supportStickyButton)],
      },
      ComponentId.OpenTicket,
    );
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    // Staging and prod share one Discord application, so every pod is a member
    // of every bound guild and sees the others' interactions. Custom ids and
    // command names are identical across guilds, so without this both pods act
    // on the same click.
    if (env.DISCORD_GUILD_ID && interaction.guildId !== env.DISCORD_GUILD_ID) {
      return;
    }
    try {
      if (interaction.isButton() && interaction.customId.startsWith(`${ComponentId.ClaimInvite}:`)) {
        return await this.invite.onClaimInvite(interaction);
      }
      if (interaction.isButton()) {
        switch (interaction.customId) {
          case ComponentId.OpenTicket:
          case ComponentId.CreateTicket: {
            return await this.onOpenRequested(interaction);
          }
          case ComponentId.CloseTicket: {
            return await this.onCloseRequested(interaction);
          }
          case ComponentId.ClaimRole: {
            return await this.onClaimRequested(interaction);
          }
        }
      }
      if (interaction.isModalSubmit() && interaction.customId === ComponentId.TicketModal) {
        return await this.onTicketSubmitted(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
        return await this.onStaffTicket(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'staff-notes') {
        return await this.onStaffNotesRequested(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'claim-backups-role') {
        return await this.onClaimRequested(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'email-updates') {
        return await this.freshdeskSync.onEmailUpdatesCommand(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'handoff') {
        return await this.freshdeskSync.onHandoffCommand(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'beta-invite') {
        return await this.invite.onInviteCommand(interaction);
      }
    } catch (error) {
      this.logger.error(error, 'failed to handle interaction');
      if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isChatInputCommand()) {
        return;
      }
      const content = Messages.somethingWentWrong;
      if (interaction.deferred) {
        await interaction.editReply({ content }).catch(() => {});
      } else if (!interaction.replied) {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }

  private async onOpenRequested(interaction: ButtonInteraction) {
    let link: DiscordLink | null;
    try {
      link = await withTimeout(this.api.getLink(interaction.user.id), LINK_LOOKUP_TIMEOUT_MS);
    } catch (error) {
      this.logger.error(error, 'link lookup failed');
      await interaction.reply({
        content: Messages.supportUnavailable,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!link) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return this.startLinkFlow(interaction);
    }
    this.syncUsername(link, interaction.user);

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(ComponentId.TicketModal)
        .setTitle(Messages.ticketModalTitle)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(ComponentId.TicketDescription)
              .setLabel(Messages.ticketModalLabel)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(10)
              .setMaxLength(1000),
          ),
        ),
    );
  }

  private async onClaimRequested(interaction: ButtonInteraction | ChatInputCommandInteraction) {
    if (!env.DISCORD_CUSTOMER_ROLE_ID) {
      await interaction.reply({ content: Messages.claimNotAvailable, flags: MessageFlags.Ephemeral });
      return;
    }

    let link: DiscordLink | null;
    try {
      link = await withTimeout(this.api.getLink(interaction.user.id), LINK_LOOKUP_TIMEOUT_MS);
    } catch (error) {
      this.logger.error(error, 'link lookup failed');
      await interaction.reply({
        content: Messages.claimUnavailable,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!link) {
      return this.startLinkFlow(interaction, async () => {
        await this.discord.addRoleToMember(interaction.user.id, env.DISCORD_CUSTOMER_ROLE_ID);
        return { content: Messages.linkedAndClaimed(Messages.chatMention(env.DISCORD_CHAT_CHANNEL_ID)) };
      });
    }

    await this.discord.addRoleToMember(interaction.user.id, env.DISCORD_CUSTOMER_ROLE_ID);
    await interaction.editReply({ content: Messages.roleClaimed(Messages.chatMention(env.DISCORD_CHAT_CHANNEL_ID)) });
  }

  @Cron(CronExpression.EVERY_DAY_AT_NOON)
  async postClaimPrompt() {
    if (!this.discord.enabled || !env.DISCORD_GENERAL_CHANNEL_ID || !env.DISCORD_CUSTOMER_ROLE_ID) {
      return;
    }

    const messages = await this.discord.listRecentMessages(env.DISCORD_GENERAL_CHANNEL_ID, 50);
    const isPrompt = (message: Message) =>
      message.author.bot &&
      message.components.some(
        (row) =>
          'components' in row &&
          row.components.some((component) => 'customId' in component && component.customId === ComponentId.ClaimRole),
      );
    const lastPrompt = messages
      .filter((message) => isPrompt(message))
      .toSorted((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
    const activity = messages.filter(
      (message) => !message.author.bot && (!lastPrompt || message.createdTimestamp > lastPrompt.createdTimestamp),
    );
    if (activity.length < env.CLAIM_PROMPT_MIN_MESSAGES) {
      return;
    }

    if (lastPrompt) {
      await lastPrompt
        .delete()
        .catch((error: unknown) => this.logger.warn(error, 'could not delete the previous claim prompt'));
    }
    await this.discord.sendMessage(env.DISCORD_GENERAL_CHANNEL_ID, {
      content: Messages.claimPrompt(env.DISCORD_CHAT_CHANNEL_ID),
      components: [this.buttonRow(ComponentId.ClaimRole, Messages.claimPromptButton)],
    });
  }

  private chatMention(): string {
    return env.DISCORD_CHAT_CHANNEL_ID ? ` Say hi in <#${env.DISCORD_CHAT_CHANNEL_ID}>.` : '';
  }

  private async startLinkFlow(
    interaction: ButtonInteraction | ChatInputCommandInteraction,
    onLinked?: () => Promise<{ content: string; components?: ActionRowBuilder<ButtonBuilder>[] }>,
  ) {
    const { code, expiresAt } = await this.api.createLinkRequest(interaction.user.id, interaction.user.username);
    const url = `${env.WEB_URL}/link/discord?code=${code}`;

    await interaction.editReply({
      content: Messages.linkIntro,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(Messages.linkButton).setURL(url),
        ),
      ],
    });

    while (Date.now() < expiresAt.getTime()) {
      const link = await this.api.getLink(interaction.user.id).catch(() => null);
      if (link) {
        const success = onLinked
          ? await onLinked()
          : {
              content: Messages.linkedOpenTicket,
              components: [this.buttonRow(ComponentId.CreateTicket, Messages.openTicketButton)],
            };
        await interaction.editReply({ components: [], ...success });
        return;
      }
      await sleep(LINK_POLL_INTERVAL_MS);
    }

    await interaction.editReply({
      content: Messages.linkExpired,
      components: [],
    });
  }

  private async onTicketSubmitted(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const link = await this.api.getLink(interaction.user.id);
    if (!link) {
      await interaction.editReply({
        content: Messages.linkGone,
      });
      return;
    }

    if (this.creating.has(interaction.user.id)) {
      await interaction.editReply({ content: Messages.ticketAlreadyCreating });
      return;
    }
    this.creating.add(interaction.user.id);
    try {
      const open = await this.discord.listOpenTicketThreads(interaction.user.id);
      if (open.length >= env.TICKET_USER_LIMIT) {
        await interaction.editReply({
          content: Messages.ticketLimit(open.length, open.map((thread) => `<#${thread.id}>`).join(' ')),
        });
        return;
      }

      const description = interaction.fields.getTextInputValue(ComponentId.TicketDescription);
      const thread = await this.openTicket(interaction.user, description);
      await interaction.editReply({ content: Messages.ticketReady(thread.id) });
    } finally {
      this.creating.delete(interaction.user.id);
    }
  }

  private async onStaffTicket(interaction: ChatInputCommandInteraction) {
    if (!isStaff(interaction)) {
      await interaction.reply({ content: Messages.staffOnlyTickets, flags: MessageFlags.Ephemeral });
      return;
    }

    const target = interaction.options.getUser('user', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (this.creating.has(target.id)) {
      await interaction.editReply({ content: Messages.ticketAlreadyCreatingStaff });
      return;
    }
    this.creating.add(target.id);
    try {
      const open = await this.discord.listOpenTicketThreads(target.id);
      if (open.length >= env.TICKET_USER_LIMIT) {
        await interaction.editReply({
          content: Messages.ticketLimitStaff(target.id, open.length, open.map((thread) => `<#${thread.id}>`).join(' ')),
        });
        return;
      }

      const thread = await this.openTicket(target, Messages.ticketOpenedByStaff(interaction.user.id));
      await interaction.editReply({ content: Messages.ticketReadyStaff(thread.id) });
    } finally {
      this.creating.delete(target.id);
    }
  }

  private async openTicket(user: User, description: string): Promise<ThreadChannel> {
    const suffix = this.ticketSuffix(user.username, user.id);
    const thread = await this.discord.createTicketThread(`ticket-${suffix}`, user.id);

    const seed = await thread.send({
      content: `<@${user.id}> <@&${env.DISCORD_STAFF_ROLE_ID}>`,
      embeds: [new EmbedBuilder().setTitle(Messages.ticketEmbedTitle).setDescription(description)],
      components: [this.buttonRow(ComponentId.CloseTicket, Messages.closeTicketButton, ButtonStyle.Danger)],
    });

    const link = await this.api.getLink(user.id).catch((error: unknown) => {
      this.logger.error(error, 'failed to look up link for staff note');
      return null;
    });
    if (link) {
      this.syncUsername(link, user);
    }
    const summary = link
      ? await this.api.getUserSummary(link.userId).catch((error: unknown) => {
          this.logger.error(error, 'failed to fetch user summary');
          return null;
        })
      : null;
    const note = this.staffNote(link, summary);
    const staff = await this.discord.createStaffThread(`staff-${suffix}`, `<@&${env.DISCORD_STAFF_ROLE_ID}>\n${note}`);

    void this.freshdeskSync
      .onTicketOpened({
        threadId: thread.id,
        seedMessageId: seed.id,
        staffThreadId: staff.thread.id,
        staffSeedMessageId: staff.seed.id,
        discordUserId: user.id,
        username: user.username,
        userId: link?.userId ?? null,
        description,
        staffNote: note,
      })
      .catch((error: unknown) => this.logger.error(error, 'failed to open the freshdesk ticket'));

    if (link) {
      void this.columbo
        .requestInvestigation({
          ticketThreadId: thread.id,
          staffThreadId: staff.thread.id,
          discordUserId: user.id,
          username: user.username,
          userId: link.userId,
          description,
        })
        .catch((error: unknown) => this.logger.error(error, 'failed to request an investigation'));
    }

    return thread;
  }

  async postStaffNote(staffThreadId: string, content: string): Promise<void> {
    const thread = await this.discord.getThreadById(staffThreadId);
    if (thread.parentId !== env.DISCORD_SUPPORT_CHANNEL_ID || !thread.name.startsWith('staff-')) {
      throw new BadRequestException(`thread ${staffThreadId} is not a staff thread`);
    }
    await this.discord.sendToThread(staffThreadId, {
      embeds: [new EmbedBuilder().setTitle(Messages.investigationTitle).setDescription(content.slice(0, 4096))],
    });
  }

  private async onStaffNotesRequested(interaction: ChatInputCommandInteraction) {
    if (!isStaff(interaction)) {
      await interaction.reply({ content: Messages.staffOnlyNotes, flags: MessageFlags.Ephemeral });
      return;
    }

    const thread = interaction.channel;
    if (
      !(thread instanceof ThreadChannel) ||
      thread.parentId !== env.DISCORD_SUPPORT_CHANNEL_ID ||
      !thread.name.startsWith('ticket-')
    ) {
      await interaction.reply({ content: Messages.notATicket, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const staffThread = await this.discord.findSupportThreadByName(thread.name.replace(/^ticket-/, 'staff-'), true);
    await interaction.editReply({
      content: staffThread ? Messages.staffNotesLink(staffThread.id) : Messages.staffNotesMissing,
    });
  }

  private async onCloseRequested(interaction: ButtonInteraction) {
    if (!isStaff(interaction)) {
      await interaction.reply({ content: Messages.staffOnlyClose, flags: MessageFlags.Ephemeral });
      return;
    }

    const thread = interaction.channel;
    if (
      !(thread instanceof ThreadChannel) ||
      thread.parentId !== env.DISCORD_SUPPORT_CHANNEL_ID ||
      !thread.name.startsWith('ticket-')
    ) {
      await interaction.reply({ content: Messages.notATicket, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    await interaction.editReply({ content: Messages.ticketClosedBy(interaction.user.id) });

    const staffThread = await this.discord.findSupportThreadByName(thread.name.replace(/^ticket-/, 'staff-'));
    if (staffThread) {
      await this.discord.closeThread(staffThread);
    }
    await this.discord.closeThread(thread);

    void this.freshdeskSync
      .onTicketClosed(thread.id)
      .catch((error: unknown) => this.logger.error(error, 'failed to resolve the freshdesk ticket'));
  }

  private syncUsername(link: DiscordLink, user: User) {
    if (!user.username || link.discordUsername === user.username) {
      return;
    }
    void this.api
      .updateLinkUsername(user.id, user.username)
      .catch((error: unknown) => this.logger.warn(error, 'failed to sync discord username'));
  }

  private ticketSuffix(username: string, discordUserId: string): string {
    return `${username.toLowerCase().replaceAll(/[^a-z0-9-]/g, '')}-${discordUserId.slice(-4)}-${Date.now().toString(36)}`;
  }

  private staffNote(link: DiscordLink | null, summary: UserSummary | null): string {
    const lines = [Messages.staffNoteHeader];
    if (!link) {
      lines.push(Messages.staffNoteNoLink);
      return lines.join('\n');
    }
    const grafanaBase = env.GRAFANA_URL.replace(/\/+$/, '');
    lines.push(`Grafana: ${grafanaBase}/d/yucca-per-user?var-user=${encodeURIComponent(link.userId)}`);
    if (summary) {
      lines.push(
        `Account: ${summary.name} <${summary.email}>`,
        `Created: ${summary.createdAt.toISOString()}`,
        `Connections: ${summary.connectionCount} · Repositories: ${summary.repositoryCount}`,
        `Last seen: ${summary.lastSeenAt ? summary.lastSeenAt.toISOString() : 'never'}`,
      );
    }
    return lines.join('\n');
  }

  private buttonRow(id: ComponentId, label: string, style: ButtonStyle = ButtonStyle.Primary) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style),
    );
  }
}
