import { Controller, Get } from '@nestjs/common';
import { AuthRoute } from 'src/middleware/auth.guard';
import { AppService } from 'src/services/app.service';

@Controller()
export class AppController {
  constructor(private readonly service: AppService) {}

  @Get()
  hello(): Promise<string> {
    return this.service.hello();
  }

  @Get('/protected-route')
  @AuthRoute()
  protectedRoute(): Promise<string> {
    return this.service.hello();
  }
}
