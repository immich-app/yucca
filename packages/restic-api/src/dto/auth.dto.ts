import { IsBoolean, IsUUID } from 'class-validator';

export class AuthDto {
  @IsUUID()
  user!: string;

  @IsUUID()
  repository!: string;

  @IsBoolean()
  writeOnce!: boolean;
}
