import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { ATTACHMENT_KINDS, type AgentContextAttachmentKind } from '../context/agent-run-context';

/**
 * Every agent endpoint's input, validated at the edge.
 *
 * Tool arguments are validated again inside the tool layer, and permissions
 * again inside the registry: the model is never the thing that decides whether
 * a request is well-formed or allowed.
 */

export class RegisterDeviceDto {
  @ApiPropertyOptional({ description: 'A stable client-generated id. One is issued if omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string;

  @ApiPropertyOptional({ description: 'Required only when AGENT_REGISTRATION_SECRET is set.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secret?: string;
}

export class ContextAttachmentDto {
  @ApiProperty({ enum: ATTACHMENT_KINDS })
  @IsIn(ATTACHMENT_KINDS)
  kind!: AgentContextAttachmentKind;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  label!: string;
}

export class VisibleRangeDto {
  @ApiProperty()
  @IsISO8601()
  from!: string;

  @ApiProperty()
  @IsISO8601()
  to!: string;
}

export class AppContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  selectedSymbol?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  selectedTimeframe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  activeChartId?: string;

  @ApiPropertyOptional({ type: VisibleRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisibleRangeDto)
  visibleTimeRange?: VisibleRangeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  activeWorkspace?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class CreateConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ type: AppContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppContextDto)
  context?: AppContextDto;
}

export class UpdateConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;
}

export class ListConversationsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Search titles and message text.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class ListMessagesDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Return messages older than this ISO timestamp.' })
  @IsOptional()
  @IsISO8601()
  before?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'What the user typed.' })
  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  message!: string;

  @ApiPropertyOptional({ description: 'Which agent answers. Defaults to the conversation’s.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  @ApiPropertyOptional({ type: [ContextAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContextAttachmentDto)
  attachments?: ContextAttachmentDto[];

  @ApiPropertyOptional({ type: AppContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppContextDto)
  context?: AppContextDto;

  @ApiPropertyOptional({ description: 'Ask for tool inputs and outputs. Honoured only when debug mode is on.' })
  @IsOptional()
  @IsBoolean()
  debug?: boolean;
}

export class StopRunDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  runId!: string;
}

export class TestConnectionDto {
  @ApiPropertyOptional({ description: 'Test this key without storing it first.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;
}

export class UpdateProviderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Write-only. Send an empty string to remove the stored key.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  project?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultModel?: string;

  @ApiPropertyOptional({ minimum: 1_000, maximum: 300_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  timeoutMs?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries?: number;
}

export class AddCustomProviderDto {
  @ApiProperty({ description: 'Lower-case id, unique across providers.' })
  @IsString()
  @MaxLength(48)
  id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  name!: string;
}

export class SetModelRoleDto {
  @ApiPropertyOptional({ description: 'Omit both fields to clear the role.' })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  modelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class UpdateAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  model?: { providerId: string; modelId: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fallbackModel?: { providerId: string; modelId: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  extraInstructions?: string;

  @ApiPropertyOptional({ description: 'Narrow the agent’s capabilities. Cannot widen them.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class UpdateSearchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(48)
  defaultProviderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(48)
  fallbackProviderId?: string;

  @ApiPropertyOptional({ enum: ['basic', 'advanced'] })
  @IsOptional()
  @IsIn(['basic', 'advanced'])
  depth?: 'basic' | 'advanced';

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxResults?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedDomains?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  recencyDays?: number;

  @ApiPropertyOptional({ minimum: 1_000, maximum: 120_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(120_000)
  timeoutMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  safeSearch?: boolean;
}

export class UpdateSearchProviderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Write-only.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @ApiPropertyOptional({ minimum: 1_000, maximum: 120_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(120_000)
  timeoutMs?: number;
}

export class AddCustomSearchProviderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(48)
  id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ enum: ['searxng', 'rest'] })
  @IsIn(['searxng', 'rest'])
  kind!: 'searxng' | 'rest';

  @ApiProperty()
  @IsString()
  @MaxLength(512)
  baseUrl!: string;
}

export class TestSearchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;
}

export class UpdatePrivacyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  debugMode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shareAppContext?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  storeConversations?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowWebAccess?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowNewsAccess?: boolean;
}
