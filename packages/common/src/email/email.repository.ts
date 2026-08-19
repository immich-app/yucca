import { Injectable } from '@nestjs/common';
import z from 'zod';
import { LoggerRepository } from '../otel/logger.repository.js';
import { emailEnv } from './env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  tag?: string;
}

export interface EmailSendResult {
  to: string;
  errorCode: number;
  message: string;
}

const sendResponseSchema = z.object({
  ErrorCode: z.number(),
  Message: z.string(),
});

const BATCH_LIMIT = 500;

@Injectable()
export class EmailRepository {
  constructor(private logger: LoggerRepository) {}

  async send(message: EmailMessage): Promise<void> {
    if (!emailEnv.POSTMARK_SERVER_TOKEN) {
      this.logSkipped([message]);
      return;
    }

    const result = sendResponseSchema.parse(await this.request('/email', toPostmarkMessage(message)));
    if (result.ErrorCode !== 0) {
      throw new Error(`Postmark rejected email to ${message.to}: ${result.ErrorCode} ${result.Message}`);
    }
  }

  async sendBatch(messages: EmailMessage[]): Promise<EmailSendResult[]> {
    if (messages.length === 0) {
      return [];
    }

    if (!emailEnv.POSTMARK_SERVER_TOKEN) {
      this.logSkipped(messages);
      return messages.map((message) => ({ to: message.to, errorCode: 0, message: 'Email sending disabled' }));
    }

    const results: EmailSendResult[] = [];
    for (let offset = 0; offset < messages.length; offset += BATCH_LIMIT) {
      const chunk = messages.slice(offset, offset + BATCH_LIMIT);
      const parsed = z.array(sendResponseSchema).parse(
        await this.request(
          '/email/batch',
          chunk.map((message) => toPostmarkMessage(message)),
        ),
      );
      results.push(
        ...parsed.map((result, i) => ({ to: chunk[i]!.to, errorCode: result.ErrorCode, message: result.Message })),
      );
    }
    return results;
  }

  private logSkipped(messages: EmailMessage[]): void {
    this.logger.info(
      { to: messages.map((message) => message.to), subject: messages[0]?.subject },
      'POSTMARK_SERVER_TOKEN is not set — skipping email send',
    );
  }

  private async request(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(new URL(path, emailEnv.POSTMARK_API_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': emailEnv.POSTMARK_SERVER_TOKEN!,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Postmark ${path} failed: ${response.status} ${response.statusText} — ${await response.text()}`);
    }
    return response.json();
  }
}

const toPostmarkMessage = (message: EmailMessage) => ({
  From: emailEnv.EMAIL_FROM_ADDRESS,
  To: message.to,
  Subject: message.subject,
  HtmlBody: message.htmlBody,
  TextBody: message.textBody,
  MessageStream: 'outbound',
  ...(message.tag === undefined ? {} : { Tag: message.tag }),
});
