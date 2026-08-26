import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalGuard } from 'src/middleware/internal.guard';
import { InviteService } from 'src/services/invite.service';
import { z } from 'zod';

const closeDropSchema = z.object({
  batchId: z.string().min(1),
  channelId: z.string().min(1),
  messageId: z.string().min(1),
});

@Controller('/internal/drops')
@UseGuards(InternalGuard)
export class InternalController {
  constructor(private readonly invite: InviteService) {}

  @Post('/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeDrop(@Body() body: unknown): Promise<void> {
    const parsed = closeDropSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    await this.invite.closeDrop(parsed.data.batchId, parsed.data.channelId, parsed.data.messageId);
  }
}
