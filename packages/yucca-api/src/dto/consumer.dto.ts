import { ConsumerTypes } from '@common/server';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsIn, IsString, IsUUID } from 'class-validator';

export class ConsumerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ConsumerTypes })
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

export class ConsumerListResponseDto {
  @ApiProperty({ type: [ConsumerDto] })
  consumers!: ConsumerDto[];
}

export class ConsumerCreateRequestDto {
  @ApiProperty({ enum: ConsumerTypes })
  @IsIn(ConsumerTypes)
  type!: string;

  @ApiProperty()
  @IsString()
  name!: string;
}

export class ConsumerUpdateRequestDto {
  @ApiProperty()
  @IsString()
  name!: string;
}

export class ConsumerResponseDto {
  @ApiProperty()
  consumer!: ConsumerDto;
}

export class ConsumerAdoptRequestDto {
  @ApiProperty({ type: [String], description: 'Repositories to move from the default consumer to this one' })
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  repositoryIds!: string[];
}
