-- CreateTable
CREATE TABLE "agent_conversation" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "symbol" TEXT,
    "timeframe" TEXT,
    "workspace" TEXT,
    "provider_id" TEXT,
    "model_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "agent_id" TEXT,
    "provider_id" TEXT,
    "model_id" TEXT,
    "attachments" JSONB,
    "tool_runs" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_reference" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT,
    "published_at" TIMESTAMP(3),
    "entity_id" TEXT,
    "snippet" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_message_reference" (
    "message_id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "citation_index" INTEGER NOT NULL,

    CONSTRAINT "agent_message_reference_pkey" PRIMARY KEY ("message_id","reference_id")
);

-- CreateTable
CREATE TABLE "agent_session_item" (
    "id" SERIAL NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_session_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "first_token_ms" INTEGER,
    "provider_id" TEXT,
    "model_id" TEXT,
    "fallback_from" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tool_calls" INTEGER NOT NULL DEFAULT 0,
    "tool_failures" INTEGER NOT NULL DEFAULT 0,
    "handoffs" INTEGER NOT NULL DEFAULT 0,
    "search_provider" TEXT,
    "reference_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,

    CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_secret" (
    "key" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_secret_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "agent_device" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT,
    "platform" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_item" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "canonical_url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbols" TEXT[],
    "categories" TEXT[],
    "importance" TEXT NOT NULL,
    "sentiment" TEXT,
    "provider" TEXT NOT NULL,
    "provider_item_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "news_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_conversation_user_id_updated_at_idx" ON "agent_conversation"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "agent_conversation_user_id_pinned_updated_at_idx" ON "agent_conversation"("user_id", "pinned", "updated_at");

-- CreateIndex
CREATE INDEX "agent_message_conversation_id_created_at_idx" ON "agent_message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_reference_type_entity_id_idx" ON "agent_reference"("type", "entity_id");

-- CreateIndex
CREATE INDEX "agent_message_reference_message_id_citation_index_idx" ON "agent_message_reference"("message_id", "citation_index");

-- CreateIndex
CREATE INDEX "agent_session_item_conversation_id_id_idx" ON "agent_session_item"("conversation_id", "id");

-- CreateIndex
CREATE INDEX "agent_run_user_id_started_at_idx" ON "agent_run"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_run_conversation_id_started_at_idx" ON "agent_run"("conversation_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_device_user_id_idx" ON "agent_device"("user_id");

-- CreateIndex
CREATE INDEX "news_item_published_at_idx" ON "news_item"("published_at");

-- CreateIndex
CREATE INDEX "news_item_provider_published_at_idx" ON "news_item"("provider", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "news_item_provider_provider_item_id_key" ON "news_item"("provider", "provider_item_id");

-- AddForeignKey
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_message_reference" ADD CONSTRAINT "agent_message_reference_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "agent_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_message_reference" ADD CONSTRAINT "agent_message_reference_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "agent_reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session_item" ADD CONSTRAINT "agent_session_item_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
