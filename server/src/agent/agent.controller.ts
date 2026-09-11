import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { NewsService } from '../news/news.service';
import { encodeEvent } from './agent.events';
import { normalizeError } from './agent.errors';
import { AgentAuthGuard, Principal } from './auth/agent-auth.guard';
import { DeviceAuthService, type AgentPrincipal } from './auth/device-auth.service';
import {
  CreateConversationDto,
  ListConversationsDto,
  ListMessagesDto,
  RegisterDeviceDto,
  SendMessageDto,
  StopRunDto,
  UpdateConversationDto,
} from './dto/agent.dto';
import { AgentRegistry } from './registry/agent-registry.service';
import { AgentRuntime } from './runtime/agent-runtime.service';
import { RunRegistry } from './runtime/run-registry.service';
import { ConversationRepository } from './sessions/conversation.repository';
import { AiSettingsService } from './settings/ai-settings.service';
import { DEFAULT_AGENT_ID } from './specialists/definitions';
import { AgentToolRegistry } from './tools/tool-registry.service';

/**
 * The agent subsystem over HTTP.
 *
 * Every route below the registration endpoint is behind the auth guard, and
 * every one of them scopes its reads and writes to the token's principal —
 * never to an id in the path or body.
 */
@ApiTags('agent')
@Controller('api/agent')
export class AgentController {
  constructor(
    private readonly auth: DeviceAuthService,
    private readonly runtime: AgentRuntime,
    private readonly runs: RunRegistry,
    private readonly conversations: ConversationRepository,
    private readonly agents: AgentRegistry,
    private readonly tools: AgentToolRegistry,
    private readonly settings: AiSettingsService,
    private readonly news: NewsService,
  ) {}

  @Post('auth/device')
  @ApiOperation({ summary: 'Register a client and receive its bearer token.' })
  async registerDevice(@Body() body: RegisterDeviceDto) {
    const { token, principal } = await this.auth.register(body);
    return { token, ...principal };
  }

  @UseGuards(AgentAuthGuard)
  @Get('bootstrap')
  @ApiOperation({
    summary: 'Everything the panel needs to open: agents, models, capabilities and readiness.',
  })
  @ApiOkResponse({ description: 'One round trip, so the panel opens without a waterfall.' })
  async bootstrap(@Principal() principal: AgentPrincipal) {
    const [agents, settings] = await Promise.all([this.agents.summaries(), this.settings.all()]);
    const ready = agents.some((agent) => agent.model !== null);
    return {
      principal,
      ready,
      defaultAgentId: DEFAULT_AGENT_ID,
      agents: agents.filter((agent) => agent.userFacing),
      tools: this.tools.summaries(),
      privacy: settings.privacy,
      search: {
        defaultProviderId: settings.search.defaultProviderId,
        enabled: Object.values(settings.search.providers).some((entry) => entry.enabled),
      },
      storage: this.conversations.backend,
      newsStorage: this.news.backend,
    };
  }

  // -------------------------------------------------------- conversations

  @UseGuards(AgentAuthGuard)
  @Get('conversations')
  @ApiOperation({ summary: 'Recent conversations, pinned first.' })
  list(@Principal() principal: AgentPrincipal, @Query() query: ListConversationsDto) {
    return this.conversations.list(principal.userId, query);
  }

  @UseGuards(AgentAuthGuard)
  @Post('conversations')
  @ApiOperation({ summary: 'Start a conversation.' })
  create(@Principal() principal: AgentPrincipal, @Body() body: CreateConversationDto) {
    return this.conversations.create(principal.userId, {
      agentId: body.agentId ?? DEFAULT_AGENT_ID,
      title: body.title,
      symbol: body.context?.selectedSymbol ?? null,
      timeframe: body.context?.selectedTimeframe ?? null,
      workspace: body.context?.activeWorkspace ?? null,
    });
  }

  @UseGuards(AgentAuthGuard)
  @Get('conversations/:id')
  @ApiOperation({ summary: 'One conversation.' })
  async getOne(@Principal() principal: AgentPrincipal, @Param('id') id: string) {
    const conversation = await this.conversations.get(principal.userId, id);
    if (!conversation) throw new NotFoundException('No such conversation.');
    return conversation;
  }

  @UseGuards(AgentAuthGuard)
  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Rename, pin or reassign a conversation.' })
  async patch(
    @Principal() principal: AgentPrincipal,
    @Param('id') id: string,
    @Body() body: UpdateConversationDto,
  ) {
    const updated = await this.conversations.update(principal.userId, id, body);
    if (!updated) throw new NotFoundException('No such conversation.');
    return updated;
  }

  @UseGuards(AgentAuthGuard)
  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete a conversation and everything in it.' })
  async remove(@Principal() principal: AgentPrincipal, @Param('id') id: string) {
    // Stop anything still running in it first; a run writing into a deleted
    // conversation is the kind of orphan that is hard to explain later.
    this.runs.stopConversation(id, principal.userId);
    const removed = await this.conversations.remove(principal.userId, id);
    if (!removed) throw new NotFoundException('No such conversation.');
    return { deleted: true };
  }

  @UseGuards(AgentAuthGuard)
  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'A page of messages, oldest first.' })
  async messages(
    @Principal() principal: AgentPrincipal,
    @Param('id') id: string,
    @Query() query: ListMessagesDto,
  ) {
    const conversation = await this.conversations.get(principal.userId, id);
    if (!conversation) throw new NotFoundException('No such conversation.');
    return { messages: await this.conversations.listMessages(id, query) };
  }

  // ------------------------------------------------------------------ runs

  /**
   * Send a message and stream the answer.
   *
   * Newline-delimited JSON rather than SSE: the client is a React Native app as
   * well as a browser, and NDJSON over a plain POST works identically on both,
   * while `EventSource` exists only on the web and cannot carry a request body.
   */
  @UseGuards(AgentAuthGuard)
  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message; streams normalized agent events as NDJSON.' })
  async send(
    @Principal() principal: AgentPrincipal,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const conversation = await this.conversations.get(principal.userId, id);
    if (!conversation) throw new NotFoundException('No such conversation.');

    response.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('cache-control', 'no-cache, no-transform');
    response.setHeader('x-accel-buffering', 'no');
    response.flushHeaders?.();

    let runId: string | null = null;
    const onClose = () => {
      // The reader went away. Stop the work rather than finishing an answer
      // nobody will see — and, with it, any search or fetch underneath.
      if (runId) this.runs.stop(runId, principal.userId);
    };
    request.on('close', onClose);

    const agentId = body.agentId ?? conversation.agentId;

    try {
      for await (const event of this.runtime.stream({
        userId: principal.userId,
        deviceId: principal.deviceId,
        sessionId: principal.deviceId,
        conversationId: id,
        agentId,
        message: body.message,
        attachments: body.attachments ?? [],
        debug: body.debug,
        context: {
          selectedSymbol: body.context?.selectedSymbol ?? conversation.context.symbol,
          selectedTimeframe: body.context?.selectedTimeframe ?? conversation.context.timeframe,
          activeChartId: body.context?.activeChartId ?? null,
          visibleTimeRange: body.context?.visibleTimeRange ?? null,
          activeWorkspace: body.context?.activeWorkspace ?? conversation.context.workspace,
          locale: body.context?.locale ?? 'en',
          timezone: body.context?.timezone ?? 'UTC',
        },
      })) {
        if (event.type === 'RUN_STARTED') runId = event.runId;
        if (response.writableEnded) break;
        response.write(encodeEvent(event));
      }

      // Name the conversation from its first exchange, so the history list is
      // readable without anyone having to rename anything.
      if (conversation.messageCount === 0) {
        await this.conversations.update(principal.userId, id, {
          title: titleFrom(body.message),
          agentId,
        });
      }
    } catch (error) {
      if (!response.writableEnded) {
        response.write(
          encodeEvent({
            type: 'RUN_FAILED',
            runId: runId ?? 'run_unknown',
            error: normalizeError(error, false),
            durationMs: 0,
          }),
        );
      }
    } finally {
      request.off('close', onClose);
      if (!response.writableEnded) response.end();
    }
  }

  @UseGuards(AgentAuthGuard)
  @Post('runs/stop')
  @ApiOperation({ summary: 'Stop a run immediately.' })
  stop(@Principal() principal: AgentPrincipal, @Body() body: StopRunDto) {
    return { stopped: this.runs.stop(body.runId, principal.userId) };
  }

  @UseGuards(AgentAuthGuard)
  @Get('runs')
  @ApiOperation({ summary: 'Recent runs, for the developer run inspector.' })
  async runHistory(
    @Principal() principal: AgentPrincipal,
    @Query('conversationId') conversationId?: string,
  ) {
    const settings = await this.settings.all();
    if (!settings.privacy.debugMode) {
      return { debugMode: false, active: this.runs.active(principal.userId), runs: [] };
    }
    return {
      debugMode: true,
      active: this.runs.active(principal.userId),
      runs: await this.conversations.listRuns(principal.userId, conversationId),
    };
  }

  @UseGuards(AgentAuthGuard)
  @Get('agents')
  @ApiOperation({ summary: 'Every registered agent, with its resolved model and capabilities.' })
  agentList() {
    return { agents: this.agents.summaries() };
  }
}

/** A first line, trimmed to something that fits a history row. */
export function titleFrom(message: string): string {
  const firstLine = message.replace(/\s+/g, ' ').trim();
  if (firstLine.length <= 48) return firstLine || 'New conversation';
  return `${firstLine.slice(0, 47)}…`;
}
