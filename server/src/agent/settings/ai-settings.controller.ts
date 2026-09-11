import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SearchProviderRegistry } from '../../search/search-provider.registry';
import { SearchService } from '../../search/search.service';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import {
  AddCustomProviderDto,
  AddCustomSearchProviderDto,
  SetModelRoleDto,
  TestConnectionDto,
  TestSearchDto,
  UpdateAgentDto,
  UpdatePrivacyDto,
  UpdateProviderDto,
  UpdateSearchDto,
  UpdateSearchProviderDto,
} from '../dto/agent.dto';
import { CAPABILITIES, CAPABILITY_LABELS, isCapability } from '../permissions/permission';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { AgentRegistry } from '../registry/agent-registry.service';
import { AgentToolRegistry } from '../tools/tool-registry.service';
import { AiSettingsService } from './ai-settings.service';
import type { ModelRole } from './ai-settings.types';

const MODEL_ROLES: ModelRole[] = ['primary', 'research', 'fast', 'fallback'];

/**
 * Settings → AI & Agents, server side.
 *
 * The invariant every route here preserves: **a secret goes in and never comes
 * out.** `apiKey` is accepted on writes and is absent from every response; the
 * only thing a client can read back is a four-character preview produced by the
 * secret store. That is why the settings document and the secret store are
 * separate stores rather than one object with a redaction pass — redaction you
 * have to remember is redaction you eventually forget.
 */
@ApiTags('ai-settings')
@UseGuards(AgentAuthGuard)
@Controller('api/settings/ai')
export class AiSettingsController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly providers: ProviderRegistry,
    private readonly agents: AgentRegistry,
    private readonly tools: AgentToolRegistry,
    private readonly searchProviders: SearchProviderRegistry,
    private readonly search: SearchService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The whole AI configuration, without secrets.' })
  @ApiOkResponse({ description: 'Providers, models, agents, search, tools and privacy.' })
  async all() {
    const settings = await this.settings.all();
    return {
      providers: await this.providers.summaries(),
      customProviders: settings.customProviders,
      models: settings.models,
      agents: await this.agents.summaries(),
      agentOverrides: settings.agents,
      tools: this.tools.summaries(),
      capabilities: CAPABILITIES.map((capability) => ({
        id: capability,
        label: CAPABILITY_LABELS[capability],
      })),
      search: {
        ...settings.search,
        providers: await this.searchProviders.summaries(),
      },
      privacy: settings.privacy,
    };
  }

  // ------------------------------------------------------------- providers

  @Get('providers')
  @ApiOperation({ summary: 'Configured and available LLM providers.' })
  async providerList() {
    return { providers: await this.providers.summaries() };
  }

  @Patch('providers/:id')
  @ApiOperation({ summary: 'Update one provider. `apiKey` is write-only.' })
  async updateProvider(@Param('id') id: string, @Body() body: UpdateProviderDto) {
    const provider = this.providers.get(id);
    if (!provider) throw new NotFoundException(`No provider "${id}".`);
    await this.settings.updateProvider(id, body);
    const summaries = await this.providers.summaries();
    return summaries.find((entry) => entry.id === id);
  }

  @Post('providers/:id/test')
  @ApiOperation({ summary: 'Test a provider, optionally with credentials not yet saved.' })
  async testProvider(@Param('id') id: string, @Body() body: TestConnectionDto) {
    const provider = this.providers.get(id);
    if (!provider) throw new NotFoundException(`No provider "${id}".`);
    const stored = await this.providers.configFor(id);
    // Testing before saving is the whole point of a test button: a key that
    // fails should never have to be stored to find that out.
    const config = {
      ...stored,
      apiKey: body.apiKey ?? stored.apiKey,
      baseUrl: body.baseUrl ?? stored.baseUrl,
      defaultModel: body.model ?? stored.defaultModel,
    };
    return provider.testConnection(config);
  }

  @Get('providers/:id/models')
  @ApiOperation({ summary: 'Models this provider offers, with its suggestions as a fallback.' })
  async providerModels(@Param('id') id: string) {
    const provider = this.providers.get(id);
    if (!provider) throw new NotFoundException(`No provider "${id}".`);
    const config = await this.providers.configFor(id);
    try {
      const models = await provider.listModels(config);
      return { source: 'provider', models };
    } catch {
      // A provider that cannot list models is not necessarily unusable: several
      // work fine with a model id typed in by hand.
      return { source: 'suggested', models: provider.suggestedModels };
    }
  }

  @Post('providers')
  @ApiOperation({ summary: 'Add a custom OpenAI-compatible provider.' })
  async addProvider(@Body() body: AddCustomProviderDto) {
    if (!/^[a-z0-9][a-z0-9-]{1,46}$/.test(body.id)) {
      throw new BadRequestException('Provider id must be lower-case letters, digits and dashes.');
    }
    if (this.providers.get(body.id)) {
      throw new BadRequestException(`A provider named "${body.id}" already exists.`);
    }
    await this.settings.addCustomProvider({ ...body, kind: 'openai-compatible' });
    await this.providers.syncCustomProviders();
    const summaries = await this.providers.summaries();
    return summaries.find((entry) => entry.id === body.id);
  }

  @Delete('providers/:id')
  @ApiOperation({ summary: 'Remove a custom provider and its stored key.' })
  async removeProvider(@Param('id') id: string) {
    const settings = await this.settings.all();
    if (!settings.customProviders.some((entry) => entry.id === id)) {
      throw new BadRequestException('Only custom providers can be removed.');
    }
    await this.settings.removeCustomProvider(id);
    await this.providers.syncCustomProviders();
    return { removed: true };
  }

  // ---------------------------------------------------------------- models

  @Get('models')
  @ApiOperation({ summary: 'Which model fills each role.' })
  async models() {
    return { models: (await this.settings.all()).models, roles: MODEL_ROLES };
  }

  @Patch('models/:role')
  @ApiOperation({ summary: 'Assign or clear a model role.' })
  async setModel(@Param('role') role: string, @Body() body: SetModelRoleDto) {
    if (!MODEL_ROLES.includes(role as ModelRole)) {
      throw new BadRequestException(`Unknown model role "${role}".`);
    }
    if (!body.providerId || !body.modelId) {
      const cleared = await this.settings.setModelRole(role as ModelRole, null);
      return { models: cleared.models };
    }
    if (!this.providers.get(body.providerId)) {
      throw new BadRequestException(`No provider "${body.providerId}".`);
    }
    const updated = await this.settings.setModelRole(role as ModelRole, {
      providerId: body.providerId,
      modelId: body.modelId,
      parameters: body.parameters as never,
    });
    return { models: updated.models };
  }

  // ---------------------------------------------------------------- agents

  @Get('agents')
  @ApiOperation({ summary: 'Agents with their resolved models and capabilities.' })
  async agentList() {
    const settings = await this.settings.all();
    return { agents: await this.agents.summaries(), overrides: settings.agents };
  }

  @Patch('agents/:id')
  @ApiOperation({ summary: 'Configure one agent. Capabilities can only be narrowed.' })
  async updateAgent(@Param('id') id: string, @Body() body: UpdateAgentDto) {
    const definition = this.agents.get(id);
    if (!definition) throw new NotFoundException(`No agent "${id}".`);

    if (body.capabilities) {
      const unknown = body.capabilities.filter((entry) => !isCapability(entry));
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown capabilities: ${unknown.join(', ')}.`);
      }
      const beyond = body.capabilities.filter(
        (entry) => !definition.capabilities.includes(entry as never),
      );
      if (beyond.length > 0) {
        // Settings narrow a definition; they never widen it. Saying so is
        // better than silently dropping what an operator asked for.
        throw new BadRequestException(
          `${definition.name} cannot be granted: ${beyond.join(', ')}.`,
        );
      }
    }

    await this.settings.updateAgent(id, body as never);
    const summaries = await this.agents.summaries();
    return summaries.find((entry) => entry.id === id);
  }

  // ---------------------------------------------------------------- search

  @Get('search')
  @ApiOperation({ summary: 'Search configuration and the available engines.' })
  async searchSettings() {
    const settings = await this.settings.search();
    return { ...settings, providers: await this.searchProviders.summaries() };
  }

  @Patch('search')
  @ApiOperation({ summary: 'Update the search policy.' })
  async updateSearch(@Body() body: UpdateSearchDto) {
    const updated = await this.settings.updateSearch(body as never);
    return { ...updated, providers: await this.searchProviders.summaries() };
  }

  @Patch('search/providers/:id')
  @ApiOperation({ summary: 'Update one search engine. `apiKey` is write-only.' })
  async updateSearchProvider(@Param('id') id: string, @Body() body: UpdateSearchProviderDto) {
    if (!this.searchProviders.get(id)) throw new NotFoundException(`No search provider "${id}".`);
    await this.settings.updateSearchProvider(id, body);
    const summaries = await this.searchProviders.summaries();
    return summaries.find((entry) => entry.id === id);
  }

  @Post('search/providers')
  @ApiOperation({ summary: 'Add a SearXNG instance or a generic JSON search endpoint.' })
  async addSearchProvider(@Body() body: AddCustomSearchProviderDto) {
    if (!/^[a-z0-9][a-z0-9-]{1,46}$/.test(body.id)) {
      throw new BadRequestException('Provider id must be lower-case letters, digits and dashes.');
    }
    if (this.searchProviders.get(body.id)) {
      throw new BadRequestException(`A search provider named "${body.id}" already exists.`);
    }
    await this.settings.addCustomSearchProvider(body);
    await this.searchProviders.syncCustomProviders();
    const summaries = await this.searchProviders.summaries();
    return summaries.find((entry) => entry.id === body.id);
  }

  @Delete('search/providers/:id')
  @ApiOperation({ summary: 'Remove a custom search provider and its stored key.' })
  async removeSearchProvider(@Param('id') id: string) {
    const settings = await this.settings.search();
    if (!settings.customProviders.some((entry) => entry.id === id)) {
      throw new BadRequestException('Only custom search providers can be removed.');
    }
    await this.settings.removeCustomSearchProvider(id);
    await this.searchProviders.syncCustomProviders();
    return { removed: true };
  }

  @Post('search/providers/:id/test')
  @ApiOperation({ summary: 'Run a real query through one engine.' })
  async testSearchProvider(@Param('id') id: string) {
    if (!this.searchProviders.get(id)) throw new NotFoundException(`No search provider "${id}".`);
    return this.search.testProvider(id);
  }

  @Post('search/test')
  @ApiOperation({ summary: 'Search through the configured default, exactly as an agent would.' })
  async testSearch(@Body() body: TestSearchDto) {
    const outcome = await this.search.search(body.query ?? 'bitcoin market structure', {
      maxResults: 3,
    });
    return {
      provider: outcome.providerName,
      fellBackFrom: outcome.fellBackFrom,
      results: outcome.results.map((result) => ({
        title: result.title,
        url: result.url,
        domain: result.domain,
      })),
    };
  }

  // --------------------------------------------------------------- privacy

  @Get('privacy')
  @ApiOperation({ summary: 'Privacy and permission switches.' })
  async privacy() {
    return this.settings.privacy();
  }

  @Patch('privacy')
  @ApiOperation({ summary: 'Update the privacy switches.' })
  async updatePrivacy(@Body() body: UpdatePrivacyDto) {
    return this.settings.updatePrivacy(body);
  }

  // ----------------------------------------------------------------- tools

  @Get('tools')
  @ApiOperation({ summary: 'Every registered application tool and the capability it needs.' })
  toolList() {
    return {
      tools: this.tools.summaries(),
      capabilities: CAPABILITIES.map((capability) => ({
        id: capability,
        label: CAPABILITY_LABELS[capability],
      })),
    };
  }
}
