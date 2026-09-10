import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { IMPACT_ORDER, type Impact } from '../calendar.types';

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === '') return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((entry) => String(entry).trim().toUpperCase()).filter(Boolean);
};

const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export class CalendarHistoryDto {
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

  @ApiPropertyOptional({ description: 'Comma-separated currency codes, e.g. USD,EUR.' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  currencies?: string[];

  @ApiPropertyOptional({ enum: IMPACT_ORDER, description: 'Drop anything below this impact.' })
  @IsOptional()
  @IsIn(IMPACT_ORDER)
  minImpact?: Impact;

  @ApiPropertyOptional({ description: 'Only events that have already printed.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  releasedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Maximum rows to return.', default: 500, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  limit?: number;
}
