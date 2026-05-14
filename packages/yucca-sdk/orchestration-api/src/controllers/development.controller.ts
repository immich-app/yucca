import { Controller, Post } from '@nestjs/common';
import { DevelopmentService } from '../services/development.service';

@Controller('/yucca/debug')
export class DevelopmentController {
  constructor(private readonly service: DevelopmentService) {}

  @Post('reset')
  async resetOrchestrator(): Promise<void> {
    return this.service.resetOrchestrator();
  }
}
