import type { Model } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions/ai-sdk';

/**
 * The only file in the application that knows the AI SDK adapter exists.
 *
 * The adapter is how non-OpenAI vendors reach the Agents SDK today. It is also
 * the piece most likely to be replaced — by first-party model providers, or by
 * a different bridge — so it is confined to one function with a narrow
 * signature. Providers depend on `bridgeAiSdkModel`, never on `aisdk`.
 */
export type AiSdkLanguageModel = Parameters<typeof aisdk>[0];

export function bridgeAiSdkModel(model: AiSdkLanguageModel): Model {
  return aisdk(model);
}
