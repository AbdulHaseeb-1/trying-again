import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { AgentConversation, AgentMessage, AgentRunRecord } from '../agent.domain';
import type { AgentToolRun, ModelRef } from '../agent.events';
import type { AgentMessageReference } from '../citations/reference.types';
import { JsonFileStore } from '../settings/json-file-store';

const FILE_PATH = process.env.AGENT_STORE_PATH ?? 'data/agent-conversations.json';
/** The file backend keeps the recent past, not all of it. */
const FILE_CONVERSATION_CAP = 200;

/**
 * The file backing stores the owner alongside the conversation.
 *
 * Postgres scopes by a `userId` column; the file store has to carry the same
 * fact, or two devices sharing one server would see each other's history. It is
 * stripped on the way out so callers only ever handle the public shape.
 */
type StoredConversation = AgentConversation & { userId: string };

type FileShape = {
  conversations: StoredConversation[];
  messages: AgentMessage[];
  sessionItems: { id: number; conversationId: string; payload: unknown }[];
  runs: AgentRunRecord[];
  nextItemId: number;
};

const emptyFile = (): FileShape => ({
  conversations: [],
  messages: [],
  sessionItems: [],
  runs: [],
  nextItemId: 1,
});

export type ConversationPage = { items: AgentConversation[]; nextCursor: string | null };

/**
 * Durable agent conversations.
 *
 * Two backings, one contract, for the same reason the rest of the service has
 * two: Postgres is optional here, but *persistence is not*. A conversation the
 * user can reopen tomorrow is the feature; losing it because nobody set
 * `DATABASE_URL` would be a bug, not a degradation. The file backing is a real
 * durable store, bounded to the recent past.
 *
 * Note what this class stores and what it does not: it holds the rendered turns
 * and the citations, and separately the flat SDK session items the model
 * replays. Collapsing those two into one table is tempting and wrong — a
 * function call and its output are session history but are not a message.
 */
@Injectable()
export class ConversationRepository {
  private readonly logger = new Logger(ConversationRepository.name);
  private readonly file = new JsonFileStore<FileShape>(FILE_PATH, emptyFile);

  constructor(private readonly prisma: PrismaService) {}

  get backend(): 'postgres' | 'file' {
    return this.prisma.db ? 'postgres' : 'file';
  }

  // ----------------------------------------------------------- conversations

  async create(
    userId: string,
    input: {
      agentId: string;
      title?: string;
      symbol?: string | null;
      timeframe?: string | null;
      workspace?: string | null;
    },
  ): Promise<AgentConversation> {
    const now = new Date();
    const conversation: AgentConversation = {
      id: `conv_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      title: input.title?.trim() || 'New conversation',
      agentId: input.agentId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      pinned: false,
      messageCount: 0,
      context: {
        symbol: input.symbol ?? null,
        timeframe: input.timeframe ?? null,
        workspace: input.workspace ?? null,
      },
      lastModel: null,
    };

    const database = this.prisma.db;
    if (database) {
      await database.agentConversation.create({
        data: {
          id: conversation.id,
          userId,
          title: conversation.title,
          agentId: conversation.agentId,
          symbol: conversation.context.symbol,
          timeframe: conversation.context.timeframe,
          workspace: conversation.context.workspace,
        },
      });
      return conversation;
    }

    await this.file.update((current) => ({
      ...current,
      conversations: [{ ...conversation, userId }, ...current.conversations].slice(
        0,
        FILE_CONVERSATION_CAP,
      ),
    }));
    return conversation;
  }

  async list(
    userId: string,
    options: { limit?: number; cursor?: string; q?: string; pinnedFirst?: boolean } = {},
  ): Promise<ConversationPage> {
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const database = this.prisma.db;

    if (!database) {
      const { conversations, messages } = await this.file.read();
      const needle = options.q?.toLowerCase().trim();
      const filtered = conversations.filter((conversation) => {
        if (conversation.userId !== userId) return false;
        if (!needle) return true;
        if (conversation.title.toLowerCase().includes(needle)) return true;
        // Searching titles alone misses "the conversation where I asked about
        // funding", which is how people actually look for one.
        return messages.some(
          (message) =>
            message.conversationId === conversation.id &&
            message.text.toLowerCase().includes(needle),
        );
      });
      const sorted = sortConversations(filtered, options.pinnedFirst ?? true);
      const offset = options.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
      const page = sorted.slice(offset, offset + limit);
      return {
        items: page.map((conversation) =>
          publicShape(conversation, messages.filter((m) => m.conversationId === conversation.id).length),
        ),
        nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
      };
    }

    const where: Record<string, unknown> = { userId };
    if (options.q) {
      where.OR = [
        { title: { contains: options.q, mode: 'insensitive' } },
        { messages: { some: { text: { contains: options.q, mode: 'insensitive' } } } },
      ];
    }
    const offset = options.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
    const rows = await database.agentConversation.findMany({
      where: where as never,
      orderBy:
        options.pinnedFirst === false
          ? [{ updatedAt: 'desc' }]
          : [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      skip: offset,
      take: limit + 1,
      include: { _count: { select: { messages: true } } },
    });
    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map(conversationFromRow),
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }

  async get(userId: string, id: string): Promise<AgentConversation | null> {
    const database = this.prisma.db;
    if (!database) {
      const { conversations, messages } = await this.file.read();
      const found = conversations.find(
        (conversation) => conversation.id === id && conversation.userId === userId,
      );
      if (!found) return null;
      return publicShape(
        found,
        messages.filter((message) => message.conversationId === id).length,
      );
    }
    const row = await database.agentConversation.findFirst({
      where: { id, userId },
      include: { _count: { select: { messages: true } } },
    });
    return row ? conversationFromRow(row) : null;
  }

  async update(
    userId: string,
    id: string,
    patch: { title?: string; pinned?: boolean; agentId?: string; lastModel?: ModelRef | null },
  ): Promise<AgentConversation | null> {
    const database = this.prisma.db;
    if (!database) {
      let updated: StoredConversation | null = null;
      await this.file.update((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) => {
          if (conversation.id !== id || conversation.userId !== userId) return conversation;
          updated = {
            ...conversation,
            title: patch.title ?? conversation.title,
            pinned: patch.pinned ?? conversation.pinned,
            agentId: patch.agentId ?? conversation.agentId,
            lastModel: patch.lastModel === undefined ? conversation.lastModel : patch.lastModel,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }),
      }));
      return updated ? publicShape(updated, (updated as StoredConversation).messageCount) : null;
    }

    const existing = await database.agentConversation.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const row = await database.agentConversation.update({
      where: { id },
      data: {
        title: patch.title,
        pinned: patch.pinned,
        agentId: patch.agentId,
        providerId: patch.lastModel === undefined ? undefined : (patch.lastModel?.providerId ?? null),
        modelId: patch.lastModel === undefined ? undefined : (patch.lastModel?.modelId ?? null),
      },
      include: { _count: { select: { messages: true } } },
    });
    return conversationFromRow(row);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const database = this.prisma.db;
    if (!database) {
      let removed = false;
      await this.file.update((current) => {
        removed = current.conversations.some(
          (conversation) => conversation.id === id && conversation.userId === userId,
        );
        if (!removed) return current;
        return {
          ...current,
          conversations: current.conversations.filter((conversation) => conversation.id !== id),
          messages: current.messages.filter((message) => message.conversationId !== id),
          sessionItems: current.sessionItems.filter((item) => item.conversationId !== id),
          runs: current.runs.filter((run) => run.conversationId !== id),
        };
      });
      return removed;
    }
    const result = await database.agentConversation.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  // --------------------------------------------------------------- messages

  async appendMessage(message: AgentMessage): Promise<AgentMessage> {
    const database = this.prisma.db;
    if (!database) {
      await this.file.update((current) => ({
        ...current,
        messages: [...current.messages, message],
        conversations: current.conversations.map((conversation) =>
          conversation.id === message.conversationId
            ? { ...conversation, updatedAt: message.createdAt, lastModel: message.model ?? conversation.lastModel }
            : conversation,
        ),
      }));
      return message;
    }

    await database.agentMessage.create({
      data: {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        text: message.text,
        agentId: message.agentId,
        providerId: message.model?.providerId ?? null,
        modelId: message.model?.modelId ?? null,
        attachments: message.attachments as never,
        toolRuns: message.toolRuns as never,
        error: (message.error ?? undefined) as never,
        createdAt: new Date(message.createdAt),
      },
    });
    await this.saveReferences(message.id, message.references);
    await database.agentConversation.update({
      where: { id: message.conversationId },
      data: {
        updatedAt: new Date(message.createdAt),
        providerId: message.model?.providerId ?? undefined,
        modelId: message.model?.modelId ?? undefined,
      },
    });
    return message;
  }

  async listMessages(
    conversationId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<AgentMessage[]> {
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    const database = this.prisma.db;

    if (!database) {
      const { messages } = await this.file.read();
      const all = messages
        .filter((message) => message.conversationId === conversationId)
        .filter((message) => (options.before ? message.createdAt < options.before : true))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return all.slice(-limit);
    }

    const rows = await database.agentMessage.findMany({
      where: {
        conversationId,
        ...(options.before ? { createdAt: { lt: new Date(options.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { references: { include: { reference: true } } },
    });
    return rows.reverse().map(messageFromRow);
  }

  private async saveReferences(
    messageId: string,
    references: AgentMessageReference[],
  ): Promise<void> {
    const database = this.prisma.db;
    if (!database || references.length === 0) return;
    for (const reference of references) {
      await database.agentReference.upsert({
        where: { id: reference.id },
        create: {
          id: reference.id,
          type: reference.type,
          title: reference.title,
          url: reference.url ?? null,
          source: reference.source ?? null,
          publishedAt: reference.publishedAt ? new Date(reference.publishedAt) : null,
          entityId: reference.entityId ?? null,
          snippet: reference.snippet ?? null,
          metadata: (reference.metadata ?? {}) as never,
        },
        update: { title: reference.title, snippet: reference.snippet ?? null },
      });
      await database.agentMessageReference.upsert({
        where: { messageId_referenceId: { messageId, referenceId: reference.id } },
        create: { messageId, referenceId: reference.id, citationIndex: reference.citationIndex },
        update: { citationIndex: reference.citationIndex },
      });
    }
  }

  // ----------------------------------------------------------- session items

  async appendSessionItems(conversationId: string, payloads: unknown[]): Promise<void> {
    if (payloads.length === 0) return;
    const database = this.prisma.db;
    if (!database) {
      await this.file.update((current) => {
        let nextItemId = current.nextItemId;
        const added = payloads.map((payload) => ({
          id: nextItemId++,
          conversationId,
          payload,
        }));
        return { ...current, sessionItems: [...current.sessionItems, ...added], nextItemId };
      });
      return;
    }
    await database.agentSessionItem.createMany({
      data: payloads.map((payload) => ({ conversationId, payload: payload as never })),
    });
  }

  async listSessionItems(conversationId: string, limit?: number): Promise<unknown[]> {
    const database = this.prisma.db;
    if (!database) {
      const { sessionItems } = await this.file.read();
      const all = sessionItems
        .filter((item) => item.conversationId === conversationId)
        .sort((a, b) => a.id - b.id)
        .map((item) => item.payload);
      return limit ? all.slice(-limit) : all;
    }
    const rows = await database.agentSessionItem.findMany({
      where: { conversationId },
      orderBy: { id: limit ? 'desc' : 'asc' },
      ...(limit ? { take: limit } : {}),
    });
    const payloads = rows.map((row) => row.payload as unknown);
    return limit ? payloads.reverse() : payloads;
  }

  async popSessionItem(conversationId: string): Promise<unknown | undefined> {
    const database = this.prisma.db;
    if (!database) {
      let popped: unknown;
      await this.file.update((current) => {
        const mine = current.sessionItems
          .filter((item) => item.conversationId === conversationId)
          .sort((a, b) => a.id - b.id);
        const last = mine[mine.length - 1];
        if (!last) return current;
        popped = last.payload;
        return {
          ...current,
          sessionItems: current.sessionItems.filter((item) => item.id !== last.id),
        };
      });
      return popped;
    }
    const last = await database.agentSessionItem.findFirst({
      where: { conversationId },
      orderBy: { id: 'desc' },
    });
    if (!last) return undefined;
    await database.agentSessionItem.delete({ where: { id: last.id } });
    return last.payload as unknown;
  }

  async clearSessionItems(conversationId: string): Promise<void> {
    const database = this.prisma.db;
    if (!database) {
      await this.file.update((current) => ({
        ...current,
        sessionItems: current.sessionItems.filter((item) => item.conversationId !== conversationId),
      }));
      return;
    }
    await database.agentSessionItem.deleteMany({ where: { conversationId } });
  }

  // --------------------------------------------------------------- run rows

  async recordRun(userId: string, run: AgentRunRecord): Promise<void> {
    const database = this.prisma.db;
    if (!database) {
      await this.file.update((current) => ({
        ...current,
        runs: [...current.runs.filter((entry) => entry.id !== run.id), run].slice(-500),
      }));
      return;
    }
    const data = {
      conversationId: run.conversationId,
      userId,
      agentId: run.agentId,
      status: run.status,
      startedAt: new Date(run.startedAt),
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      durationMs: run.durationMs,
      firstTokenMs: run.firstTokenMs,
      providerId: run.model?.providerId ?? null,
      modelId: run.model?.modelId ?? null,
      fallbackFrom: run.fallbackFrom ? `${run.fallbackFrom.providerId}/${run.fallbackFrom.modelId}` : null,
      inputTokens: run.usage.inputTokens,
      outputTokens: run.usage.outputTokens,
      requests: run.usage.requests,
      toolCalls: run.toolCalls,
      toolFailures: run.toolFailures,
      handoffs: run.handoffs,
      searchProvider: run.searchProvider,
      referenceCount: run.referenceCount,
      errorCode: run.errorCode,
    };
    await database.agentRun.upsert({
      where: { id: run.id },
      create: { id: run.id, ...data },
      update: data,
    });
  }

  async listRuns(userId: string, conversationId?: string, limit = 25): Promise<AgentRunRecord[]> {
    const database = this.prisma.db;
    if (!database) {
      const { runs } = await this.file.read();
      return runs
        .filter((run) => (conversationId ? run.conversationId === conversationId : true))
        .slice(-limit)
        .reverse();
    }
    const rows = await database.agentRun.findMany({
      where: { userId, ...(conversationId ? { conversationId } : {}) },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(runFromRow);
  }
}

/** Drop the owner before a conversation leaves the repository. */
function publicShape(stored: StoredConversation, messageCount: number): AgentConversation {
  const { userId: _owner, ...rest } = stored;
  return { ...rest, messageCount };
}

function sortConversations(
  list: StoredConversation[],
  pinnedFirst: boolean,
): StoredConversation[] {
  return [...list].sort((a, b) => {
    if (pinnedFirst && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

type ConversationRow = {
  id: string;
  title: string;
  agentId: string;
  pinned: boolean;
  symbol: string | null;
  timeframe: string | null;
  workspace: string | null;
  providerId: string | null;
  modelId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { messages: number };
};

function conversationFromRow(row: ConversationRow): AgentConversation {
  return {
    id: row.id,
    title: row.title,
    agentId: row.agentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    pinned: row.pinned,
    messageCount: row._count?.messages ?? 0,
    context: { symbol: row.symbol, timeframe: row.timeframe, workspace: row.workspace },
    lastModel:
      row.providerId && row.modelId
        ? { providerId: row.providerId, providerName: row.providerId, modelId: row.modelId }
        : null,
  };
}

type MessageRow = {
  id: string;
  conversationId: string;
  role: string;
  text: string;
  agentId: string | null;
  providerId: string | null;
  modelId: string | null;
  attachments: unknown;
  toolRuns: unknown;
  error: unknown;
  createdAt: Date;
  references?: {
    citationIndex: number;
    reference: {
      id: string;
      type: string;
      title: string;
      url: string | null;
      source: string | null;
      publishedAt: Date | null;
      entityId: string | null;
      snippet: string | null;
      metadata: unknown;
    };
  }[];
};

function messageFromRow(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as AgentMessage['role'],
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    agentId: row.agentId,
    model:
      row.providerId && row.modelId
        ? { providerId: row.providerId, providerName: row.providerId, modelId: row.modelId }
        : null,
    references: (row.references ?? [])
      .map((entry) => ({
        id: entry.reference.id,
        type: entry.reference.type as AgentMessageReference['type'],
        title: entry.reference.title,
        url: entry.reference.url,
        source: entry.reference.source,
        publishedAt: entry.reference.publishedAt?.toISOString() ?? null,
        entityId: entry.reference.entityId,
        snippet: entry.reference.snippet,
        metadata: (entry.reference.metadata ?? {}) as Record<string, unknown>,
        citationIndex: entry.citationIndex,
      }))
      .sort((a, b) => a.citationIndex - b.citationIndex),
    toolRuns: (row.toolRuns ?? []) as AgentToolRun[],
    attachments: (row.attachments ?? []) as AgentMessage['attachments'],
    error: (row.error ?? null) as AgentMessage['error'],
  };
}

type RunRow = {
  id: string;
  conversationId: string;
  agentId: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  firstTokenMs: number | null;
  providerId: string | null;
  modelId: string | null;
  fallbackFrom: string | null;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  toolCalls: number;
  toolFailures: number;
  handoffs: number;
  searchProvider: string | null;
  referenceCount: number;
  errorCode: string | null;
};

function runFromRow(row: RunRow): AgentRunRecord {
  const [fallbackProvider, fallbackModel] = (row.fallbackFrom ?? '').split('/');
  return {
    id: row.id,
    conversationId: row.conversationId,
    agentId: row.agentId,
    status: row.status as AgentRunRecord['status'],
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    firstTokenMs: row.firstTokenMs,
    usage: {
      requests: row.requests,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.inputTokens + row.outputTokens,
    },
    model:
      row.providerId && row.modelId
        ? { providerId: row.providerId, providerName: row.providerId, modelId: row.modelId }
        : null,
    fallbackFrom:
      fallbackProvider && fallbackModel
        ? { providerId: fallbackProvider, providerName: fallbackProvider, modelId: fallbackModel }
        : null,
    toolCalls: row.toolCalls,
    toolFailures: row.toolFailures,
    handoffs: row.handoffs,
    searchProvider: row.searchProvider,
    referenceCount: row.referenceCount,
    errorCode: row.errorCode,
  };
}
