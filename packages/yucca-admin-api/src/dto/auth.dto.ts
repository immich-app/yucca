import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @ApiProperty()
  sub!: string;
}
