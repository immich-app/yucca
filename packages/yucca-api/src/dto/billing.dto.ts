import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CustomerBillingStateResponseDto {
  @ApiProperty()
  @IsBoolean()
  subscriptionActive!: boolean;
}

export class CreateCustomerPortalResponseDto {
  @ApiProperty()
  @IsString()
  customerPortalUrl!: string;
}

export class StartSubscriptionResponseDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  checkoutUrl?: string;
}
