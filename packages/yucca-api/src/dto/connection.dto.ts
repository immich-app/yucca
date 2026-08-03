import { ConnectionTypes } from '@common/server';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export class ConnectionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ConnectionTypes })
  type!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  lastSeenAt!: Date | null;

  @ApiProperty()
  repositoryCount!: number;
}

export class ConnectionListResponseDto {
  @ApiProperty({ type: [ConnectionDto] })
  connections!: ConnectionDto[];
}

export class ConnectionCreateRequestDto {
  @ApiProperty({ enum: ConnectionTypes })
  @IsIn(ConnectionTypes)
  type!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;
}

export class ConnectionUpdateRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;
}

export class ConnectionResponseDto {
  @ApiProperty()
  connection!: ConnectionDto;
}

export class ConnectionAdoptRequestDto {
  @ApiProperty({ type: [String], description: 'Repositories to move from the default connection to this one' })
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  repositoryIds!: string[];
}
