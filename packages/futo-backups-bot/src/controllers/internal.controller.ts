import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalGuard } from 'src/middleware/internal.guard';
import { InviteService } from 'src/services/invite.service';
import { SupportService } from 'src/services/support.service';
import { z } from 'zod';

const closeDropSchema = z.object({
  batchId: z.string().min(1),
  channelId: z.string().min(1),
  messageId: z.string().min(1),
});

const staffNoteSchema = z.object({
  staffThreadId: z.string().min(1),
  content: z.string().min(1).max(8192),
});

@Controller('/internal')
@UseGuards(InternalGuard)
export class InternalController {
  constructor(
    private readonly invite: InviteService,
    private readonly support: SupportService,
  ) {}

  @Post('/drops/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeDrop(@Body() body: unknown): Promise<void> {
    const parsed = closeDropSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    await this.invite.closeDrop(parsed.data.batchId, parsed.data.channelId, parsed.data.messageId);
  }

  @Post('/staff-notes')
  @HttpCode(HttpStatus.NO_CONTENT)
  async postStaffNote(@Body() body: unknown): Promise<void> {
    const parsed = staffNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    await this.support.postStaffNote(parsed.data.staffThreadId, parsed.data.content);
  }
}
