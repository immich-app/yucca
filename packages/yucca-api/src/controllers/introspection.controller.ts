import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IntrospectionService } from 'src/services/introspection.service';

@ApiExcludeController()
@Controller('/internal/restic-tokens')
export class IntrospectionController {
  constructor(private readonly introspection: IntrospectionService) {}

  @Get('/:jti')
  introspect(
    @Headers('x-introspection-secret') secret: string | undefined,
    @Param('jti') jti: string,
  ): Promise<{ active: boolean }> {
    return this.introspection.introspect(secret, jti);
  }
}
