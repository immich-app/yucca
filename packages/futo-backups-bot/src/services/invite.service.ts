import { LoggerRepository } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  User,
} from 'discord.js';
import { ComponentId } from 'src/enum';
import { env } from 'src/env';
import { DiscordRepository } from 'src/repositories/discord.repository';
import { YuccaApiRepository } from 'src/repositories/yuccaApi.repository';
import { isStaff } from 'src/utils/staff';

@Injectable()
export class InviteService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly discord: DiscordRepository,
    private readonly api: YuccaApiRepository,
  ) {}

  async onInviteCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isStaff(interaction)) {
      await interaction.reply({ content: 'Only staff can send beta invites.', flags: MessageFlags.Ephemeral });
      return;
    }

    const target = interaction.options.getUser('user');
    const channel = interaction.options.getChannel('channel');
    if (Boolean(target) === Boolean(channel)) {
      await interaction.reply({
        content: 'Pick either a user to DM or a channel to post in.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (target) {
      return this.inviteUser(interaction, target);
    }
    return this.postBatch(
      interaction,
      channel!.id,
      interaction.options.getInteger('limit'),
      this.roleMention(interaction),
    );
  }

  private roleMention(interaction: ChatInputCommandInteraction): string | null {
    const role = interaction.options.getRole('mention');
    if (!role) {
      return null;
    }
    // The everyone role's id is the guild id; <@&guildId> renders as a broken
    // "@@everyone" and pings nobody.
    return role.id === interaction.guildId ? '@everyone' : `<@&${role.id}>`;
  }

  private async inviteUser(interaction: ChatInputCommandInteraction, target: User): Promise<void> {
    const result = await this.api.createInvite(target.id, target.username);
    if (result.status !== 'ok') {
      const content =
        result.status === 'invite-used'
          ? `<@${target.id}> already used their beta invite.`
          : `<@${target.id}> already has a FUTO Backups account — no invite needed.`;
      await interaction.editReply({ content });
      return;
    }

    const url = this.inviteUrl(result.code);
    const delivered = await this.discord.sendDirectMessage(target.id, {
      content: "You're invited to the FUTO Backups closed beta! This personal link is valid for 10 minutes.",
      components: [this.linkRow(url)],
    });
    await interaction.editReply({
      content: delivered
        ? `Invite sent to <@${target.id}>.`
        : `<@${target.id}> has DMs closed — pass this personal link along: ${url}`,
    });
  }

  private async postBatch(
    interaction: ChatInputCommandInteraction,
    channelId: string,
    limit: number | null,
    mention: string | null,
  ): Promise<void> {
    if (!limit) {
      await interaction.editReply({ content: 'Set a limit when posting invites to a channel.' });
      return;
    }

    const batchId = await this.api.createInviteBatch(
      interaction.guildId ?? env.DISCORD_GUILD_ID,
      channelId,
      limit,
      interaction.user.id,
    );
    const message = await this.discord.sendMessage(channelId, {
      content: `${mention ? `${mention} ` : ''}We're opening ${limit} spot${limit === 1 ? '' : 's'} in the FUTO Backups closed beta — first come, first served.`,
      components: [this.claimRow(batchId, 'Claim your invite')],
    });
    // The message id is audit-only (disabling edits interaction.message), so a
    // failure here must not report a live drop as failed and invite a repost.
    await this.api
      .setInviteBatchMessage(batchId, message.id)
      .catch((error: unknown) => this.logger.warn(error, 'could not record the invite drop message id'));
    await interaction.editReply({ content: `Posted ${limit} invites in <#${channelId}>.` });
  }

  async onClaimInvite(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const batchId = interaction.customId.slice(ComponentId.ClaimInvite.length + 1);
    const result = await this.api.createInvite(interaction.user.id, interaction.user.username, batchId);
    switch (result.status) {
      case 'already-linked': {
        await interaction.editReply({ content: 'You already have a FUTO Backups account — no invite needed.' });
        return;
      }
      case 'invite-used': {
        await interaction.editReply({ content: 'You already used your beta invite.' });
        return;
      }
      case 'exhausted': {
        await this.disableClaimButton(interaction, batchId);
        await interaction.editReply({
          content: 'All invites have been claimed — keep an eye out for the next drop.',
        });
        return;
      }
    }

    await interaction.editReply({
      content: "You're in! This personal link is valid for 10 minutes — claim again if it expires.",
      components: [this.linkRow(this.inviteUrl(result.code))],
    });
    if (result.remaining === 0) {
      await this.disableClaimButton(interaction, batchId);
    }
  }

  private async disableClaimButton(interaction: ButtonInteraction, batchId: string): Promise<void> {
    await interaction.message
      .edit({ components: [this.claimRow(batchId, 'All invites claimed', true)] })
      .catch((error: unknown) => this.logger.warn(error, 'could not disable the claim button'));
  }

  private inviteUrl(code: string): string {
    return `${env.WEB_URL}/login/invite?token=${code}`;
  }

  private linkRow(url: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Join the beta').setURL(url),
    );
  }

  private claimRow(batchId: string, label: string, disabled = false) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ComponentId.ClaimInvite}:${batchId}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    );
  }
}
