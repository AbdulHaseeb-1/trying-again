import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DerivativesConfigDto {
  @ApiPropertyOptional({ description: 'Base refresh cadence in milliseconds.', minimum: 15_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15_000)
  @Max(3_600_000)
  refreshIntervalMs?: number;
}
