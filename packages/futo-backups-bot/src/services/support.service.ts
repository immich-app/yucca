import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
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
import { DiscordRepository } from 'src/repositories/discord.repository';
import { DiscordLink, UserSummary, YuccaApiRepository } from 'src/repositories/yuccaApi.repository';

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
  ) {}

  async onApplicationBootstrap() {
    if (!this.discord.enabled) {
      return;
    }
    await this.discord.start((interaction) => this.handleInteraction(interaction));
    await this.discord.registerCommands();
    await this.discord.ensurePinnedSupportMessage({
      content: 'Need help with FUTO Backups? Click below to open a private ticket with our staff.',
      components: [this.buttonRow(ComponentId.OpenTicket, 'Get support')],
    });
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isButton()) {
        switch (interaction.customId) {
          case ComponentId.OpenTicket:
          case ComponentId.CreateTicket: {
            return await this.onOpenRequested(interaction);
          }
          case ComponentId.CloseTicket: {
            return await this.onCloseRequested(interaction);
          }
        }
      }
      if (interaction.isModalSubmit() && interaction.customId === ComponentId.TicketModal) {
        return await this.onTicketSubmitted(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
        return await this.onStaffTicket(interaction);
      }
    } catch (error) {
      this.logger.error(error, 'failed to handle interaction');
      if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isChatInputCommand()) {
        return;
      }
      const content = 'Something went wrong, please try again.';
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
        content: 'Support is temporarily unavailable, please try again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!link) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return this.startLinkFlow(interaction);
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(ComponentId.TicketModal)
        .setTitle('Get support')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(ComponentId.TicketDescription)
              .setLabel('Describe your issue')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(10)
              .setMaxLength(1000),
          ),
        ),
    );
  }

  private async startLinkFlow(interaction: ButtonInteraction) {
    const { code, expiresAt } = await this.api.createLinkRequest(interaction.user.id, interaction.user.username);
    const url = `${env.WEB_URL}/link/discord?code=${code}`;

    await interaction.editReply({
      content: 'First, link your Discord account to your FUTO Backups account. The link is valid for 10 minutes.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Link account').setURL(url),
        ),
      ],
    });

    while (Date.now() < expiresAt.getTime()) {
      await sleep(LINK_POLL_INTERVAL_MS);
      const link = await this.api.getLink(interaction.user.id).catch(() => null);
      if (link) {
        await interaction.editReply({
          content: 'Account linked! Now open your ticket.',
          components: [this.buttonRow(ComponentId.CreateTicket, 'Open ticket')],
        });
        return;
      }
    }

    await interaction.editReply({
      content: 'The link expired. Click the support button again to get a new one.',
      components: [],
    });
  }

  private async onTicketSubmitted(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const link = await this.api.getLink(interaction.user.id);
    if (!link) {
      await interaction.editReply({
        content: 'Your Discord account is no longer linked. Click the support button to link it again.',
      });
      return;
    }

    if (this.creating.has(interaction.user.id)) {
      await interaction.editReply({ content: 'Your ticket is already being created.' });
      return;
    }
    this.creating.add(interaction.user.id);
    try {
      const existing = await this.discord.findOpenTicketThread(interaction.user.id);
      if (existing) {
        await interaction.editReply({ content: `You already have an open ticket: <#${existing.id}>` });
        return;
      }

      const description = interaction.fields.getTextInputValue(ComponentId.TicketDescription);
      const thread = await this.openTicket(interaction.user, description);
      await interaction.editReply({ content: `Your ticket is ready: <#${thread.id}>` });
    } finally {
      this.creating.delete(interaction.user.id);
    }
  }

  private async onStaffTicket(interaction: ChatInputCommandInteraction) {
    if (!this.isStaff(interaction)) {
      await interaction.reply({ content: 'Only staff can open tickets for users.', flags: MessageFlags.Ephemeral });
      return;
    }

    const target = interaction.options.getUser('user', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (this.creating.has(target.id)) {
      await interaction.editReply({ content: 'A ticket for that user is already being created.' });
      return;
    }
    this.creating.add(target.id);
    try {
      const existing = await this.discord.findOpenTicketThread(target.id);
      if (existing) {
        await interaction.editReply({ content: `<@${target.id}> already has an open ticket: <#${existing.id}>` });
        return;
      }

      const thread = await this.openTicket(target, `Opened by staff (<@${interaction.user.id}>).`);
      await interaction.editReply({ content: `Ticket ready: <#${thread.id}>` });
    } finally {
      this.creating.delete(target.id);
    }
  }

  private async openTicket(user: User, description: string): Promise<ThreadChannel> {
    const suffix = this.ticketSuffix(user.username, user.id);
    const thread = await this.discord.createTicketThread(`ticket-${suffix}`, user.id);

    await thread.send({
      content: `<@${user.id}> <@&${env.DISCORD_STAFF_ROLE_ID}>`,
      embeds: [new EmbedBuilder().setTitle('Support ticket').setDescription(description)],
      components: [this.buttonRow(ComponentId.CloseTicket, 'Close ticket', ButtonStyle.Danger)],
    });

    const link = await this.api.getLink(user.id).catch((error: unknown) => {
      this.logger.error(error, 'failed to look up link for staff note');
      return null;
    });
    const summary = link
      ? await this.api.getUserSummary(link.userId).catch((error: unknown) => {
          this.logger.error(error, 'failed to fetch user summary');
          return null;
        })
      : null;
    await this.discord.createStaffThread(`staff-${suffix}`, this.staffNote(link, summary));

    return thread;
  }

  private async onCloseRequested(interaction: ButtonInteraction) {
    if (!this.isStaff(interaction)) {
      await interaction.reply({ content: 'Only staff can close tickets.', flags: MessageFlags.Ephemeral });
      return;
    }

    const thread = interaction.channel;
    if (
      !(thread instanceof ThreadChannel) ||
      thread.parentId !== env.DISCORD_SUPPORT_CHANNEL_ID ||
      !thread.name.startsWith('ticket-')
    ) {
      await interaction.reply({ content: 'This channel is not a ticket.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    await interaction.editReply({ content: `Ticket closed by <@${interaction.user.id}>.` });

    const staffThread = await this.discord.findSupportThreadByName(thread.name.replace(/^ticket-/, 'staff-'));
    if (staffThread) {
      await this.discord.closeThread(staffThread);
    }
    await this.discord.closeThread(thread);
  }

  private isStaff(interaction: ButtonInteraction | ChatInputCommandInteraction): boolean {
    const roles = interaction.member?.roles;
    if (!roles) {
      return false;
    }
    return Array.isArray(roles)
      ? roles.includes(env.DISCORD_STAFF_ROLE_ID)
      : roles.cache.has(env.DISCORD_STAFF_ROLE_ID);
  }

  private ticketSuffix(username: string, discordUserId: string): string {
    return `${username.toLowerCase().replaceAll(/[^a-z0-9-]/g, '')}-${discordUserId.slice(-4)}`;
  }

  private staffNote(link: DiscordLink | null, summary: UserSummary | null): string {
    const lines = ['Staff notes — not visible to the user.'];
    if (!link) {
      lines.push('No linked FUTO Backups account.');
      return lines.join('\n');
    }
    if (env.GRAFANA_USER_DASHBOARD_URL) {
      lines.push(`Grafana: ${env.GRAFANA_USER_DASHBOARD_URL.replaceAll('{userId}', link.userId)}`);
    }
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
