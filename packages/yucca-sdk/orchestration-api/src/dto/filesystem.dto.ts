import { ApiProperty } from '@nestjs/swagger';

export class FilesystemListingRequestDto {
  @ApiProperty({ type: () => String, required: false })
  path?: string;
}

export class FilesystemListingItemDto {
  @ApiProperty({ type: () => String })
  path!: string;

  @ApiProperty({ type: () => [Boolean] })
  isDirectory!: boolean;
}

export class FilesystemListingResponseDto {
  @ApiProperty({ type: () => String })
  parent!: string;

  @ApiProperty({ type: () => String })
  path!: string;

  @ApiProperty({ type: () => [FilesystemListingItemDto] })
  items!: FilesystemListingItemDto[];
}
