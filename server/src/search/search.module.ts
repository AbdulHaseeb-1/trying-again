import { Module, forwardRef } from '@nestjs/common';

import { AgentSettingsModule } from '../agent/settings/agent-settings.module';
import { UrlFetcher } from './fetch/url-fetcher';
import { BraveSearchProvider } from './providers/brave.provider';
import { ExaSearchProvider } from './providers/exa.provider';
import { OpenAiHostedSearchProvider } from './providers/openai-hosted.provider';
import { TavilySearchProvider } from './providers/tavily.provider';
import { SEARCH_PROVIDERS } from './search-provider.registry';
import { SearchProviderRegistry } from './search-provider.registry';
import { SearchService } from './search.service';
import type { SearchProvider } from './search-provider';

/**
 * Web research.
 *
 * Built-in engines are listed once, here. A new adapter is a class plus a line
 * in the factory below — `SearchService` has no knowledge of which engines
 * exist, and operator-defined SearXNG or REST endpoints join the same registry
 * at runtime.
 */
@Module({
  imports: [forwardRef(() => AgentSettingsModule)],
  providers: [
    UrlFetcher,
    TavilySearchProvider,
    ExaSearchProvider,
    BraveSearchProvider,
    OpenAiHostedSearchProvider,
    {
      provide: SEARCH_PROVIDERS,
      inject: [
        TavilySearchProvider,
        ExaSearchProvider,
        BraveSearchProvider,
        OpenAiHostedSearchProvider,
      ],
      useFactory: (...providers: SearchProvider[]) => providers,
    },
    SearchProviderRegistry,
    SearchService,
  ],
  exports: [SearchService, SearchProviderRegistry, UrlFetcher],
})
export class SearchModule {}
