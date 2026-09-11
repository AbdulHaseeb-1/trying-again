import { Module } from '@nestjs/common';

import { CalendarModule } from '../calendar/calendar.module';
import { DerivativesModule } from '../derivatives/derivatives.module';
import { NewsModule } from '../news/news.module';
import { SearchModule } from '../search/search.module';
import { AgentController } from './agent.controller';
import { AgentAuthGuard } from './auth/agent-auth.guard';
import { DeviceAuthService } from './auth/device-auth.service';
import { RunTelemetry } from './observability/run-telemetry.service';
import { AnthropicLLMProvider } from './providers/anthropic.provider';
import { GoogleLLMProvider } from './providers/google.provider';
import type { LLMProvider } from './providers/llm-provider';
import { OpenAiLLMProvider } from './providers/openai.provider';
import { OpenRouterLLMProvider } from './providers/openrouter.provider';
import { LLM_PROVIDERS, ProviderRegistry } from './providers/provider-registry.service';
import { AGENT_DEFINITIONS } from './registry/agent-definition';
import { AgentFactory } from './registry/agent-factory.service';
import { AgentRegistry } from './registry/agent-registry.service';
import { AgentRuntime } from './runtime/agent-runtime.service';
import { ModelResolver } from './runtime/model-resolver.service';
import { RunRegistry } from './runtime/run-registry.service';
import { ConversationRepository } from './sessions/conversation.repository';
import { AiSettingsController } from './settings/ai-settings.controller';
import { AgentTracing } from './observability/tracing.service';
import { BUILT_IN_AGENTS } from './specialists/definitions';
import { AppTools } from './tools/app.tools';
import { ChartTools } from './tools/chart.tools';
import { MarketTools } from './tools/market.tools';
import { NewsTools } from './tools/news.tools';
import { APP_TOOL_PROVIDERS, type AppToolProvider } from './tools/tool-definition';
import { AgentToolRegistry } from './tools/tool-registry.service';
import { WebTools } from './tools/web.tools';

/**
 * The agent subsystem.
 *
 * Three extension points, and all three are lists in this file rather than
 * branches somewhere else:
 *
 *  - `LLM_PROVIDERS` — add a vendor by writing an `LLMProvider` and listing it.
 *  - `APP_TOOL_PROVIDERS` — add a capability by writing an `AppTool` provider
 *    and listing it.
 *  - `AGENT_DEFINITIONS` — add a specialist by writing a definition and listing
 *    it.
 *
 * Search engines extend the same way, one module over. Nothing downstream —
 * runtime, factory, controller, UI — needs to change for any of the four.
 */
@Module({
  imports: [CalendarModule, DerivativesModule, NewsModule, SearchModule],
  controllers: [AgentController, AiSettingsController],
  providers: [
    // Providers
    OpenAiLLMProvider,
    OpenRouterLLMProvider,
    AnthropicLLMProvider,
    GoogleLLMProvider,
    {
      provide: LLM_PROVIDERS,
      inject: [OpenAiLLMProvider, OpenRouterLLMProvider, AnthropicLLMProvider, GoogleLLMProvider],
      useFactory: (...providers: LLMProvider[]) => providers,
    },
    ProviderRegistry,

    // Tools
    MarketTools,
    ChartTools,
    NewsTools,
    AppTools,
    WebTools,
    {
      provide: APP_TOOL_PROVIDERS,
      inject: [MarketTools, ChartTools, NewsTools, AppTools, WebTools],
      useFactory: (...providers: AppToolProvider[]) => providers,
    },
    AgentToolRegistry,

    // Agents
    { provide: AGENT_DEFINITIONS, useValue: BUILT_IN_AGENTS },
    ModelResolver,
    AgentRegistry,
    AgentFactory,

    // Runtime
    ConversationRepository,
    RunRegistry,
    RunTelemetry,
    AgentTracing,
    AgentRuntime,

    // Auth
    DeviceAuthService,
    AgentAuthGuard,
  ],
  exports: [AgentRuntime, AgentRegistry, ProviderRegistry, AgentToolRegistry],
})
export class AgentModule {}
