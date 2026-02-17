/**
 * ATLAS Global Tooltip Registry
 * Central map of tooltip IDs → plain-English descriptions.
 * Components reference tooltips by ID — never inline ad-hoc text.
 */

const TOOLTIP_REGISTRY: Record<string, string> = {
  // ─── Portfolio Bar ──────────────────────────────────────────
  "portfolio-bar":
    "This shows the current state of ATLAS's hypothetical $100,000 paper portfolio. Some values are unavailable until portfolio accounting is fully wired.",
  "portfolio-starting-capital":
    "The initial hypothetical capital allocated to ATLAS's paper trading engine.",
  "portfolio-available-cash":
    "The amount of hypothetical capital not currently committed to any open position.",
  "portfolio-capital-locked":
    "The total hypothetical capital currently allocated to open paper trades.",
  "portfolio-equity":
    "The total value of the paper portfolio including cash and the mark-to-market value of all open positions.",
  "portfolio-total-pnl":
    "The cumulative hypothetical profit or loss across all closed paper trades.",

  // ─── Summary Metrics ───────────────────────────────────────
  "metric-total-decisions":
    "The total number of consensus decisions ATLAS has generated. This count may be capped for performance reasons.",
  "metric-total-decisions-capped":
    "This metric shows a capped sample for performance reasons. Lifetime totals may be higher.",
  "metric-directional-accuracy":
    "Directional Accuracy shows how often ATLAS correctly predicted market direction over the selected time window.",
  "metric-avg-r":
    "Average Risk-Adjusted Return measures the mean return per trade normalized by the risk taken (distance to Stop Loss).",
  "metric-win-rate":
    "Win Rate is the percentage of closed trades that hit their Take Profit target versus those that hit Stop Loss.",
  "metric-open-pending":
    "The number of currently open positions and pending entry orders awaiting fill.",

  // ─── Trade Detail ──────────────────────────────────────────
  "trade-entry-price":
    "The price at which ATLAS planned or filled the entry for this position.",
  "trade-take-profit":
    "Take Profit is the target exit price where the position would be closed for a gain.",
  "trade-stop-loss":
    "Stop Loss is the protective exit price where the position would be closed to limit loss.",
  "trade-live-price":
    "The current market price from the ATLAS backbone data pipeline.",
  "trade-side-long":
    "A LONG position profits when the price rises above the entry.",
  "trade-side-short":
    "A SHORT position profits when the price falls below the entry.",
  "trade-resolution-window":
    "The estimated time range within which the trade scenario is expected to resolve, derived from the timeframe, regime, and direction.",
  "trade-status-proposed":
    "PROPOSED means ATLAS has identified a potential trade but has not yet committed to placing an entry order.",
  "trade-status-pending":
    "PENDING ENTRY means an entry order has been placed but not yet filled by the market.",
  "trade-status-open":
    "OPEN means the entry order has been filled and the position is actively tracked.",
  "trade-status-closed":
    "CLOSED means the position has been exited, either by Take Profit, Stop Loss, expiry, or cancellation.",
  "trade-pnl":
    "Profit and Loss is the realized dollar gain or loss on this closed trade.",
  "trade-return-r":
    "Risk-Adjusted Return measures how many multiples of the initial risk (entry to Stop Loss distance) were captured.",
  "trade-market-replay":
    "This replay shows how the market behaved before, during, and after this trade.",
  "trade-pop-out-chart":
    "Open an expanded full-size chart view with candlesticks, entry, Stop Loss, and Take Profit overlays.",

  // ─── Consensus Report ──────────────────────────────────────
  "consensus-report":
    "The Consensus Report aggregates agreement across all ATLAS signal sources to produce a unified confidence score.",
  "consensus-source-agreement":
    "Source Agreement measures how consistently different data providers (indicators, news, whales) point in the same direction.",
  "consensus-signal-agreement":
    "Signal Agreement measures how well individual signals within each source category align with each other.",
  "consensus-structure-agreement":
    "Structure Agreement evaluates whether the market's structural characteristics (trend, volume, momentum) support the consensus direction.",
  "consensus-data-completeness":
    "Data Completeness shows what percentage of the expected data inputs were available when this consensus was generated.",
  "consensus-explainer":
    "This explains why ATLAS reached this consensus at the time it was generated.",

  // ─── Dashboard Chart ───────────────────────────────────────
  "chart-mode":
    "Open the chart in full-screen mode with advanced controls including indicators, zoom, and pan.",
  "chart-simple-view":
    "Simple View provides a clean, minimal chart focused on price action — inspired by consumer trading apps.",
  "chart-advanced-view":
    "Advanced View provides full charting controls with multiple indicators, overlays, and analysis tools.",
  "chart-timeframe":
    "Select the candle timeframe. Shorter timeframes show more granular price action; longer timeframes reveal broader trends.",
  "chart-ema":
    "Exponential Moving Average smooths price data to identify trend direction. EMA20 reacts faster; EMA50 shows longer-term trend.",
  "chart-rsi":
    "Relative Strength Index measures momentum on a 0-100 scale. Above 70 suggests overbought; below 30 suggests oversold.",
  "chart-macd":
    "Moving Average Convergence Divergence identifies trend changes by comparing fast and slow moving averages.",
  "chart-bollinger":
    "Bollinger Bands show a volatility envelope around price. Price touching the bands may indicate overextension.",
  "chart-volume":
    "Volume bars show trading activity. High volume confirms price moves; low volume suggests weak conviction.",
  "chart-atr":
    "Average True Range measures market volatility. Higher values indicate larger price swings.",
  "chart-vwap":
    "Volume Weighted Average Price shows the average price weighted by volume — used as a fair value reference.",
  "chart-atlas-overlays":
    "ATLAS overlays show entry zones, Stop Loss levels, and Take Profit targets from the active scenario analysis.",

  // ─── Scenario Card ─────────────────────────────────────────
  "scenario-bullish":
    "The bullish scenario describes conditions under which the asset price is expected to rise.",
  "scenario-bearish":
    "The bearish scenario describes conditions under which the asset price is expected to fall.",
  "scenario-neutral":
    "The neutral scenario describes conditions under which the asset price is expected to remain range-bound.",
  "scenario-probability":
    "The probability assigned to this scenario based on ATLAS's multi-pillar analysis. These are model estimates subject to significant uncertainty.",
  "scenario-confidence":
    "Confidence tier reflects the quality and agreement of evidence supporting this scenario.",
  "scenario-entry-zones":
    "Entry zones are price ranges where a position entry would offer a favorable risk-to-reward ratio according to the analysis.",
  "scenario-invalidation":
    "The invalidation level is the price at which this scenario would be considered disproven.",
  "scenario-targets":
    "Price targets represent levels where partial or full profit-taking is projected, based on historical and structural analysis.",

  // ─── Navigation / Tabs ─────────────────────────────────────
  "nav-dashboard": "View the main analysis dashboard for the selected asset.",
  "nav-paper-trades": "Monitor ATLAS's paper trading decisions, open positions, and performance metrics.",
  "nav-whale-watch": "Track large holder (whale) activity including exchange flows and on-chain movements.",
  "nav-news-intel": "View news analysis, narrative tracking, and media sentiment for crypto assets.",
  "nav-meta": "Inspect ATLAS's self-evaluation: calibration, reasoning quality, and learning health.",
  "nav-gpr": "Browse the Global Pattern Registry — validated trading patterns discovered across assets.",
  "nav-search": "Search for and select an asset to analyze.",

  // ─── Graduation / Learning ─────────────────────────────────
  "graduation-level":
    "Graduation level determines how much influence ATLAS's learning has on future decisions. Higher levels allow more autonomous adjustments.",
  "graduation-dir-acc":
    "Directional Accuracy for graduation measures the percentage of correct direction predictions over the evaluated sample.",
  "graduation-integrity-gating":
    "Integrity gating ensures ATLAS only advances in graduation if data integrity checks pass consistently.",

  // ─── Paper Trades Tabs ─────────────────────────────────────
  "tab-decisions": "All consensus decisions generated by ATLAS, including those that did and did not result in trades.",
  "tab-open": "Currently active positions that have been entered and are being tracked in real time.",
  "tab-closed": "Historical positions that have been exited, with full performance attribution.",
  "tab-health": "Learning health diagnostics including confusion matrix and expectancy metrics.",
  "tab-graduation": "Graduation status showing how close ATLAS is to earning more autonomous influence.",
  "tab-bh-learning": "Buy and Hold learning horizons tracking performance across multiple time windows.",
  "tab-transfer": "Transfer learning metrics showing how patterns from one asset inform analysis of others.",
  "tab-breakdown": "Detailed breakdown of which indicators contributed to each decision.",
  "tab-reliability": "Per-indicator reliability scores showing which signals are most accurate.",
  "tab-patterns": "Discovered indicator patterns and their historical performance.",
  "tab-tiers": "Pattern confidence tiers ranking discovered patterns by reliability and sample size.",
  "tab-anomalies": "Anomaly detection events and their resolution status.",
  "tab-tf-performance": "Timeframe-specific performance showing which timeframes produce the best results.",
  "tab-events": "Engine event timeline showing the sequence of actions taken during evaluation.",
  "tab-diagnostics": "Low-level engine diagnostics for debugging and system health monitoring.",

  // ─── Whale Context ─────────────────────────────────────────
  "whale-flow-bias":
    "Flow bias indicates whether large holders are net buying (positive) or net selling (negative) over the past 24 hours.",
  "whale-severity-sum":
    "Severity sum aggregates the impact scores of all whale events in the lookback window.",

  // ─── Market Context ────────────────────────────────────────
  "market-spread":
    "The bid-ask spread in basis points. Lower spreads indicate better liquidity.",
  "market-imbalance":
    "Order book imbalance measures the ratio of buy-side to sell-side depth. Positive values suggest buying pressure.",
  "market-vol-regime":
    "Volatility regime classifies the current market environment based on realized and implied volatility metrics.",
};

export function getTooltip(id: string): string | undefined {
  return TOOLTIP_REGISTRY[id];
}

export function getTooltipOrDefault(id: string, fallback = "No description available."): string {
  return TOOLTIP_REGISTRY[id] ?? fallback;
}

export default TOOLTIP_REGISTRY;
