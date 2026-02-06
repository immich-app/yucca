import { Controller, Get } from '@nestjs/common';

@Controller()
export class OrchestrationApiController {
  @Get()
  test() {
    return 'hi!';
  }
}
