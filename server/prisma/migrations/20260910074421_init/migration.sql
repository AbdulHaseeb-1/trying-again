-- CreateTable
CREATE TABLE "calendar_event" (
    "id" TEXT NOT NULL,
    "source_id" INTEGER,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "time_precision" TEXT NOT NULL,
    "actual" TEXT,
    "forecast" TEXT,
    "previous" TEXT,
    "revision" TEXT,
    "outcome" TEXT NOT NULL,
    "released" BOOLEAN NOT NULL,
    "leaked" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "detail_url" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_snapshot" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION,
    "price_change_percent_24h" DOUBLE PRECISION,
    "market_cap" DOUBLE PRECISION,
    "open_interest_usd" DOUBLE PRECISION,
    "open_interest_amount" DOUBLE PRECISION,
    "open_interest_change_24h" DOUBLE PRECISION,
    "volume_usd_24h" DOUBLE PRECISION,
    "volume_change_24h" DOUBLE PRECISION,
    "oi_volume_ratio" DOUBLE PRECISION,
    "funding_by_open_interest" DOUBLE PRECISION,
    "funding_by_volume" DOUBLE PRECISION,
    "funding_annualized" DOUBLE PRECISION,
    "long_short_ratio_24h" DOUBLE PRECISION,
    "global_account_ratio" DOUBLE PRECISION,
    "top_account_ratio" DOUBLE PRECISION,
    "top_position_ratio" DOUBLE PRECISION,
    "options_open_interest_usd" DOUBLE PRECISION,
    "options_volume_usd_24h" DOUBLE PRECISION,
    "liquidation_usd_24h" DOUBLE PRECISION,
    "long_liquidation_usd_24h" DOUBLE PRECISION,
    "short_liquidation_usd_24h" DOUBLE PRECISION,
    "liquidation_count_24h" INTEGER,
    "venue_count" INTEGER NOT NULL,

    CONSTRAINT "asset_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_snapshot" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "perpetual" BOOLEAN NOT NULL,
    "open_interest_usd" DOUBLE PRECISION NOT NULL,
    "open_interest_amount" DOUBLE PRECISION,
    "open_interest_change_24h" DOUBLE PRECISION,
    "volume_usd_24h" DOUBLE PRECISION,
    "funding_rate" DOUBLE PRECISION,
    "funding_interval_hours" INTEGER,
    "long_rate" DOUBLE PRECISION,
    "short_rate" DOUBLE PRECISION,
    "long_liquidation_usd_24h" DOUBLE PRECISION,
    "short_liquidation_usd_24h" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,

    CONSTRAINT "venue_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_snapshot" (
    "id" SERIAL NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "open_interest_usd" DOUBLE PRECISION,
    "open_interest_change_24h" DOUBLE PRECISION,
    "liquidation_usd_24h" DOUBLE PRECISION,
    "liquidation_change_24h" DOUBLE PRECISION,
    "traders_liquidated_24h" INTEGER,
    "average_rsi" DOUBLE PRECISION,
    "coins_tracked" INTEGER NOT NULL,

    CONSTRAINT "market_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_snapshot" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION,
    "price_change_percent_24h" DOUBLE PRECISION,
    "open_interest_usd" DOUBLE PRECISION,
    "open_interest_change_24h" DOUBLE PRECISION,
    "volume_usd_24h" DOUBLE PRECISION,
    "funding_by_open_interest" DOUBLE PRECISION,
    "funding_annualized" DOUBLE PRECISION,
    "long_short_ratio_24h" DOUBLE PRECISION,
    "liquidation_usd_24h" DOUBLE PRECISION,
    "market_cap" DOUBLE PRECISION,

    CONSTRAINT "coin_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_point" (
    "symbol" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "price_open" DOUBLE PRECISION,
    "price_close" DOUBLE PRECISION,

    CONSTRAINT "funding_point_pkey" PRIMARY KEY ("symbol","at")
);

-- CreateTable
CREATE TABLE "price_point" (
    "symbol" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "market_cap" DOUBLE PRECISION,

    CONSTRAINT "price_point_pkey" PRIMARY KEY ("symbol","at")
);

-- CreateTable
CREATE TABLE "liquidation_order" (
    "id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrument_id" TEXT,
    "side" TEXT,
    "price" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "usd" DOUBLE PRECISION NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidation_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_event_scheduled_at_idx" ON "calendar_event"("scheduled_at");

-- CreateIndex
CREATE INDEX "calendar_event_currency_scheduled_at_idx" ON "calendar_event"("currency", "scheduled_at");

-- CreateIndex
CREATE INDEX "calendar_event_impact_scheduled_at_idx" ON "calendar_event"("impact", "scheduled_at");

-- CreateIndex
CREATE INDEX "asset_snapshot_symbol_captured_at_idx" ON "asset_snapshot"("symbol", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "asset_snapshot_symbol_captured_at_key" ON "asset_snapshot"("symbol", "captured_at");

-- CreateIndex
CREATE INDEX "venue_snapshot_symbol_captured_at_idx" ON "venue_snapshot"("symbol", "captured_at");

-- CreateIndex
CREATE INDEX "venue_snapshot_exchange_captured_at_idx" ON "venue_snapshot"("exchange", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "venue_snapshot_symbol_exchange_instrument_captured_at_key" ON "venue_snapshot"("symbol", "exchange", "instrument", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "market_snapshot_captured_at_key" ON "market_snapshot"("captured_at");

-- CreateIndex
CREATE INDEX "market_snapshot_captured_at_idx" ON "market_snapshot"("captured_at");

-- CreateIndex
CREATE INDEX "coin_snapshot_captured_at_idx" ON "coin_snapshot"("captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "coin_snapshot_symbol_captured_at_key" ON "coin_snapshot"("symbol", "captured_at");

-- CreateIndex
CREATE INDEX "funding_point_symbol_at_idx" ON "funding_point"("symbol", "at");

-- CreateIndex
CREATE INDEX "price_point_symbol_at_idx" ON "price_point"("symbol", "at");

-- CreateIndex
CREATE INDEX "liquidation_order_at_idx" ON "liquidation_order"("at");

-- CreateIndex
CREATE INDEX "liquidation_order_symbol_at_idx" ON "liquidation_order"("symbol", "at");

-- CreateIndex
CREATE INDEX "liquidation_order_exchange_at_idx" ON "liquidation_order"("exchange", "at");
