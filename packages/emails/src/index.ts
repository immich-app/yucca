import { pixelBasedPreset, Renderer, toPlainText } from '@better-svelte-email/server';
import type { Component } from 'svelte';
import Invite from './emails/invite.svelte';
import { theme } from './theme';

export interface RenderedEmail {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface InviteEmailProps {
  inviteCode: string;
  inviteUrl: string;
}

const renderer = new Renderer({
  tailwindConfig: { presets: [pixelBasedPreset], theme },
});

const renderEmail = async (subject: string, component: Component<any>, props: Record<string, unknown>) => {
  const htmlBody = await renderer.render(component, { props });
  return { subject, htmlBody, textBody: toPlainText(htmlBody) };
};

export const renderInviteEmail = (props: InviteEmailProps): Promise<RenderedEmail> =>
  renderEmail("You're invited to FUTO Backups", Invite, { ...props });
