import { Injectable, Logger } from '@nestjs/common';
import { Agent, handoff, webSearchTool, type ModelSettings, type Tool } from '@openai/agents';

import { AgentError } from '../agent.errors';
import { describeContext, type AgentRunContext } from '../context/agent-run-context';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { ModelResolver, type ResolvedModel } from '../runtime/model-resolver.service';
import type { RunSink } from '../runtime/run-sink';
import { AiSettingsService } from '../settings/ai-settings.service';
import {
  CITATION_RULES,
  FORMAT_RULES,
  HONESTY_RULES,
  RESEARCH_ORDER,
  UNTRUSTED_RULES,
  composeInstructions,
} from '../specialists/prompt-parts';
import { AgentToolRegistry } from '../tools/tool-registry.service';
import { AgentRegistry } from './agent-registry.service';
import type { AgentDefinition } from './agent-definition';

export type BuiltAgent = {
  agent: Agent<unknown, 'text'>;
  model: ResolvedModel;
  fallback: ResolvedModel | null;
  definition: AgentDefinition;
};

/**
 * The only place an `Agent` is constructed.
 *
 * Everything a run needs to be safe and observable is assembled here: the
 * instructions (definition + shared rules + this run's context pointers), the
 * tools the grant allows, the specialists it may delegate to or hand off to,
 * and a model resolved through the provider layer rather than named inline.
 *
 * Building per run rather than caching a singleton is deliberate. The tools
 * close over this run's permissions, event sink and citation collector, so a
 * shared agent would either leak one run's state into another or need all of
 * that threaded through the context object instead — which is exactly the
 * indirection that makes permission bugs hard to see.
 */
@Injectable()
export class AgentFactory {
  private readonly logger = new Logger(AgentFactory.name);

  constructor(
    private readonly registry: AgentRegistry,
    private readonly tools: AgentToolRegistry,
    private readonly models: ModelResolver,
    private readonly providers: ProviderRegistry,
    private readonly settings: AiSettingsService,
  ) {}

  async build(
    agentId: string,
    context: AgentRunContext,
    sink: RunSink,
    modelOverride?: ResolvedModel,
  ): Promise<BuiltAgent> {
    const definition = this.registry.require(agentId);
    if (!(await this.registry.isEnabled(agentId))) {
      throw new AgentError('bad_request', `${definition.name} is turned off in Settings.`);
    }

    const plan = await this.models.plan(definition);
    const model = modelOverride ?? plan.primary;

    const agent = await this.construct(definition, context, sink, model, new Set([definition.id]));
    return { agent, model, fallback: plan.fallback, definition };
  }

  /**
   * `seen` breaks delegation cycles. Two agents that name each other as tools
   * would otherwise recurse until the stack gives out, and the failure would
   * surface as a stack overflow rather than as a configuration mistake.
   */
  private async construct(
    definition: AgentDefinition,
    context: AgentRunContext,
    sink: RunSink,
    model: ResolvedModel,
    seen: Set<string>,
  ): Promise<Agent<unknown, 'text'>> {
    const capabilities = await this.registry.capabilitiesFor(definition.id);
    const settings = await this.settings.all();

    const tools: Tool<unknown>[] = this.tools.buildSdkTools(
      context,
      capabilities,
      sink,
      definition.tools,
    );

    // The provider's own hosted search, when the provider has one and the agent
    // is allowed the capability. Our `web_search` stays alongside it, so an
    // agent on a provider without a hosted tool loses nothing.
    const provider = this.providers.get(model.ref.providerId);
    if (
      definition.allowHostedWebSearch &&
      capabilities.includes('web.search') &&
      provider?.capabilities.webSearch &&
      settings.privacy.allowWebAccess
    ) {
      tools.push(
        webSearchTool({
          searchContextSize: settings.search.depth === 'advanced' ? 'high' : 'medium',
          ...(settings.search.allowedDomains.length > 0
            ? { filters: { allowedDomains: settings.search.allowedDomains } }
            : {}),
        }) as unknown as Tool<unknown>,
      );
    }

    for (const binding of definition.agentTools ?? []) {
      if (seen.has(binding.agentId)) {
        this.logger.warn(`skipping delegation cycle ${definition.id} → ${binding.agentId}`);
        continue;
      }
      const specialist = this.registry.get(binding.agentId);
      if (!specialist || !(await this.registry.isEnabled(binding.agentId))) continue;
      const specialistModel = (await this.models.plan(specialist)).primary;
      const built = await this.construct(
        specialist,
        context,
        sink,
        specialistModel,
        new Set([...seen, binding.agentId]),
      );
      tools.push(
        built.asTool({
          toolName: binding.toolName,
          toolDescription: binding.description,
        }) as unknown as Tool<unknown>,
      );
    }

    const handoffs = [];
    for (const targetId of definition.handoffs ?? []) {
      if (seen.has(targetId)) continue;
      const target = this.registry.get(targetId);
      if (!target || !(await this.registry.isEnabled(targetId))) continue;
      const targetModel = (await this.models.plan(target)).primary;
      const built = await this.construct(
        target,
        context,
        sink,
        targetModel,
        new Set([...seen, targetId]),
      );
      handoffs.push(handoff(built));
    }

    const override = settings.agents[definition.id];
    const instructions = composeInstructions([
      definition.instructions,
      override?.extraInstructions,
      settings.privacy.shareAppContext ? describeContext(context) : null,
      RESEARCH_ORDER,
      CITATION_RULES,
      UNTRUSTED_RULES,
      HONESTY_RULES,
      FORMAT_RULES,
    ]);

    return new Agent<unknown, 'text'>({
      name: definition.name,
      instructions,
      model: await this.providers.createModel(model.ref.providerId, model.ref.modelId),
      modelSettings: toModelSettings(model),
      tools,
      handoffs,
    });
  }
}

/** Our typed parameters, mapped onto the SDK's settings shape. */
export function toModelSettings(model: ResolvedModel): ModelSettings {
  const settings: ModelSettings = {};
  if (model.parameters.temperature !== undefined) {
    settings.temperature = model.parameters.temperature;
  }
  if (model.parameters.topP !== undefined) settings.topP = model.parameters.topP;
  if (model.parameters.maxOutputTokens !== undefined) {
    settings.maxTokens = model.parameters.maxOutputTokens;
  }
  if (model.parameters.reasoningEffort !== undefined) {
    settings.reasoning = { effort: model.parameters.reasoningEffort };
  }
  return settings;
}
