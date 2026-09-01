import { LoggerRepository } from '@common/server/otel';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { FreshdeskWebhookGuard } from 'src/middleware/freshdeskWebhook.guard';
import { FreshdeskSyncService } from 'src/services/freshdeskSync.service';
import { z } from 'zod';

const pingSchema = z.object({
  ticket_id: z.coerce.number().int().positive(),
});

@Controller('/hooks/freshdesk')
@UseGuards(FreshdeskWebhookGuard)
export class WebhookController {
  constructor(
    private readonly sync: FreshdeskSyncService,
    private readonly logger: LoggerRepository,
  ) {}

  // The payload is only a hint: the sync re-reads everything from the
  // Freshdesk API, so a forged ticket_id can at most trigger a no-op sync.
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  notify(@Body() body: unknown): void {
    const parsed = pingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    void this.sync
      .onFreshdeskPing(String(parsed.data.ticket_id))
      .catch((error: unknown) => this.logger.error(error, 'freshdesk webhook processing failed'));
  }
}
