import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IntrospectionService } from 'src/services/introspection.service';

// Internal, service-to-service only (michael). Authenticated by a shared secret
// header, not a user session, and excluded from the OpenAPI spec so it never
// reaches the generated client.
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
