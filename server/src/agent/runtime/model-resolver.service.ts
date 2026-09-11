import { Injectable } from '@nestjs/common';

import { AgentError } from '../agent.errors';
import type { ModelRef } from '../agent.events';
import { ProviderRegistry } from '../providers/provider-registry.service';
import type { AgentDefinition } from '../registry/agent-definition';
import { AiSettingsService } from '../settings/ai-settings.service';
import type { ModelParameters, ModelSelection } from '../settings/ai-settings.types';

export type ResolvedModel = {
  ref: ModelRef;
  parameters: ModelParameters;
};

export type ResolvedModelPlan = {
  primary: ResolvedModel;
  /** Null when nothing sensible to fall back to — never a silent duplicate. */
  fallback: ResolvedModel | null;
};

/**
 * Which model an agent runs on, and what it falls back to.
 *
 * Four places can decide, and the order matters:
 *
 *   agent override → the agent's role slot → the primary slot → the one
 *   configured provider's default model
 *
 * The last step is what makes a first run work: configure one provider and
 * everything runs, without visiting four more screens to assign roles.
 */
@Injectable()
export class ModelResolver {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly providers: ProviderRegistry,
  ) {}

  async plan(definition: AgentDefinition): Promise<ResolvedModelPlan> {
    const settingsDocument = await this.settings.all();
    const override = settingsDocument.agents[definition.id] ?? null;

    const selection =
      override?.model ??
      settingsDocument.models[definition.modelRole] ??
      settingsDocument.models.primary ??
      (await this.firstConfigured());

    if (!selection) {
      throw new AgentError(
        'provider_not_configured',
        'No AI provider is configured. Add one in Settings → AI & Agents.',
      );
    }

    const fallbackSelection = override?.fallbackModel ?? settingsDocument.models.fallback ?? null;

    const primary = this.describe(selection, override?.parameters);
    const fallback =
      fallbackSelection &&
      !(
        fallbackSelection.providerId === selection.providerId &&
        fallbackSelection.modelId === selection.modelId
      )
        ? this.describe(fallbackSelection, override?.parameters)
        : null;

    return { primary, fallback };
  }

  /** Resolve one explicit selection — used by "run this conversation on X". */
  describe(selection: ModelSelection, agentParameters?: ModelParameters): ResolvedModel {
    const provider = this.providers.get(selection.providerId);
    return {
      ref: {
        providerId: selection.providerId,
        providerName: provider?.name ?? selection.providerId,
        modelId: selection.modelId,
      },
      parameters: this.supportedOnly(selection.providerId, {
        ...agentParameters,
        ...selection.parameters,
      }),
    };
  }

  /**
   * Drop parameters the provider does not support.
   *
   * Sending `reasoningEffort` to a Chat Completions endpoint is at best ignored
   * and at worst a 400, and the settings UI already hides what a provider does
   * not declare — this is the same rule applied at the point of use, so a
   * configuration written before a provider changed cannot break a run.
   */
  private supportedOnly(providerId: string, parameters: ModelParameters): ModelParameters {
    const provider = this.providers.get(providerId);
    if (!provider) return {};
    const allowed = new Set<string>(provider.supportedParameters);
    const output: ModelParameters = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (value === undefined || value === null) continue;
      if (!allowed.has(key)) continue;
      (output as Record<string, unknown>)[key] = value;
    }
    return output;
  }

  private async firstConfigured(): Promise<ModelSelection | null> {
    const settings = await this.settings.all();
    for (const [providerId, config] of Object.entries(settings.providers)) {
      if (!config.enabled) continue;
      const modelId = config.defaultModel ?? this.providers.get(providerId)?.suggestedModels[0]?.id;
      if (modelId) return { providerId, modelId };
    }
    return null;
  }
}
