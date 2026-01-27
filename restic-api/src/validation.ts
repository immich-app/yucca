import { IsEnum, IsNotEmpty, Matches } from 'class-validator';
import { BlobType } from './enum';

export class BlobParamsDto {
  @IsNotEmpty()
  @IsEnum(BlobType)
  type!: BlobType;
}

export class BlobWithNameParamsDto extends BlobParamsDto {
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/)
  name!: string;
}
