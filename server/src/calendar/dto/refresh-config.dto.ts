import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RefreshConfigDto {
  @ApiPropertyOptional({
    minimum: 10_000,
    maximum: 3_600_000,
    description: 'Base refresh cadence in milliseconds.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10_000)
  @Max(3_600_000)
  refreshIntervalMs?: number;

  @ApiPropertyOptional({
    minimum: 1_000,
    maximum: 300_000,
    description: 'Gap between burst polls while waiting for a release.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  watchPollIntervalMs?: number;
}
