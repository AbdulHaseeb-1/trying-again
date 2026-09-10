import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export const HISTORY_SERIES = [
  'asset',
  'venues',
  'funding',
  'prices',
  'liquidations',
  'market',
  'coins',
] as const;

export class DerivativesHistoryDto {
  @ApiPropertyOptional({
    enum: HISTORY_SERIES,
    default: 'asset',
    description:
      'Which archived series to read: the coin totals, the venue table, funding intervals, the price series, the liquidation feed, market totals, or the whole-market screener.',
  })
  @IsOptional()
  @IsIn(HISTORY_SERIES)
  series?: (typeof HISTORY_SERIES)[number];

  @ApiPropertyOptional({ description: 'Asset to filter by, e.g. BTC.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9._-]{1,20}$/, { message: 'symbol must be a ticker like BTC' })
  symbol?: string;

  @ApiPropertyOptional({ description: 'Venue to filter by, e.g. Binance.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9 ._-]{1,40}$/)
  exchange?: string;

  @ApiPropertyOptional({ description: 'Inclusive ISO start of the range.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Inclusive ISO end of the range.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'Maximum rows to return.', default: 500, maximum: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5_000)
  limit?: number;
}
