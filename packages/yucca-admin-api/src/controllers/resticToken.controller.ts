import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import { ResticTokenListQueryDto, ResticTokenListResponseDto } from 'src/dto/resticToken.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { ResticTokenService } from 'src/services/resticToken.service';

@Controller('/restic-tokens')
export class ResticTokenController {
  constructor(private readonly resticTokens: ResticTokenService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: ResticTokenListResponseDto })
  listResticTokens(@Query() query: ResticTokenListQueryDto): Promise<ResticTokenListResponseDto> {
    return this.resticTokens.list(query);
  }

  @Delete('/:jti')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeResticToken(@Auth() auth: AuthDto, @Param('jti') jti: string): Promise<void> {
    return this.resticTokens.revoke(auth, jti);
  }
}
