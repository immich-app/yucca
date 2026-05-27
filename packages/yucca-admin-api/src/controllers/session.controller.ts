import { Controller, Delete, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { AuthRoute } from 'src/middleware/auth.guard';
import { SessionService } from 'src/services/session.service';

@Controller('/session')
export class SessionController {
  constructor(private readonly session: SessionService) {}

  @Delete('/:id')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSession(@Param('id') id: string): Promise<void> {
    return this.session.delete(id);
  }
}
