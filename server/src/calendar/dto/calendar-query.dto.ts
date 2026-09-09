import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsDate, IsIn, IsOptional } from 'class-validator';

import { IMPACT_ORDER, type Impact } from '../calendar.types';

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null || value === '') return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((entry) => String(entry).trim().toUpperCase()).filter(Boolean);
};

export class CalendarQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive ISO start of the window.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Inclusive ISO end of the window.' })
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
}
