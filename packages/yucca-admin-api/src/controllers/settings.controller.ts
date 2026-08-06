import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { SettingsEntryResponseDto, SettingsListResponseDto, SettingsValueDto } from 'src/dto/settings.dto';
import { AuthRoute } from 'src/middleware/auth.guard';
import { SettingsService } from 'src/services/settings.service';

@Controller('/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: SettingsListResponseDto })
  listSettings(): Promise<SettingsListResponseDto> {
    return this.settings.list();
  }

  // Body deliberately raw (not a validated DTO): the service validates against the strict settings registry, so
  // unknown keys are rejected instead of silently stripped by the whitelist pipe.
  @Put('/:scope')
  @AuthRoute()
  @ApiBody({ type: SettingsValueDto })
  @ApiOkResponse({ type: SettingsEntryResponseDto })
  setSettings(
    @Param('scope') scope: string,
    @Body() value: Record<string, unknown>,
  ): Promise<SettingsEntryResponseDto> {
    return this.settings.set(scope, value);
  }

  @Delete('/:scope')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSettings(@Param('scope') scope: string): Promise<void> {
    return this.settings.delete(scope);
  }
}
