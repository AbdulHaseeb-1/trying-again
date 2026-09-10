import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class DerivativesQueryDto {
  @ApiPropertyOptional({ description: 'Asset to return the breakdown for, e.g. BTC.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9._-]{1,20}$/, { message: 'symbol must be a ticker like BTC' })
  symbol?: string;
}
