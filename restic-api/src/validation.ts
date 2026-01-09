import { IsIn, IsNotEmpty, IsString } from 'class-validator';

const OBJECT_TYPES = ['data', 'index', 'keys', 'locks', 'snapshots'] as const;

export type BlobType = (typeof OBJECT_TYPES)[number];

export class BlobParamsDto {
  @IsNotEmpty()
  @IsString()
  path!: string;

  @IsNotEmpty()
  @IsIn(OBJECT_TYPES)
  type!: BlobType;
}

export class BlobWithNameParamsDto extends BlobParamsDto {
  @IsNotEmpty()
  @IsString()
  name!: string;
}
