import { LoggerRepository } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import {
  AnyThreadChannel,
  ChannelType,
  Client,
  DiscordAPIError,
  GatewayIntentBits,
  Guild,
  Interaction,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  SlashCommandBuilder,
  TextChannel,
  ThreadChannel,
} from 'discord.js';
import { env } from 'src/env';
import { TranscriptMessage } from 'src/utils/transcript';

const THREAD_AUTO_ARCHIVE_MINUTES = 10_080;
const CANNOT_MESSAGE_USER = 50_007;

@Injectable()
export class DiscordRepository {
  private client: Client | null = null;

  constructor(private logger: LoggerRepository) {}

  get enabled(): boolean {
    return Boolean(env.DISCORD_BOT_TOKEN);
  }

  async start(
    onInteraction: (interaction: Interaction) => Promise<void>,
    onMessage?: (message: Message) => Promise<void>,
  ): Promise<void> {
    if (!env.DISCORD_BOT_TOKEN) {
      this.logger.info('DISCORD_BOT_TOKEN is not set — the bot stays idle');
      return;
    }

    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });
    client.on('interactionCreate', (interaction) => void onInteraction(interaction));
    if (onMessage) {
      client.on('messageCreate', (message) => void onMessage(message));
    }
    client.on('error', (error) => this.logger.error(error, 'discord client error'));
    await client.login(env.DISCORD_BOT_TOKEN);
    this.client = client;
  }

  async registerCommands(): Promise<void> {
    const guild = await this.guild();
    await guild.commands.set([
      new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Open a support ticket for a user (staff only)')
        .addUserOption((option) =>
          option.setName('user').setDescription('The user to open the ticket for').setRequired(true),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('staff-notes')
        .setDescription("Link this ticket's staff-notes thread (staff only)")
        .toJSON(),
      new SlashCommandBuilder()
        .setName('claim-backups-role')
        .setDescription('Claim the FUTO Backups customer role for your linked account')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('email-updates')
        .setDescription('Toggle email copies of staff replies for this ticket')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('handoff')
        .setDescription('Close this ticket on Discord and hand it to email support (staff only)')
        .toJSON(),
      new SlashCommandBuilder()
        .setName('beta-invite')
        .setDescription('Invite a user to the closed beta or post a claim button (staff only)')
        .addUserOption((option) => option.setName('user').setDescription('DM a personal invite to this user'))
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Post a claim button in this channel')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('How many invites the channel post hands out')
            .setMinValue(1)
            .setMaxValue(500),
        )
        .addRoleOption((option) => option.setName('mention').setDescription('Role to mention in the channel post'))
        .toJSON(),
    ]);
  }

  async listRecentMessages(channelId: string, limit: number): Promise<Message[]> {
    const channel = await this.textChannel(channelId);
    const messages = await channel.messages.fetch({ limit });
    return [...messages.values()];
  }

  async sendMessage(channelId: string, message: MessageCreateOptions): Promise<Message> {
    const channel = await this.textChannel(channelId);
    return channel.send(message);
  }

  async editMessage(channelId: string, messageId: string, edit: MessageEditOptions): Promise<void> {
    const channel = await this.textChannel(channelId);
    const message = await channel.messages.fetch(messageId);
    await message.edit(edit);
  }

  async sendDirectMessage(discordUserId: string, message: MessageCreateOptions): Promise<boolean> {
    const user = await this.requireClient().users.fetch(discordUserId);
    try {
      await user.send(message);
      return true;
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === CANNOT_MESSAGE_USER) {
        return false;
      }
      throw error;
    }
  }

  async addRoleToMember(discordUserId: string, roleId: string): Promise<void> {
    const guild = await this.guild();
    const member = await guild.members.fetch(discordUserId);
    await member.roles.add(roleId);
  }

  async ensurePinnedMessage(channelId: string, message: MessageCreateOptions, buttonId: string): Promise<void> {
    const channel = await this.textChannel(channelId);
    const [pinned, recent] = await Promise.all([
      channel.messages.fetchPinned(),
      channel.messages.fetch({ limit: 100 }),
    ]);
    const botId = this.requireClient().user?.id;
    const candidates = new Map([...pinned.entries(), ...recent.entries()]);
    const stickies = [...candidates.values()]
      .filter(
        (candidate) =>
          candidate.author.id === botId &&
          candidate.components.some(
            (row) =>
              'components' in row &&
              row.components.some((component) => 'customId' in component && component.customId === buttonId),
          ),
      )
      .toSorted((a, b) => a.createdTimestamp - b.createdTimestamp);

    const keep = stickies[0] ?? (await channel.send(message));
    for (const extra of stickies.slice(1)) {
      await extra
        .delete()
        .catch((error: unknown) => this.logger.warn(error, 'could not delete a duplicate support message'));
    }
    if (!keep.pinned) {
      await keep
        .pin()
        .catch((error: unknown) =>
          this.logger.warn(error, 'could not pin the support message — is Pin Messages granted?'),
        );
    }
  }

  async createTicketThread(name: string, discordUserId: string): Promise<ThreadChannel> {
    const channel = await this.supportChannel();
    const thread = await channel.threads.create({
      name,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: THREAD_AUTO_ARCHIVE_MINUTES,
    });
    await thread.members.add(discordUserId);
    return thread;
  }

  async createStaffThread(name: string, content: string): Promise<{ thread: ThreadChannel; seed: Message }> {
    const channel = await this.supportChannel();
    const thread = await channel.threads.create({
      name,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: THREAD_AUTO_ARCHIVE_MINUTES,
    });
    const seed = await thread.send(content);
    return { thread, seed };
  }

  async getThreadById(threadId: string): Promise<AnyThreadChannel> {
    const guild = await this.guild();
    const channel = await guild.channels.fetch(threadId);
    if (!channel?.isThread()) {
      throw new TypeError(`Channel ${threadId} is not a thread`);
    }
    return channel;
  }

  async sendToThread(threadId: string, message: MessageCreateOptions): Promise<void> {
    const thread = await this.getThreadById(threadId);
    await thread.send(message);
  }

  async fetchMessagesAfter(threadId: string, afterId: string | null): Promise<Message[]> {
    const thread = await this.getThreadById(threadId);
    const all: Message[] = [];
    let after = afterId ?? '0';
    for (;;) {
      const batch = await thread.messages.fetch({ limit: 100, after });
      if (batch.size === 0) {
        return all;
      }
      const ascending = [...batch.values()].toSorted((a, b) => a.createdTimestamp - b.createdTimestamp);
      all.push(...ascending);
      after = ascending.at(-1)!.id;
      if (batch.size < 100) {
        return all;
      }
    }
  }

  async listOpenTicketThreads(discordUserId: string): Promise<ThreadChannel[]> {
    const channel = await this.supportChannel();
    const active = await channel.threads.fetchActive();
    const open: ThreadChannel[] = [];
    for (const thread of active.threads.values()) {
      if (thread.parentId !== channel.id || !thread.name.startsWith('ticket-')) {
        continue;
      }
      // Listing thread members needs the privileged GUILD_MEMBERS intent; the
      // single-member fetch does not (404 = not a member).
      const member = await thread.members.fetch(discordUserId).catch((error: unknown) => {
        if (error instanceof DiscordAPIError && Number(error.status) === 404) {
          return null;
        }
        throw error;
      });
      if (member) {
        open.push(thread);
      }
    }
    return open;
  }

  async findSupportThreadByName(name: string, includeLocked = false): Promise<AnyThreadChannel | undefined> {
    const channel = await this.supportChannel();
    const active = await channel.threads.fetchActive();
    const match = [...active.threads.values()].find((thread) => thread.parentId === channel.id && thread.name === name);
    if (match) {
      return match;
    }
    const archived = await this.fetchAllArchivedThreads(channel, 'private');
    return archived.find((thread) => thread.name === name && (includeLocked || thread.locked !== true));
  }

  async closeThread(thread: AnyThreadChannel): Promise<void> {
    if (thread.archived) {
      await thread.setArchived(false);
    }
    await thread.setLocked(true);
    await thread.setArchived(true);
  }

  async listClosedTicketThreads(): Promise<AnyThreadChannel[]> {
    const channel = await this.supportChannel();
    const archived = await this.fetchAllArchivedThreads(channel, 'private');
    return archived.filter(
      (thread) => thread.locked === true && (thread.name.startsWith('ticket-') || thread.name.startsWith('staff-')),
    );
  }

  async fetchAllMessages(thread: AnyThreadChannel): Promise<TranscriptMessage[]> {
    const all: TranscriptMessage[] = [];
    let before: string | undefined;
    for (;;) {
      const batch = await thread.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (batch.size === 0) {
        return all;
      }
      for (const message of batch.values()) {
        all.push({
          createdAt: message.createdAt,
          author: message.author.username,
          content: message.content,
          attachmentUrls: [...message.attachments.values()].map((attachment) => attachment.url),
        });
      }
      before = batch.last()?.id;
      if (batch.size < 100) {
        return all;
      }
    }
  }

  async deleteThread(thread: AnyThreadChannel): Promise<void> {
    await thread.delete();
  }

  private async fetchAllArchivedThreads(channel: TextChannel, type: 'public' | 'private'): Promise<AnyThreadChannel[]> {
    const all: AnyThreadChannel[] = [];
    let before: Date | undefined;
    for (;;) {
      const batch = await channel.threads.fetchArchived({ type, ...(before ? { before } : {}) });
      all.push(...batch.threads.values());
      const last = [...batch.threads.values()].at(-1);
      const cursor = last?.archivedAt;
      if (!batch.hasMore || !cursor) {
        return all;
      }
      before = cursor;
    }
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error('Discord client is not started');
    }
    return this.client;
  }

  private guild(): Promise<Guild> {
    return this.requireClient().guilds.fetch(env.DISCORD_GUILD_ID);
  }

  private supportChannel(): Promise<TextChannel> {
    return this.textChannel(env.DISCORD_SUPPORT_CHANNEL_ID);
  }

  private async textChannel(id: string): Promise<TextChannel> {
    const guild = await this.guild();
    const channel = await guild.channels.fetch(id);
    if (!(channel instanceof TextChannel)) {
      throw new TypeError(`Channel ${id} is not a text channel`);
    }
    return channel;
  }
}
