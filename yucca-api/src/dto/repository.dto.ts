import { ApiProperty } from '@nestjs/swagger';

export class RepositoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  worm!: boolean;
}

export class RepositoryCreateResponseDto {
  @ApiProperty()
  repository!: RepositoryDto;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: [RepositoryDto] })
  repositories!: RepositoryDto[];
}

export class RepositoryCreateResticUrlDto {
  @ApiProperty()
  url!: string;
}
