import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ScheduleCreateRequestDto, ScheduleCreateResponseDto, ScheduleListResponseDto } from '../dto/schedule.dto';
import { ScheduleService } from '../services/schedule.service';

@Controller('/schedule')
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
  removeRepositoryToSchedule(@Param('id') id: string, @Param('repositoryId') repositoryId: string): Promise<void> {
    return this.service.removeRepositoryFromSchedule(id, repositoryId);
  }
}
