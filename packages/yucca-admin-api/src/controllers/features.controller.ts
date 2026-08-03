import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import {
  FeatureEnableBatchRequestDto,
  FeatureEnableBatchResponseDto,
  FeatureFlagListResponseDto,
  FeatureUsersResponseDto,
} from 'src/dto/features.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { FeaturesService } from 'src/services/features.service';

@Controller('/features')
export class FeaturesController {
  constructor(private readonly features: FeaturesService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: FeatureFlagListResponseDto })
  listFeatures(): Promise<FeatureFlagListResponseDto> {
    return this.features.list();
  }

  @Get('/:flag/users')
  @AuthRoute()
  @ApiOkResponse({ type: FeatureUsersResponseDto })
  listFeatureUsers(@Param('flag') flag: string): Promise<FeatureUsersResponseDto> {
    return this.features.listUsers(flag);
  }

  @Post('/:flag/enable-batch')
  @AuthRoute()
  @ApiOkResponse({ type: FeatureEnableBatchResponseDto })
  enableFeatureBatch(
    @Auth() auth: AuthDto,
    @Param('flag') flag: string,
    @Body() dto: FeatureEnableBatchRequestDto,
  ): Promise<FeatureEnableBatchResponseDto> {
    return this.features.enableBatch(auth, flag, dto);
  }
}
