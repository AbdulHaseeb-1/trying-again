import type { AgentInputItem, Session } from '@openai/agents';

import type { ConversationRepository } from './conversation.repository';

/**
 * The Agents SDK session protocol, backed by the application's own store.
 *
 * The SDK ships `MemorySession`, which is exactly right for a script and wrong
 * for a product: a restart, a deploy or a second server instance loses every
 * conversation. This implements the same interface over the conversation
 * repository, so history survives all three.
 *
 * `limit` is honoured rather than ignored: a long conversation must not send
 * its entire history on every turn, and the runner asks for a window precisely
 * so it does not have to.
 */
export class StoredAgentSession implements Session {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly conversationId: string,
  ) {}

  async getSessionId(): Promise<string> {
    return this.conversationId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const payloads = await this.repository.listSessionItems(this.conversationId, limit);
    return payloads as AgentInputItem[];
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    await this.repository.appendSessionItems(this.conversationId, items);
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    return (await this.repository.popSessionItem(this.conversationId)) as
      | AgentInputItem
      | undefined;
  }

  async clearSession(): Promise<void> {
    await this.repository.clearSessionItems(this.conversationId);
  }
}
