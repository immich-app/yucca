import { Controller, Get } from '@nestjs/common';
import { AppService } from 'src/services/app.service';

@Controller()
export class AppController {
  constructor(private readonly service: AppService) {}

  @Get()
  hello(): string {
    return this.service.hello();
  }
}
