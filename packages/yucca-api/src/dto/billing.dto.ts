import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateCustomerPortalResponseDto {
  @ApiProperty()
  @IsString()
  customerPortalUrl!: string;
}

export class StartSubscriptionResponseDto {
  @ApiProperty()
  @IsString()
  checkoutUrl!: string;
}
