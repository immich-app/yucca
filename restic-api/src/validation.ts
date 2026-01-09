import { IsIn, IsNotEmpty, Matches } from 'class-validator';

const OBJECT_TYPES = ['data', 'index', 'keys', 'locks', 'snapshots'] as const;

export type BlobType = (typeof OBJECT_TYPES)[number];

export class BlobParamsDto {
  @IsNotEmpty()
  @IsIn(OBJECT_TYPES)
  type!: BlobType;
}

export class BlobWithNameParamsDto extends BlobParamsDto {
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/)
  name!: string;
}
