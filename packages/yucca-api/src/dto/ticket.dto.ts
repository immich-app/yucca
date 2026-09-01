import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { TicketAction } from 'src/enum';
import { RepositoryMeterDto, RepositoryMetricsDto } from './repository.dto';

export class TicketCreateRequestDto {
  @ApiProperty({ enum: TicketAction, enumName: 'TicketAction' })
  @IsEnum(TicketAction)
  action!: TicketAction;

  @ApiProperty({ description: 'Repository the ticket is bound to' })
  @IsUUID()
  repositoryId!: string;
}

export class TicketCreateResponseDto {
  @ApiProperty({ description: 'IdP URL the browser must be sent to' })
  redirectTo!: string;
}

export class TicketDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: TicketAction, enumName: 'TicketAction' })
  action!: TicketAction;

  @ApiProperty()
  repositoryId!: string;

  @ApiProperty()
  repositoryName!: string;

  @ApiProperty()
  metrics!: RepositoryMetricsDto;

  @ApiProperty({ required: false })
  meter?: RepositoryMeterDto;
}
