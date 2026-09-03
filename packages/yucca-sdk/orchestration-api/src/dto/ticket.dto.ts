import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { TicketAction } from '../enum';

export class TicketCreateRequestDto {
  @ApiProperty({ enum: TicketAction, enumName: 'TicketAction' })
  @IsEnum(TicketAction)
  action!: TicketAction;

  @ApiProperty({ description: 'Repository the ticket is bound to' })
  @IsUUID()
  repositoryId!: string;
}

export class TicketCreateResponseDto {
  @ApiProperty({ description: 'Identity provider URL the browser must be sent to' })
  redirectTo!: string;
}
