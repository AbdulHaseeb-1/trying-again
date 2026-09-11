import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

import { NEWS_IMPORTANCE, type NewsImportance } from '../news.types';

const toUpperArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === '') return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((entry) => String(entry).trim().toUpperCase()).filter(Boolean);
};

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === '') return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((entry) => String(entry).trim()).filter(Boolean);
};

export class NewsQueryDto {
  @ApiPropertyOptional({ description: 'Free text over title and summary.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Comma-separated symbols, e.g. BTC,USD.' })
  @IsOptional()
  @Transform(toUpperArray)
  @IsArray()
  symbols?: string[];

  @ApiPropertyOptional({ description: 'Comma-separated categories.' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  categories?: string[];

  @ApiPropertyOptional({ description: 'Comma-separated provider ids.' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  providers?: string[];

  @ApiPropertyOptional({ enum: NEWS_IMPORTANCE })
  @IsOptional()
  @IsIn(NEWS_IMPORTANCE)
  minImportance?: NewsImportance;

  @ApiPropertyOptional({ description: 'Inclusive ISO start.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive ISO end.' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
