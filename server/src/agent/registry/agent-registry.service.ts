import { Inject, Injectable, Logger } from '@nestjs/common';

import { AgentError } from '../agent.errors';
import { AgentToolRegistry } from '../tools/tool-registry.service';
import { ModelResolver } from '../runtime/model-resolver.service';
import { AiSettingsService } from '../settings/ai-settings.service';
import type { Capability } from '../permissions/permission';
import { AGENT_DEFINITIONS, type AgentDefinition, type AgentSummary } from './agent-definition';

/**
 * Which agents exist, and what each one is allowed to do *after* settings have
 * had their say.
 *
 * The capability rule is one-directional: an override can narrow a definition's
 * capabilities, never widen them. A definition is the ceiling, reviewed in code;
 * settings are the floor, chosen by an operator. That way turning something on
 * in the UI can never grant an agent a capability its author did not intend.
 */
@Injectable()
export class AgentRegistry {
  private readonly logger = new Logger(AgentRegistry.name);
  private readonly definitions = new Map<string, AgentDefinition>();

  constructor(
    @Inject(AGENT_DEFINITIONS) definitions: AgentDefinition[],
    private readonly settings: AiSettingsService,
    private readonly tools: AgentToolRegistry,
    private readonly models: ModelResolver,
  ) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: AgentDefinition): void {
    if (this.definitions.has(definition.id)) {
      this.logger.warn(`agent "${definition.id}" registered twice; keeping the first`);
      return;
    }
    this.definitions.set(definition.id, definition);
  }

  get(id: string): AgentDefinition | null {
    return this.definitions.get(id) ?? null;
  }

  require(id: string): AgentDefinition {
    const definition = this.get(id);
    if (!definition) throw new AgentError('bad_request', `No agent named "${id}".`);
    return definition;
  }

  all(): AgentDefinition[] {
    return [...this.definitions.values()];
  }

  /** Capabilities as granted: the definition, narrowed by settings and privacy. */
  async capabilitiesFor(id: string): Promise<Capability[]> {
    const definition = this.require(id);
    const settings = await this.settings.all();
    const override = settings.agents[id];

    let granted = definition.capabilities;
    if (override?.capabilities) {
      const wanted = new Set(override.capabilities);
      granted = granted.filter((capability) => wanted.has(capability));
    }
    // The privacy switches sit above every per-agent grant.
    if (!settings.privacy.allowWebAccess) {
      granted = granted.filter((capability) => !capability.startsWith('web.'));
    }
    if (!settings.privacy.allowNewsAccess) {
      granted = granted.filter((capability) => capability !== 'news.read');
    }
    return granted;
  }

  async isEnabled(id: string): Promise<boolean> {
    const override = await this.settings.agentOverride(id);
    return override?.enabled ?? true;
  }

  async summaries(): Promise<AgentSummary[]> {
    const rows: AgentSummary[] = [];
    for (const definition of this.all()) {
      const capabilities = await this.capabilitiesFor(definition.id);
      let model: AgentSummary['model'] = null;
      let fallbackModel: AgentSummary['fallbackModel'] = null;
      try {
        const plan = await this.models.plan(definition);
        model = { providerId: plan.primary.ref.providerId, modelId: plan.primary.ref.modelId };
        fallbackModel = plan.fallback
          ? { providerId: plan.fallback.ref.providerId, modelId: plan.fallback.ref.modelId }
          : null;
      } catch {
        // An unconfigured application still lists its agents; the panel shows
        // them as needing setup rather than showing nothing at all.
      }
      rows.push({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        capabilities,
        modelRole: definition.modelRole,
        userFacing: definition.userFacing,
        starters: definition.starters ?? [],
        model,
        fallbackModel,
        enabled: await this.isEnabled(definition.id),
        toolNames: this.tools.allowedFor(capabilities, definition.tools).map((tool) => tool.name),
      });
    }
    return rows;
  }
}
