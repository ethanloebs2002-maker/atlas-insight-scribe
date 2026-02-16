export type UIStatus = "PROPOSED" | "PENDING_ENTRY" | "OPEN" | "CLOSED";

export type AttributionScenario = {
  scenario_key: string;
  contributed_direction?: "LONG" | "SHORT" | "NEUTRAL";
  contributed_confidence?: number | null;
  timeframe?: string | null;
  metadata?: Record<string, any>;
};

export type PriceLevel = {
  value: number | null;
  label: string;
  source: "DECISION" | "POSITION" | "ORDER" | "FILL" | "MARKET";
  kind: "ENTRY" | "TP" | "SL" | "LIVE" | "EXIT";
  style: "solid" | "dashed" | "ghost";
};

export type TradeVM = {
  id: string;
  decisionId: string;
  symbol: string;
  timeframe: string;
  horizon: string;
  side: "LONG" | "SHORT";
  status: UIStatus;

  probability: {
    initial: number;
    displayPct: number;
    source: string;
  };

  timestamps: {
    decidedAt: string;
    entryPlacedAt?: string | null;
    entryFilledAt?: string | null;
    closedAt?: string | null;
    expiresAt?: string | null;
  };

  prices: {
    plannedEntry: number | null;
    filledEntry: number | null;
    live: number | null;
    tp: number | null;
    sl: number | null;
    exit: number | null;
  };

  levels: {
    entry: PriceLevel;
    tp: PriceLevel;
    sl: PriceLevel;
    live: PriceLevel;
    exit?: PriceLevel;
  };

  performance?: {
    realizedPnL?: number | null;
    realizedR?: number | null;
    outcome?: "TP" | "SL" | "EXPIRY" | "CANCELED" | null;
  };

  /** Derived scenario resolution window */
  resolutionWindow?: {
    minMinutes: number;
    maxMinutes: number;
    label: string;           // e.g. "4–12h"
    derivedFrom: string;     // e.g. "1h × TRENDING × LONG"
  };

  debug?: {
    entrySourceReason: string;
    gating?: Record<string, any>;
  };
};
