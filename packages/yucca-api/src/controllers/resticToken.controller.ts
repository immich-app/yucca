import { Controller, Delete, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { ResticTokenService } from 'src/services/resticToken.service';

// User-facing restic token management. Listing lives under the owning repository
// (GET /repository/:id/restic-tokens); revoke is keyed by jti alone here.
@Controller('/restic-tokens')
export class ResticTokenController {
  constructor(private readonly resticTokens: ResticTokenService) {}

  @Delete('/:jti')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Auth() auth: AuthDto, @Param('jti') jti: string): Promise<void> {
    return this.resticTokens.revoke(auth, jti);
  }
}
