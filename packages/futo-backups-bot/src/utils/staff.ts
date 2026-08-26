import { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import { env } from 'src/env';

export const isStaff = (interaction: ButtonInteraction | ChatInputCommandInteraction): boolean => {
  const roles = interaction.member?.roles;
  if (!roles) {
    return false;
  }
  return Array.isArray(roles) ? roles.includes(env.DISCORD_STAFF_ROLE_ID) : roles.cache.has(env.DISCORD_STAFF_ROLE_ID);
};
