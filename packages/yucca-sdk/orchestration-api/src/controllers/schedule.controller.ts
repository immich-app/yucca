import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import {
  ScheduleCreateRequestDto,
  ScheduleCreateResponseDto,
  ScheduleListResponseDto,
  ScheduleUpdateRequestDto,
  ScheduleUpdateResponseDto,
} from '../dto/schedule.dto';
import { ScheduleService } from '../services/schedule.service';

@Controller('/yucca/schedule')
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Post()
  @ApiOkResponse({ type: ScheduleCreateResponseDto })
  createSchedule(@Body() dto: ScheduleCreateRequestDto): Promise<ScheduleCreateResponseDto> {
    return this.service.createSchedule(dto);
  }

  @Get()
  @ApiOkResponse({ type: ScheduleListResponseDto })
  getSchedules(): Promise<ScheduleListResponseDto> {
    return this.service.getSchedules();
  }

  @Patch('/:id')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: ScheduleUpdateResponseDto })
  updateSchedule(@Param('id') id: string, @Body() dto: ScheduleUpdateRequestDto): Promise<ScheduleUpdateResponseDto> {
    return this.service.updateSchedule(id, dto);
  }

  @Delete('/:id')
  @ApiParam({ name: 'id', type: String })
  removeSchedule(@Param('id') id: string): Promise<void> {
    return this.service.removeSchedule(id);
  }

  @Put('/:id/:repositoryId')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'repositoryId', type: String })
  addRepositoryToSchedule(@Param('id') id: string, @Param('repositoryId') repositoryId: string): Promise<void> {
    return this.service.addRepositoryToSchedule(id, repositoryId);
  }

  @Delete('/:id/:repositoryId')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'repositoryId', type: String })
  removeRepositoryFromSchedule(@Param('id') id: string, @Param('repositoryId') repositoryId: string): Promise<void> {
    return this.service.removeRepositoryFromSchedule(id, repositoryId);
  }
}
