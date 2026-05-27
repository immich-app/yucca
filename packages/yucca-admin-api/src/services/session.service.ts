import { Injectable } from '@nestjs/common';
import { SessionListResponseDto } from 'src/dto/session.dto';
import { SessionRepository } from 'src/repositories/session.repository';

@Injectable()
export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  async listForUser(userId: string): Promise<SessionListResponseDto> {
    return { items: await this.sessions.getByUser(userId) };
  }

  async delete(id: string): Promise<void> {
    await this.sessions.delete(id);
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.sessions.deleteByUser(userId);
  }
}
