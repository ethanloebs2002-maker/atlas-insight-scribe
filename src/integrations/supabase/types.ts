export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_messages: {
        Row: {
          asset_id: string | null
          body_markdown: string
          category: Database["public"]["Enums"]["admin_msg_category"]
          created_at: string
          evidence_json: Json
          id: string
          read: boolean
          responded_by: string | null
          response_text: string | null
          sender_type: Database["public"]["Enums"]["admin_sender_type"]
          severity: Database["public"]["Enums"]["admin_msg_severity"]
          title: string
        }
        Insert: {
          asset_id?: string | null
          body_markdown?: string
          category?: Database["public"]["Enums"]["admin_msg_category"]
          created_at?: string
          evidence_json?: Json
          id?: string
          read?: boolean
          responded_by?: string | null
          response_text?: string | null
          sender_type?: Database["public"]["Enums"]["admin_sender_type"]
          severity?: Database["public"]["Enums"]["admin_msg_severity"]
          title: string
        }
        Update: {
          asset_id?: string | null
          body_markdown?: string
          category?: Database["public"]["Enums"]["admin_msg_category"]
          created_at?: string
          evidence_json?: Json
          id?: string
          read?: boolean
          responded_by?: string | null
          response_text?: string | null
          sender_type?: Database["public"]["Enums"]["admin_sender_type"]
          severity?: Database["public"]["Enums"]["admin_msg_severity"]
          title?: string
        }
        Relationships: []
      }
      anomaly_events: {
        Row: {
          asset_id: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          metrics_json: Json | null
          resolved: boolean
          resolved_at: string | null
          severity: string
        }
        Insert: {
          asset_id?: string
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          metrics_json?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          metrics_json?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
        }
        Relationships: []
      }
      anomaly_rt_samples: {
        Row: {
          anomaly_score: number
          asset_id: string
          created_at: string
          id: string
          metrics_json: Json | null
          proposed_state: string
          root_causes_json: Json
        }
        Insert: {
          anomaly_score?: number
          asset_id?: string
          created_at?: string
          id?: string
          metrics_json?: Json | null
          proposed_state?: string
          root_causes_json?: Json
        }
        Update: {
          anomaly_score?: number
          asset_id?: string
          created_at?: string
          id?: string
          metrics_json?: Json | null
          proposed_state?: string
          root_causes_json?: Json
        }
        Relationships: []
      }
      anomaly_stable_state: {
        Row: {
          asset_id: string
          consecutive_halt: number
          consecutive_normal: number
          consecutive_warn: number
          cooldown_reason: string | null
          cooldown_until: string | null
          created_at: string
          id: string
          last_transition_at: string
          policy_adjustments_json: Json
          root_causes_json: Json
          stable_score: number
          stable_state: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          consecutive_halt?: number
          consecutive_normal?: number
          consecutive_warn?: number
          cooldown_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          id?: string
          last_transition_at?: string
          policy_adjustments_json?: Json
          root_causes_json?: Json
          stable_score?: number
          stable_state?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          consecutive_halt?: number
          consecutive_normal?: number
          consecutive_warn?: number
          cooldown_reason?: string | null
          cooldown_until?: string | null
          created_at?: string
          id?: string
          last_transition_at?: string
          policy_adjustments_json?: Json
          root_causes_json?: Json
          stable_score?: number
          stable_state?: string
          updated_at?: string
        }
        Relationships: []
      }
      asset_fingerprints: {
        Row: {
          asset_id: string
          atr_normalized: number
          computed_at: string
          correlation_btc: number
          fingerprint_vector: Json
          id: string
          macd_trend: number
          mean_reversion_score: number
          momentum_score: number
          regime_label: string
          rsi_avg: number
          timeframe: string
          trend_strength: number
          volatility_rank: number
          volume_profile: number
        }
        Insert: {
          asset_id: string
          atr_normalized?: number
          computed_at?: string
          correlation_btc?: number
          fingerprint_vector?: Json
          id?: string
          macd_trend?: number
          mean_reversion_score?: number
          momentum_score?: number
          regime_label?: string
          rsi_avg?: number
          timeframe?: string
          trend_strength?: number
          volatility_rank?: number
          volume_profile?: number
        }
        Update: {
          asset_id?: string
          atr_normalized?: number
          computed_at?: string
          correlation_btc?: number
          fingerprint_vector?: Json
          id?: string
          macd_trend?: number
          mean_reversion_score?: number
          momentum_score?: number
          regime_label?: string
          rsi_avg?: number
          timeframe?: string
          trend_strength?: number
          volatility_rank?: number
          volume_profile?: number
        }
        Relationships: []
      }
      atlas_assets: {
        Row: {
          asset_type: string
          chain: string
          contract_address: string | null
          created_at: string
          decimals: number | null
          enabled: boolean
          metadata: Json
          name: string
          symbol: string
          updated_at: string
          whale_min_usd_exchange: number
          whale_min_usd_onchain: number
        }
        Insert: {
          asset_type: string
          chain: string
          contract_address?: string | null
          created_at?: string
          decimals?: number | null
          enabled?: boolean
          metadata?: Json
          name: string
          symbol: string
          updated_at?: string
          whale_min_usd_exchange?: number
          whale_min_usd_onchain?: number
        }
        Update: {
          asset_type?: string
          chain?: string
          contract_address?: string | null
          created_at?: string
          decimals?: number | null
          enabled?: boolean
          metadata?: Json
          name?: string
          symbol?: string
          updated_at?: string
          whale_min_usd_exchange?: number
          whale_min_usd_onchain?: number
        }
        Relationships: []
      }
      atlas_settings: {
        Row: {
          eval_cadence_ms: number
          id: string
          last_auto_eval_at: string | null
          updated_at: string
        }
        Insert: {
          eval_cadence_ms?: number
          id?: string
          last_auto_eval_at?: string | null
          updated_at?: string
        }
        Update: {
          eval_cadence_ms?: number
          id?: string
          last_auto_eval_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      authority_states: {
        Row: {
          asset_id: string
          authority_level: number
          created_at: string
          id: string
          last_change_ts: string
          rationale_json: Json
          timeframe_class: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          authority_level?: number
          created_at?: string
          id?: string
          last_change_ts?: string
          rationale_json?: Json
          timeframe_class?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          authority_level?: number
          created_at?: string
          id?: string
          last_change_ts?: string
          rationale_json?: Json
          timeframe_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      calibration_curves: {
        Row: {
          actual_win_rate: number
          asset_id: string
          calibration_delta: number
          computed_at: string | null
          confidence_interval: number | null
          id: string
          pillar: string
          predicted_prob: number
          regime: string | null
          sample_size: number
          timeframe: string
          window_end: string
          window_start: string
        }
        Insert: {
          actual_win_rate: number
          asset_id: string
          calibration_delta: number
          computed_at?: string | null
          confidence_interval?: number | null
          id?: string
          pillar: string
          predicted_prob: number
          regime?: string | null
          sample_size: number
          timeframe: string
          window_end: string
          window_start: string
        }
        Update: {
          actual_win_rate?: number
          asset_id?: string
          calibration_delta?: number
          computed_at?: string | null
          confidence_interval?: number | null
          id?: string
          pillar?: string
          predicted_prob?: number
          regime?: string | null
          sample_size?: number
          timeframe?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      consensus_decisions: {
        Row: {
          agreement_rate: number
          asset_id: string
          block_reason: string | null
          consensus_score: number
          consilience_level: string | null
          created_at: string | null
          decision_type: string
          direction: string
          diversity_score: number
          final_probability: number
          groupthink_warning: boolean | null
          historical_signal: Json
          horizon: string
          id: string
          indicator_signal: Json
          learning_signal: Json
          news_signal: Json
          paper_decision_id: string | null
          pattern_signal: Json
          ref_price: number | null
          regime: string | null
          run_id: string
          sentiment_signal: Json
          timeframe: string
          uncertainty_escalation: boolean | null
          version_tag: string | null
          whale_divergence: boolean | null
          whale_signal: Json
        }
        Insert: {
          agreement_rate: number
          asset_id: string
          block_reason?: string | null
          consensus_score: number
          consilience_level?: string | null
          created_at?: string | null
          decision_type: string
          direction: string
          diversity_score: number
          final_probability: number
          groupthink_warning?: boolean | null
          historical_signal: Json
          horizon: string
          id?: string
          indicator_signal: Json
          learning_signal: Json
          news_signal: Json
          paper_decision_id?: string | null
          pattern_signal: Json
          ref_price?: number | null
          regime?: string | null
          run_id: string
          sentiment_signal: Json
          timeframe: string
          uncertainty_escalation?: boolean | null
          version_tag?: string | null
          whale_divergence?: boolean | null
          whale_signal: Json
        }
        Update: {
          agreement_rate?: number
          asset_id?: string
          block_reason?: string | null
          consensus_score?: number
          consilience_level?: string | null
          created_at?: string | null
          decision_type?: string
          direction?: string
          diversity_score?: number
          final_probability?: number
          groupthink_warning?: boolean | null
          historical_signal?: Json
          horizon?: string
          id?: string
          indicator_signal?: Json
          learning_signal?: Json
          news_signal?: Json
          paper_decision_id?: string | null
          pattern_signal?: Json
          ref_price?: number | null
          regime?: string | null
          run_id?: string
          sentiment_signal?: Json
          timeframe?: string
          uncertainty_escalation?: boolean | null
          version_tag?: string | null
          whale_divergence?: boolean | null
          whale_signal?: Json
        }
        Relationships: [
          {
            foreignKeyName: "consensus_decisions_paper_decision_id_fkey"
            columns: ["paper_decision_id"]
            isOneToOne: false
            referencedRelation: "paper_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      debug_trace_events: {
        Row: {
          asset_id: string
          event_type: string
          id: string
          message: string
          payload_json: Json
          phase: string
          run_id: string
          timeframe: string
          ts: string
        }
        Insert: {
          asset_id: string
          event_type?: string
          id?: string
          message?: string
          payload_json?: Json
          phase: string
          run_id: string
          timeframe?: string
          ts?: string
        }
        Update: {
          asset_id?: string
          event_type?: string
          id?: string
          message?: string
          payload_json?: Json
          phase?: string
          run_id?: string
          timeframe?: string
          ts?: string
        }
        Relationships: []
      }
      derivatives_context_snapshots: {
        Row: {
          created_at: string
          decision_id: string | null
          funding_rate: number | null
          funding_rate_24h_avg: number | null
          id: string
          long_short_ratio: number | null
          metadata: Json
          open_interest_change_1h: number | null
          open_interest_change_24h: number | null
          open_interest_usd: number | null
          position_id: string | null
          provider: string
          snapshot_time: string
          symbol: string
          trade_id: string | null
        }
        Insert: {
          created_at?: string
          decision_id?: string | null
          funding_rate?: number | null
          funding_rate_24h_avg?: number | null
          id?: string
          long_short_ratio?: number | null
          metadata?: Json
          open_interest_change_1h?: number | null
          open_interest_change_24h?: number | null
          open_interest_usd?: number | null
          position_id?: string | null
          provider?: string
          snapshot_time: string
          symbol: string
          trade_id?: string | null
        }
        Update: {
          created_at?: string
          decision_id?: string | null
          funding_rate?: number | null
          funding_rate_24h_avg?: number | null
          id?: string
          long_short_ratio?: number | null
          metadata?: Json
          open_interest_change_1h?: number | null
          open_interest_change_24h?: number | null
          open_interest_usd?: number | null
          position_id?: string | null
          provider?: string
          snapshot_time?: string
          symbol?: string
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "derivatives_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "paper_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derivatives_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_atlas_v3_trade_entry_context"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "derivatives_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_market_context_trade_outcome"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "derivatives_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_whale_trade_outcome_analysis"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "derivatives_context_snapshots_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "atlas_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      epistemic_attributions: {
        Row: {
          asset_id: string
          created_at: string
          data_insufficiency_p: number
          data_integrity_failure_p: number
          id: string
          model_miscalibration_p: number
          structural_change_p: number
          timeframe_class: string
          ts: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          data_insufficiency_p?: number
          data_integrity_failure_p?: number
          id?: string
          model_miscalibration_p?: number
          structural_change_p?: number
          timeframe_class?: string
          ts?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          data_insufficiency_p?: number
          data_integrity_failure_p?: number
          id?: string
          model_miscalibration_p?: number
          structural_change_p?: number
          timeframe_class?: string
          ts?: string
        }
        Relationships: []
      }
      evaluation_runs: {
        Row: {
          asset_id: string
          best_tf_score: number | null
          chosen_timeframe: string | null
          created_at: string
          decisions_written_n: number
          error_text: string | null
          eta_seconds: number | null
          evaluation_mode: string
          final_phase: string | null
          id: string
          progress_0_100: number
          run_id: string
          status: string
          timeframe: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          best_tf_score?: number | null
          chosen_timeframe?: string | null
          created_at?: string
          decisions_written_n?: number
          error_text?: string | null
          eta_seconds?: number | null
          evaluation_mode?: string
          final_phase?: string | null
          id?: string
          progress_0_100?: number
          run_id?: string
          status?: string
          timeframe?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          best_tf_score?: number | null
          chosen_timeframe?: string | null
          created_at?: string
          decisions_written_n?: number
          error_text?: string | null
          eta_seconds?: number | null
          evaluation_mode?: string
          final_phase?: string | null
          id?: string
          progress_0_100?: number
          run_id?: string
          status?: string
          timeframe?: string
          updated_at?: string
        }
        Relationships: []
      }
      execution_cost_snapshots: {
        Row: {
          created_at: string
          decision_id: string | null
          est_slippage_bps: number | null
          est_spread_bps: number | null
          est_total_cost_bps: number | null
          id: string
          liquidity_thin: boolean
          metadata: Json
          notional_usd: number
          position_id: string | null
          snapshot_time: string
          symbol: string
          trade_id: string | null
        }
        Insert: {
          created_at?: string
          decision_id?: string | null
          est_slippage_bps?: number | null
          est_spread_bps?: number | null
          est_total_cost_bps?: number | null
          id?: string
          liquidity_thin?: boolean
          metadata?: Json
          notional_usd: number
          position_id?: string | null
          snapshot_time: string
          symbol: string
          trade_id?: string | null
        }
        Update: {
          created_at?: string
          decision_id?: string | null
          est_slippage_bps?: number | null
          est_spread_bps?: number | null
          est_total_cost_bps?: number | null
          id?: string
          liquidity_thin?: boolean
          metadata?: Json
          notional_usd?: number
          position_id?: string | null
          snapshot_time?: string
          symbol?: string
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_cost_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "paper_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_cost_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_atlas_v3_trade_entry_context"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "execution_cost_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_market_context_trade_outcome"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "execution_cost_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_whale_trade_outcome_analysis"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "execution_cost_snapshots_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "atlas_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      global_pattern_evidence: {
        Row: {
          asset_id: string
          context_bucket_id: string
          created_at: string
          diracc_uplift: number
          ev_uplift: number
          id: string
          last_validated_ts: string
          signature_hash: string
          stability_score: number
          support_n_decisions: number
          support_n_trades: number
          timeframe_class: string
        }
        Insert: {
          asset_id: string
          context_bucket_id?: string
          created_at?: string
          diracc_uplift?: number
          ev_uplift?: number
          id?: string
          last_validated_ts?: string
          signature_hash: string
          stability_score?: number
          support_n_decisions?: number
          support_n_trades?: number
          timeframe_class?: string
        }
        Update: {
          asset_id?: string
          context_bucket_id?: string
          created_at?: string
          diracc_uplift?: number
          ev_uplift?: number
          id?: string
          last_validated_ts?: string
          signature_hash?: string
          stability_score?: number
          support_n_decisions?: number
          support_n_trades?: number
          timeframe_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_pattern_evidence_signature_hash_fkey"
            columns: ["signature_hash"]
            isOneToOne: false
            referencedRelation: "global_patterns"
            referencedColumns: ["signature_hash"]
          },
        ]
      }
      global_patterns: {
        Row: {
          assets_success_n: number
          assets_tested_n: number
          canonical_conditions_json: Json
          context_tags_json: Json
          contexts_supported_json: Json
          created_at: string
          description_snippet: string
          first_published_ts: string | null
          last_validated_ts: string
          mean_diracc_uplift: number
          mean_ev_uplift: number
          portability_score: number
          publish_status: string
          signature_hash: string
          stability_score: number
          updated_at: string
        }
        Insert: {
          assets_success_n?: number
          assets_tested_n?: number
          canonical_conditions_json?: Json
          context_tags_json?: Json
          contexts_supported_json?: Json
          created_at?: string
          description_snippet?: string
          first_published_ts?: string | null
          last_validated_ts?: string
          mean_diracc_uplift?: number
          mean_ev_uplift?: number
          portability_score?: number
          publish_status?: string
          signature_hash: string
          stability_score?: number
          updated_at?: string
        }
        Update: {
          assets_success_n?: number
          assets_tested_n?: number
          canonical_conditions_json?: Json
          context_tags_json?: Json
          contexts_supported_json?: Json
          created_at?: string
          description_snippet?: string
          first_published_ts?: string | null
          last_validated_ts?: string
          mean_diracc_uplift?: number
          mean_ev_uplift?: number
          portability_score?: number
          publish_status?: string
          signature_hash?: string
          stability_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      graduation_status: {
        Row: {
          asset_id: string
          avg_return_r: number | null
          dir_acc: number | null
          graduation_level: number
          horizon: string
          id: string
          influence_mode: string
          integrity_gating_pass: boolean
          last_drift_check: string | null
          median_r: number | null
          n_decisions: number
          n_opened_trades: number
          timeframe: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          avg_return_r?: number | null
          dir_acc?: number | null
          graduation_level?: number
          horizon?: string
          id?: string
          influence_mode?: string
          integrity_gating_pass?: boolean
          last_drift_check?: string | null
          median_r?: number | null
          n_decisions?: number
          n_opened_trades?: number
          timeframe?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          avg_return_r?: number | null
          dir_acc?: number | null
          graduation_level?: number
          horizon?: string
          id?: string
          influence_mode?: string
          integrity_gating_pass?: boolean
          last_drift_check?: string | null
          median_r?: number | null
          n_decisions?: number
          n_opened_trades?: number
          timeframe?: string
          updated_at?: string
        }
        Relationships: []
      }
      historical_analogs: {
        Row: {
          asset_id: string
          created_at: string | null
          current_state_json: Json
          feature_weights: Json | null
          historical_direction: string | null
          historical_return_pct: number | null
          historical_volatility: number | null
          id: string
          matched_features: string[] | null
          matched_period_end: string
          matched_period_start: string
          outcome_window_hours: number
          prediction_confidence: number | null
          similarity_score: number
          snapshot_ts: string
        }
        Insert: {
          asset_id: string
          created_at?: string | null
          current_state_json: Json
          feature_weights?: Json | null
          historical_direction?: string | null
          historical_return_pct?: number | null
          historical_volatility?: number | null
          id?: string
          matched_features?: string[] | null
          matched_period_end: string
          matched_period_start: string
          outcome_window_hours: number
          prediction_confidence?: number | null
          similarity_score: number
          snapshot_ts: string
        }
        Update: {
          asset_id?: string
          created_at?: string | null
          current_state_json?: Json
          feature_weights?: Json | null
          historical_direction?: string | null
          historical_return_pct?: number | null
          historical_volatility?: number | null
          id?: string
          matched_features?: string[] | null
          matched_period_end?: string
          matched_period_start?: string
          outcome_window_hours?: number
          prediction_confidence?: number | null
          similarity_score?: number
          snapshot_ts?: string
        }
        Relationships: []
      }
      incorporated_assets: {
        Row: {
          asset_id: string
          created_at: string
          default_timeframe: string
          is_enabled: boolean
          liquidity_tier: string
          symbol: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          default_timeframe?: string
          is_enabled?: boolean
          liquidity_tier?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          default_timeframe?: string
          is_enabled?: boolean
          liquidity_tier?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      indicator_outcome_links: {
        Row: {
          created_at: string
          decision_id: string
          direction_correct: number
          horizon_realized_dir: string | null
          id: string
          mae_r: number | null
          mfe_r: number | null
          outcome_label: string | null
          return_r: number | null
          trade_id: string | null
        }
        Insert: {
          created_at?: string
          decision_id: string
          direction_correct?: number
          horizon_realized_dir?: string | null
          id?: string
          mae_r?: number | null
          mfe_r?: number | null
          outcome_label?: string | null
          return_r?: number | null
          trade_id?: string | null
        }
        Update: {
          created_at?: string
          decision_id?: string
          direction_correct?: number
          horizon_realized_dir?: string | null
          id?: string
          mae_r?: number | null
          mfe_r?: number | null
          outcome_label?: string | null
          return_r?: number | null
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indicator_outcome_links_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "paper_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_outcome_links_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "paper_trades_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      indicator_patterns: {
        Row: {
          asset_id: string
          conditions_json: Json
          confidence_tier: string
          created_at: string
          diracc_uplift: number
          ev_uplift: number
          id: string
          is_active: boolean
          last_validated_ts: string
          regime_label: string
          stability_score: number
          support_n_decisions: number
          support_n_trades: number
          timeframe: string
        }
        Insert: {
          asset_id?: string
          conditions_json?: Json
          confidence_tier?: string
          created_at?: string
          diracc_uplift?: number
          ev_uplift?: number
          id?: string
          is_active?: boolean
          last_validated_ts?: string
          regime_label?: string
          stability_score?: number
          support_n_decisions?: number
          support_n_trades?: number
          timeframe?: string
        }
        Update: {
          asset_id?: string
          conditions_json?: Json
          confidence_tier?: string
          created_at?: string
          diracc_uplift?: number
          ev_uplift?: number
          id?: string
          is_active?: boolean
          last_validated_ts?: string
          regime_label?: string
          stability_score?: number
          support_n_decisions?: number
          support_n_trades?: number
          timeframe?: string
        }
        Relationships: []
      }
      indicator_reliability: {
        Row: {
          asset_id: string
          diracc_lift: number
          ev_lift: number
          false_positive_rate: number
          id: string
          indicator_name: string
          last_updated_ts: string
          regime_label: string
          sample_n: number
          timeframe: string
        }
        Insert: {
          asset_id: string
          diracc_lift?: number
          ev_lift?: number
          false_positive_rate?: number
          id?: string
          indicator_name: string
          last_updated_ts?: string
          regime_label?: string
          sample_n?: number
          timeframe?: string
        }
        Update: {
          asset_id?: string
          diracc_lift?: number
          ev_lift?: number
          false_positive_rate?: number
          id?: string
          indicator_name?: string
          last_updated_ts?: string
          regime_label?: string
          sample_n?: number
          timeframe?: string
        }
        Relationships: []
      }
      indicator_snapshots: {
        Row: {
          asset_id: string
          created_at: string
          decision_id: string
          engine_outputs_json: Json | null
          id: string
          indicators_json: Json
          integrity_json: Json | null
          regime_label: string
          role_scores_json: Json | null
          timeframe_confirm: string | null
          timeframe_primary: string
          ts: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          decision_id: string
          engine_outputs_json?: Json | null
          id?: string
          indicators_json?: Json
          integrity_json?: Json | null
          regime_label?: string
          role_scores_json?: Json | null
          timeframe_confirm?: string | null
          timeframe_primary?: string
          ts?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          decision_id?: string
          engine_outputs_json?: Json | null
          id?: string
          indicators_json?: Json
          integrity_json?: Json | null
          regime_label?: string
          role_scores_json?: Json | null
          timeframe_confirm?: string | null
          timeframe_primary?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicator_snapshots_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "paper_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      introspection_snapshots: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          integrity_state: Json
          learning_state: Json
          reasoning_composition: Json
          timeframe_class: string
          ts: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          integrity_state?: Json
          learning_state?: Json
          reasoning_composition?: Json
          timeframe_class?: string
          ts?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          integrity_state?: Json
          learning_state?: Json
          reasoning_composition?: Json
          timeframe_class?: string
          ts?: string
        }
        Relationships: []
      }
      market_context_snapshots: {
        Row: {
          ask_depth_usd: number | null
          atr_1h: number | null
          atr_4h: number | null
          best_ask: number | null
          best_bid: number | null
          bid_depth_usd: number | null
          created_at: string
          decision_id: string | null
          depth_concentration: number | null
          id: string
          iv_proxy: number | null
          iv_rv_spread: number | null
          metadata: Json
          mid_price: number | null
          ob_imbalance: number | null
          position_id: string | null
          rv_1h: number | null
          rv_24h: number | null
          rv_4h: number | null
          session_detail: string
          session_primary: string
          session_utc_hour: number
          snapshot_time: string
          spread_abs: number | null
          spread_bps: number | null
          symbol: string
          trade_id: string | null
          vol_regime: string | null
        }
        Insert: {
          ask_depth_usd?: number | null
          atr_1h?: number | null
          atr_4h?: number | null
          best_ask?: number | null
          best_bid?: number | null
          bid_depth_usd?: number | null
          created_at?: string
          decision_id?: string | null
          depth_concentration?: number | null
          id?: string
          iv_proxy?: number | null
          iv_rv_spread?: number | null
          metadata?: Json
          mid_price?: number | null
          ob_imbalance?: number | null
          position_id?: string | null
          rv_1h?: number | null
          rv_24h?: number | null
          rv_4h?: number | null
          session_detail: string
          session_primary: string
          session_utc_hour: number
          snapshot_time: string
          spread_abs?: number | null
          spread_bps?: number | null
          symbol: string
          trade_id?: string | null
          vol_regime?: string | null
        }
        Update: {
          ask_depth_usd?: number | null
          atr_1h?: number | null
          atr_4h?: number | null
          best_ask?: number | null
          best_bid?: number | null
          bid_depth_usd?: number | null
          created_at?: string
          decision_id?: string | null
          depth_concentration?: number | null
          id?: string
          iv_proxy?: number | null
          iv_rv_spread?: number | null
          metadata?: Json
          mid_price?: number | null
          ob_imbalance?: number | null
          position_id?: string | null
          rv_1h?: number | null
          rv_24h?: number | null
          rv_4h?: number | null
          session_detail?: string
          session_primary?: string
          session_utc_hour?: number
          snapshot_time?: string
          spread_abs?: number | null
          spread_bps?: number | null
          symbol?: string
          trade_id?: string | null
          vol_regime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "paper_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_atlas_v3_trade_entry_context"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "market_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_market_context_trade_outcome"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "market_context_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_whale_trade_outcome_analysis"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "market_context_snapshots_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "atlas_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      maturity_states: {
        Row: {
          asset_id: string
          confidence: number
          cooldown_until: string | null
          created_at: string
          demotion_streak: number
          id: string
          last_change_ts: string
          maturity_level: number
          promotion_streak: number
          reasons_json: Json
          timeframe_class: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          confidence?: number
          cooldown_until?: string | null
          created_at?: string
          demotion_streak?: number
          id?: string
          last_change_ts?: string
          maturity_level?: number
          promotion_streak?: number
          reasons_json?: Json
          timeframe_class?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          confidence?: number
          cooldown_until?: string | null
          created_at?: string
          demotion_streak?: number
          id?: string
          last_change_ts?: string
          maturity_level?: number
          promotion_streak?: number
          reasons_json?: Json
          timeframe_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_evaluations: {
        Row: {
          abstention_quality: number
          asset_id: string
          calibration_error: number
          created_at: string
          early_warning_lead_time: number
          false_alarm_rate: number
          hypothesis_diversity: number
          id: string
          learning_instability: number
          overconfidence_risk: number
          timeframe_class: string
          ts: string
        }
        Insert: {
          abstention_quality?: number
          asset_id: string
          calibration_error?: number
          created_at?: string
          early_warning_lead_time?: number
          false_alarm_rate?: number
          hypothesis_diversity?: number
          id?: string
          learning_instability?: number
          overconfidence_risk?: number
          timeframe_class?: string
          ts?: string
        }
        Update: {
          abstention_quality?: number
          asset_id?: string
          calibration_error?: number
          created_at?: string
          early_warning_lead_time?: number
          false_alarm_rate?: number
          hypothesis_diversity?: number
          id?: string
          learning_instability?: number
          overconfidence_risk?: number
          timeframe_class?: string
          ts?: string
        }
        Relationships: []
      }
      meta_insights: {
        Row: {
          actionable: boolean | null
          asset_id: string | null
          confidence: number | null
          created_at: string | null
          description: string
          discovered_at: string | null
          evidence_json: Json
          id: string
          insight_type: string
          proposed_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          severity: string | null
          status: string | null
          timeframe: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          actionable?: boolean | null
          asset_id?: string | null
          confidence?: number | null
          created_at?: string | null
          description: string
          discovered_at?: string | null
          evidence_json: Json
          id?: string
          insight_type: string
          proposed_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          timeframe?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          actionable?: boolean | null
          asset_id?: string | null
          confidence?: number | null
          created_at?: string | null
          description?: string
          discovered_at?: string | null
          evidence_json?: Json
          id?: string
          insight_type?: string
          proposed_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          timeframe?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      news_agenda_signals: {
        Row: {
          agenda_uncertainty: number
          clickbait_intensity: number
          created_at: string
          framing_asymmetry: number
          id: string
          incentive_flags_json: Json | null
          news_id: string
          source_disagreement: number
          speculation_level: number
        }
        Insert: {
          agenda_uncertainty?: number
          clickbait_intensity?: number
          created_at?: string
          framing_asymmetry?: number
          id?: string
          incentive_flags_json?: Json | null
          news_id: string
          source_disagreement?: number
          speculation_level?: number
        }
        Update: {
          agenda_uncertainty?: number
          clickbait_intensity?: number
          created_at?: string
          framing_asymmetry?: number
          id?: string
          incentive_flags_json?: Json | null
          news_id?: string
          source_disagreement?: number
          speculation_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "news_agenda_signals_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: true
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      news_asset_links: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          link_confidence: number
          news_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          link_confidence?: number
          news_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          link_confidence?: number
          news_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_asset_links_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      news_corroboration: {
        Row: {
          computed_at: string
          corroboration_score: number
          created_at: string
          disagreement_score: number
          id: string
          narrative_id: string
          sources_count: number
          tier_a_sources_count: number
        }
        Insert: {
          computed_at?: string
          corroboration_score?: number
          created_at?: string
          disagreement_score?: number
          id?: string
          narrative_id: string
          sources_count?: number
          tier_a_sources_count?: number
        }
        Update: {
          computed_at?: string
          corroboration_score?: number
          created_at?: string
          disagreement_score?: number
          id?: string
          narrative_id?: string
          sources_count?: number
          tier_a_sources_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "news_corroboration_narrative_id_fkey"
            columns: ["narrative_id"]
            isOneToOne: false
            referencedRelation: "news_narratives"
            referencedColumns: ["id"]
          },
        ]
      }
      news_feature_rows: {
        Row: {
          agenda_signals_json: Json | null
          asset_id: string
          corroboration_score: number
          created_at: string
          engine_state_snapshot_json: Json | null
          event_labels_json: Json | null
          id: string
          liquidity_tier: string | null
          market_reaction_labels_json: Json | null
          narrative_id: string | null
          news_id: string
          psych_impact_json: Json | null
          regime_label: string
          source_reliability: number
          timeframe_class: string
          vol_band: string | null
        }
        Insert: {
          agenda_signals_json?: Json | null
          asset_id: string
          corroboration_score?: number
          created_at?: string
          engine_state_snapshot_json?: Json | null
          event_labels_json?: Json | null
          id?: string
          liquidity_tier?: string | null
          market_reaction_labels_json?: Json | null
          narrative_id?: string | null
          news_id: string
          psych_impact_json?: Json | null
          regime_label?: string
          source_reliability?: number
          timeframe_class?: string
          vol_band?: string | null
        }
        Update: {
          agenda_signals_json?: Json | null
          asset_id?: string
          corroboration_score?: number
          created_at?: string
          engine_state_snapshot_json?: Json | null
          event_labels_json?: Json | null
          id?: string
          liquidity_tier?: string | null
          market_reaction_labels_json?: Json | null
          narrative_id?: string | null
          news_id?: string
          psych_impact_json?: Json | null
          regime_label?: string
          source_reliability?: number
          timeframe_class?: string
          vol_band?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_feature_rows_narrative_id_fkey"
            columns: ["narrative_id"]
            isOneToOne: false
            referencedRelation: "news_narratives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_feature_rows_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      news_graduation: {
        Row: {
          agenda_penalty_applied: boolean
          asset_id: string
          created_at: string
          dir_acc_uplift: number | null
          ev_uplift: number | null
          graduation_level: number
          id: string
          influence_mode: string
          integrity_pass: boolean
          last_evaluated_at: string | null
          n_linked_events: number
          n_trades_in_news_state: number
          regime_label: string
          stability_recent: number | null
          timeframe_class: string
          updated_at: string
        }
        Insert: {
          agenda_penalty_applied?: boolean
          asset_id: string
          created_at?: string
          dir_acc_uplift?: number | null
          ev_uplift?: number | null
          graduation_level?: number
          id?: string
          influence_mode?: string
          integrity_pass?: boolean
          last_evaluated_at?: string | null
          n_linked_events?: number
          n_trades_in_news_state?: number
          regime_label?: string
          stability_recent?: number | null
          timeframe_class?: string
          updated_at?: string
        }
        Update: {
          agenda_penalty_applied?: boolean
          asset_id?: string
          created_at?: string
          dir_acc_uplift?: number | null
          ev_uplift?: number | null
          graduation_level?: number
          id?: string
          influence_mode?: string
          integrity_pass?: boolean
          last_evaluated_at?: string | null
          n_linked_events?: number
          n_trades_in_news_state?: number
          regime_label?: string
          stability_recent?: number | null
          timeframe_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          canonical_url: string | null
          categories_json: Json | null
          created_at: string
          dedupe_hash: string | null
          external_id: string | null
          id: string
          ingested_at: string
          published_at: string
          publisher: string | null
          raw_metadata_json: Json | null
          snippet: string | null
          source_id: string | null
          title: string
        }
        Insert: {
          canonical_url?: string | null
          categories_json?: Json | null
          created_at?: string
          dedupe_hash?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string
          published_at?: string
          publisher?: string | null
          raw_metadata_json?: Json | null
          snippet?: string | null
          source_id?: string | null
          title: string
        }
        Update: {
          canonical_url?: string | null
          categories_json?: Json | null
          created_at?: string
          dedupe_hash?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string
          published_at?: string
          publisher?: string | null
          raw_metadata_json?: Json | null
          snippet?: string | null
          source_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_market_reactions: {
        Row: {
          abnormality_score: number
          asset_id: string
          base_ts: string
          computed_at: string
          created_at: string
          horizon_metrics_json: Json
          id: string
          news_id: string
          reaction_confidence: number
          regime_label: string
        }
        Insert: {
          abnormality_score?: number
          asset_id: string
          base_ts: string
          computed_at?: string
          created_at?: string
          horizon_metrics_json?: Json
          id?: string
          news_id: string
          reaction_confidence?: number
          regime_label?: string
        }
        Update: {
          abnormality_score?: number
          asset_id?: string
          base_ts?: string
          computed_at?: string
          created_at?: string
          horizon_metrics_json?: Json
          id?: string
          news_id?: string
          reaction_confidence?: number
          regime_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_market_reactions_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      news_narrative_links: {
        Row: {
          created_at: string
          id: string
          narrative_id: string
          news_id: string
          relevance_score: number
        }
        Insert: {
          created_at?: string
          id?: string
          narrative_id: string
          news_id: string
          relevance_score?: number
        }
        Update: {
          created_at?: string
          id?: string
          narrative_id?: string
          news_id?: string
          relevance_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "news_narrative_links_narrative_id_fkey"
            columns: ["narrative_id"]
            isOneToOne: false
            referencedRelation: "news_narratives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_narrative_links_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      news_narratives: {
        Row: {
          article_count: number
          asset_id: string
          created_at: string
          first_seen_ts: string
          id: string
          is_active: boolean
          last_seen_ts: string
          momentum_24h: number
          momentum_7d: number
          topic_embedding: Json | null
          topic_label: string
        }
        Insert: {
          article_count?: number
          asset_id: string
          created_at?: string
          first_seen_ts?: string
          id?: string
          is_active?: boolean
          last_seen_ts?: string
          momentum_24h?: number
          momentum_7d?: number
          topic_embedding?: Json | null
          topic_label: string
        }
        Update: {
          article_count?: number
          asset_id?: string
          created_at?: string
          first_seen_ts?: string
          id?: string
          is_active?: boolean
          last_seen_ts?: string
          momentum_24h?: number
          momentum_7d?: number
          topic_embedding?: Json | null
          topic_label?: string
        }
        Relationships: []
      }
      news_psych_impact: {
        Row: {
          authority_score: number
          contagion_score: number
          created_at: string
          extraction_confidence: number
          extraction_method: string
          fear_score: number
          greed_fomo_score: number
          id: string
          narrative_pressure_score: number
          news_id: string
          outrage_conflict_score: number
          uncertainty_score: number
          urgency_score: number
        }
        Insert: {
          authority_score?: number
          contagion_score?: number
          created_at?: string
          extraction_confidence?: number
          extraction_method?: string
          fear_score?: number
          greed_fomo_score?: number
          id?: string
          narrative_pressure_score?: number
          news_id: string
          outrage_conflict_score?: number
          uncertainty_score?: number
          urgency_score?: number
        }
        Update: {
          authority_score?: number
          contagion_score?: number
          created_at?: string
          extraction_confidence?: number
          extraction_method?: string
          fear_score?: number
          greed_fomo_score?: number
          id?: string
          narrative_pressure_score?: number
          news_id?: string
          outrage_conflict_score?: number
          uncertainty_score?: number
          urgency_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "news_psych_impact_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: true
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      news_sources: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          name: string
          reliability_weight: number
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          name: string
          reliability_weight?: number
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          name?: string
          reliability_weight?: number
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      paper_decisions: {
        Row: {
          agreement_score: number
          asset_id: string
          completeness_score: number
          consensus_score: number
          correct: boolean | null
          created_at: string
          decision_type: string | null
          direction_pred: string
          emit_run_id: string | null
          emitted_at: string | null
          emitted_by: string
          engine_status: string
          entry_price: number | null
          evaluated_at: string | null
          evidence_snapshot_json: Json | null
          horizon: string
          id: string
          probability_components: Json | null
          probability_pred: number
          probability_raw: number | null
          probability_source: string | null
          realized_dir: string | null
          realized_move_pct: number | null
          ref_price: number
          stop_loss: number | null
          take_profit: number | null
          timeframe: string
          ts: string
          version_tag: string | null
        }
        Insert: {
          agreement_score?: number
          asset_id: string
          completeness_score?: number
          consensus_score?: number
          correct?: boolean | null
          created_at?: string
          decision_type?: string | null
          direction_pred: string
          emit_run_id?: string | null
          emitted_at?: string | null
          emitted_by?: string
          engine_status?: string
          entry_price?: number | null
          evaluated_at?: string | null
          evidence_snapshot_json?: Json | null
          horizon?: string
          id?: string
          probability_components?: Json | null
          probability_pred: number
          probability_raw?: number | null
          probability_source?: string | null
          realized_dir?: string | null
          realized_move_pct?: number | null
          ref_price: number
          stop_loss?: number | null
          take_profit?: number | null
          timeframe?: string
          ts?: string
          version_tag?: string | null
        }
        Update: {
          agreement_score?: number
          asset_id?: string
          completeness_score?: number
          consensus_score?: number
          correct?: boolean | null
          created_at?: string
          decision_type?: string | null
          direction_pred?: string
          emit_run_id?: string | null
          emitted_at?: string | null
          emitted_by?: string
          engine_status?: string
          entry_price?: number | null
          evaluated_at?: string | null
          evidence_snapshot_json?: Json | null
          horizon?: string
          id?: string
          probability_components?: Json | null
          probability_pred?: number
          probability_raw?: number | null
          probability_source?: string | null
          realized_dir?: string | null
          realized_move_pct?: number | null
          ref_price?: number
          stop_loss?: number | null
          take_profit?: number | null
          timeframe?: string
          ts?: string
          version_tag?: string | null
        }
        Relationships: []
      }
      paper_engine_events: {
        Row: {
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          payload: Json
          run_id: string | null
          ts: string
          version_tag: string | null
        }
        Insert: {
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          payload?: Json
          run_id?: string | null
          ts?: string
          version_tag?: string | null
        }
        Update: {
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          payload?: Json
          run_id?: string | null
          ts?: string
          version_tag?: string | null
        }
        Relationships: []
      }
      paper_fills: {
        Row: {
          fee_paid: number
          fill_price: number
          filled_qty: number
          id: string
          meta: Json
          order_id: string
          position_id: string | null
          slippage_paid: number
          ts: string
        }
        Insert: {
          fee_paid?: number
          fill_price: number
          filled_qty?: number
          id?: string
          meta?: Json
          order_id: string
          position_id?: string | null
          slippage_paid?: number
          ts?: string
        }
        Update: {
          fee_paid?: number
          fill_price?: number
          filled_qty?: number
          id?: string
          meta?: Json
          order_id?: string
          position_id?: string | null
          slippage_paid?: number
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_fills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "paper_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_orders: {
        Row: {
          avg_fill_price: number | null
          created_at: string
          eligible_fill_at: string
          filled_qty: number
          id: string
          limit_price: number | null
          meta: Json
          oco_group_id: string | null
          order_type: string
          placed_at: string
          policy_id: string | null
          position_id: string | null
          qty: number
          reduce_only: boolean
          run_id: string | null
          side: string
          status: string
          stop_price: number | null
          symbol: string
          tif: string
          updated_at: string
        }
        Insert: {
          avg_fill_price?: number | null
          created_at?: string
          eligible_fill_at?: string
          filled_qty?: number
          id?: string
          limit_price?: number | null
          meta?: Json
          oco_group_id?: string | null
          order_type: string
          placed_at?: string
          policy_id?: string | null
          position_id?: string | null
          qty?: number
          reduce_only?: boolean
          run_id?: string | null
          side: string
          status?: string
          stop_price?: number | null
          symbol: string
          tif?: string
          updated_at?: string
        }
        Update: {
          avg_fill_price?: number | null
          created_at?: string
          eligible_fill_at?: string
          filled_qty?: number
          id?: string
          limit_price?: number | null
          meta?: Json
          oco_group_id?: string | null
          order_type?: string
          placed_at?: string
          policy_id?: string | null
          position_id?: string | null
          qty?: number
          reduce_only?: boolean
          run_id?: string | null
          side?: string
          status?: string
          stop_price?: number | null
          symbol?: string
          tif?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_orders_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "paper_policy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_orders_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_active_paper_policy"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_policy: {
        Row: {
          allow_shorts: boolean
          created_at: string
          expiry_minutes_by_tf: Json
          fee_bps: number
          fill_fraction_max: number
          fill_fraction_min: number
          id: string
          is_active: boolean
          latency_ms: number
          max_open: number
          max_pending: number
          min_prob: number
          min_rr: number
          notes: string | null
          require_ev_positive: boolean
          slippage_bps: number
          updated_at: string
          version_tag: string
          worst_case_same_candle: boolean
        }
        Insert: {
          allow_shorts?: boolean
          created_at?: string
          expiry_minutes_by_tf?: Json
          fee_bps?: number
          fill_fraction_max?: number
          fill_fraction_min?: number
          id?: string
          is_active?: boolean
          latency_ms?: number
          max_open?: number
          max_pending?: number
          min_prob?: number
          min_rr?: number
          notes?: string | null
          require_ev_positive?: boolean
          slippage_bps?: number
          updated_at?: string
          version_tag?: string
          worst_case_same_candle?: boolean
        }
        Update: {
          allow_shorts?: boolean
          created_at?: string
          expiry_minutes_by_tf?: Json
          fee_bps?: number
          fill_fraction_max?: number
          fill_fraction_min?: number
          id?: string
          is_active?: boolean
          latency_ms?: number
          max_open?: number
          max_pending?: number
          min_prob?: number
          min_rr?: number
          notes?: string | null
          require_ev_positive?: boolean
          slippage_bps?: number
          updated_at?: string
          version_tag?: string
          worst_case_same_candle?: boolean
        }
        Relationships: []
      }
      paper_positions: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          created_at: string
          decision_id: string | null
          duplicate_key: string | null
          eligible_close_at: string | null
          entry_order_id: string | null
          entry_price: number | null
          exit_price: number | null
          expires_at: string | null
          filled_at: string | null
          horizon: string
          id: string
          initial_probability_pred: number | null
          initial_probability_source: string | null
          meta: Json
          outcome_label: string | null
          policy_id: string | null
          qty: number
          realized_pct: number | null
          realized_pnl: number | null
          realized_r: number | null
          regime_label: string | null
          run_id: string | null
          side: string
          sl_order_id: string | null
          status: string
          stop_price: number | null
          symbol: string
          timeframe: string
          tp_order_id: string | null
          tp_price: number | null
          updated_at: string
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          decision_id?: string | null
          duplicate_key?: string | null
          eligible_close_at?: string | null
          entry_order_id?: string | null
          entry_price?: number | null
          exit_price?: number | null
          expires_at?: string | null
          filled_at?: string | null
          horizon?: string
          id?: string
          initial_probability_pred?: number | null
          initial_probability_source?: string | null
          meta?: Json
          outcome_label?: string | null
          policy_id?: string | null
          qty?: number
          realized_pct?: number | null
          realized_pnl?: number | null
          realized_r?: number | null
          regime_label?: string | null
          run_id?: string | null
          side: string
          sl_order_id?: string | null
          status?: string
          stop_price?: number | null
          symbol: string
          timeframe?: string
          tp_order_id?: string | null
          tp_price?: number | null
          updated_at?: string
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          decision_id?: string | null
          duplicate_key?: string | null
          eligible_close_at?: string | null
          entry_order_id?: string | null
          entry_price?: number | null
          exit_price?: number | null
          expires_at?: string | null
          filled_at?: string | null
          horizon?: string
          id?: string
          initial_probability_pred?: number | null
          initial_probability_source?: string | null
          meta?: Json
          outcome_label?: string | null
          policy_id?: string | null
          qty?: number
          realized_pct?: number | null
          realized_pnl?: number | null
          realized_r?: number | null
          regime_label?: string | null
          run_id?: string | null
          side?: string
          sl_order_id?: string | null
          status?: string
          stop_price?: number | null
          symbol?: string
          timeframe?: string
          tp_order_id?: string | null
          tp_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_positions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "paper_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_positions_entry_order_id_fkey"
            columns: ["entry_order_id"]
            isOneToOne: false
            referencedRelation: "paper_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_positions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "paper_policy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_positions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "v_active_paper_policy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_positions_sl_order_id_fkey"
            columns: ["sl_order_id"]
            isOneToOne: false
            referencedRelation: "paper_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_positions_tp_order_id_fkey"
            columns: ["tp_order_id"]
            isOneToOne: false
            referencedRelation: "paper_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trades_legacy: {
        Row: {
          asset_id: string
          close_reason: string | null
          created_at: string
          decision_id: string | null
          duplicate_key: string | null
          entry_zone_high: number
          entry_zone_low: number
          evidence_snapshot_json: Json | null
          exit_price: number | null
          fill_price: number | null
          id: string
          initial_probability_pred: number | null
          initial_probability_source: string | null
          mae_r: number | null
          mfe_r: number | null
          outcome_label: string | null
          regime_label: string | null
          return_pct: number | null
          return_r: number | null
          scenario_type: string
          status: string
          stop_level: number | null
          stop_rule: string | null
          targets_json: Json | null
          time_window_end: string | null
          timeframe: string
          trigger_rule: string | null
          ts_closed: string | null
          ts_created: string
          ts_opened: string | null
        }
        Insert: {
          asset_id: string
          close_reason?: string | null
          created_at?: string
          decision_id?: string | null
          duplicate_key?: string | null
          entry_zone_high: number
          entry_zone_low: number
          evidence_snapshot_json?: Json | null
          exit_price?: number | null
          fill_price?: number | null
          id?: string
          initial_probability_pred?: number | null
          initial_probability_source?: string | null
          mae_r?: number | null
          mfe_r?: number | null
          outcome_label?: string | null
          regime_label?: string | null
          return_pct?: number | null
          return_r?: number | null
          scenario_type: string
          status?: string
          stop_level?: number | null
          stop_rule?: string | null
          targets_json?: Json | null
          time_window_end?: string | null
          timeframe?: string
          trigger_rule?: string | null
          ts_closed?: string | null
          ts_created?: string
          ts_opened?: string | null
        }
        Update: {
          asset_id?: string
          close_reason?: string | null
          created_at?: string
          decision_id?: string | null
          duplicate_key?: string | null
          entry_zone_high?: number
          entry_zone_low?: number
          evidence_snapshot_json?: Json | null
          exit_price?: number | null
          fill_price?: number | null
          id?: string
          initial_probability_pred?: number | null
          initial_probability_source?: string | null
          mae_r?: number | null
          mfe_r?: number | null
          outcome_label?: string | null
          regime_label?: string | null
          return_pct?: number | null
          return_r?: number | null
          scenario_type?: string
          status?: string
          stop_level?: number | null
          stop_rule?: string | null
          targets_json?: Json | null
          time_window_end?: string | null
          timeframe?: string
          trigger_rule?: string | null
          ts_closed?: string | null
          ts_created?: string
          ts_opened?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "paper_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_audit_log: {
        Row: {
          action_type: string
          created_by: string | null
          created_ts: string
          id: string
          reviewer_note: string
          signature_hash: string
        }
        Insert: {
          action_type?: string
          created_by?: string | null
          created_ts?: string
          id?: string
          reviewer_note?: string
          signature_hash: string
        }
        Update: {
          action_type?: string
          created_by?: string | null
          created_ts?: string
          id?: string
          reviewer_note?: string
          signature_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "pattern_audit_log_signature_hash_fkey"
            columns: ["signature_hash"]
            isOneToOne: false
            referencedRelation: "global_patterns"
            referencedColumns: ["signature_hash"]
          },
        ]
      }
      pattern_catalog: {
        Row: {
          avg_r: number | null
          created_at: string | null
          discovered_at: string | null
          id: string
          last_occurrence_at: string | null
          loss_count: number | null
          optional_signals: Json | null
          pattern_id: string
          pattern_name: string
          performance_by_asset: Json | null
          performance_by_regime: Json | null
          performance_by_timeframe: Json | null
          regime_filter: string[] | null
          required_signals: Json
          status: string | null
          tier: number | null
          total_occurrences: number | null
          updated_at: string | null
          win_count: number | null
          win_rate: number | null
        }
        Insert: {
          avg_r?: number | null
          created_at?: string | null
          discovered_at?: string | null
          id?: string
          last_occurrence_at?: string | null
          loss_count?: number | null
          optional_signals?: Json | null
          pattern_id: string
          pattern_name: string
          performance_by_asset?: Json | null
          performance_by_regime?: Json | null
          performance_by_timeframe?: Json | null
          regime_filter?: string[] | null
          required_signals: Json
          status?: string | null
          tier?: number | null
          total_occurrences?: number | null
          updated_at?: string | null
          win_count?: number | null
          win_rate?: number | null
        }
        Update: {
          avg_r?: number | null
          created_at?: string | null
          discovered_at?: string | null
          id?: string
          last_occurrence_at?: string | null
          loss_count?: number | null
          optional_signals?: Json | null
          pattern_id?: string
          pattern_name?: string
          performance_by_asset?: Json | null
          performance_by_regime?: Json | null
          performance_by_timeframe?: Json | null
          regime_filter?: string[] | null
          required_signals?: Json
          status?: string | null
          tier?: number | null
          total_occurrences?: number | null
          updated_at?: string | null
          win_count?: number | null
          win_rate?: number | null
        }
        Relationships: []
      }
      pattern_signatures: {
        Row: {
          canonical_conditions_json: Json
          context_tags_json: Json
          created_ts: string
          id: string
          pattern_id: string
          signature_hash: string
        }
        Insert: {
          canonical_conditions_json?: Json
          context_tags_json?: Json
          created_ts?: string
          id?: string
          pattern_id: string
          signature_hash: string
        }
        Update: {
          canonical_conditions_json?: Json
          context_tags_json?: Json
          created_ts?: string
          id?: string
          pattern_id?: string
          signature_hash?: string
        }
        Relationships: []
      }
      pattern_tiers: {
        Row: {
          asset_id: string
          created_at: string
          decay_rate: number
          expired_at: string | null
          id: string
          last_check_ts: string
          pattern_id: string
          promoted_at: string | null
          regime_context: string
          tier: string
          validated_at: string | null
          validation_failures: number
          validation_passes: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          decay_rate?: number
          expired_at?: string | null
          id?: string
          last_check_ts?: string
          pattern_id: string
          promoted_at?: string | null
          regime_context?: string
          tier?: string
          validated_at?: string | null
          validation_failures?: number
          validation_passes?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          decay_rate?: number
          expired_at?: string | null
          id?: string
          last_check_ts?: string
          pattern_id?: string
          promoted_at?: string | null
          regime_context?: string
          tier?: string
          validated_at?: string | null
          validation_failures?: number
          validation_passes?: number
        }
        Relationships: [
          {
            foreignKeyName: "pattern_tiers_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "indicator_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      price_candles: {
        Row: {
          close: number
          high: number
          id: string
          low: number
          open: number
          symbol: string
          timeframe: string
          ts: string
          volume: number | null
        }
        Insert: {
          close: number
          high: number
          id?: string
          low: number
          open: number
          symbol: string
          timeframe: string
          ts: string
          volume?: number | null
        }
        Update: {
          close?: number
          high?: number
          id?: string
          low?: number
          open?: number
          symbol?: string
          timeframe?: string
          ts?: string
          volume?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      scenario_reputation: {
        Row: {
          alpha: number
          avg_pnl_usd: number | null
          beta: number
          credibility: number
          posterior_mean: number
          regime: string
          samples: number
          scenario_key: string
          sharpe_like: number | null
          symbol: string
          timeframe: string
          updated_at: string
          win_rate: number | null
        }
        Insert: {
          alpha?: number
          avg_pnl_usd?: number | null
          beta?: number
          credibility?: number
          posterior_mean?: number
          regime?: string
          samples?: number
          scenario_key: string
          sharpe_like?: number | null
          symbol?: string
          timeframe?: string
          updated_at?: string
          win_rate?: number | null
        }
        Update: {
          alpha?: number
          avg_pnl_usd?: number | null
          beta?: number
          credibility?: number
          posterior_mean?: number
          regime?: string
          samples?: number
          scenario_key?: string
          sharpe_like?: number | null
          symbol?: string
          timeframe?: string
          updated_at?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      system_status: {
        Row: {
          anomaly_halt: boolean
          asset_id: string
          created_at: string
          escalation_count: number
          id: string
          last_anomaly_check: string | null
          learning_frozen: boolean
          output_mode: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          anomaly_halt?: boolean
          asset_id?: string
          created_at?: string
          escalation_count?: number
          id?: string
          last_anomaly_check?: string | null
          learning_frozen?: boolean
          output_mode?: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          anomaly_halt?: boolean
          asset_id?: string
          created_at?: string
          escalation_count?: number
          id?: string
          last_anomaly_check?: string | null
          learning_frozen?: boolean
          output_mode?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      timeframe_stats: {
        Row: {
          asset_id: string
          calibration_error: number
          drift_flag: boolean
          ev_mean: number
          id: string
          last_updated_ts: string
          success_likelihood_score: number
          timeframe: string
          trades_n: number
          win_rate: number
          win_rate_recent: number
          wins_n: number
        }
        Insert: {
          asset_id: string
          calibration_error?: number
          drift_flag?: boolean
          ev_mean?: number
          id?: string
          last_updated_ts?: string
          success_likelihood_score?: number
          timeframe?: string
          trades_n?: number
          win_rate?: number
          win_rate_recent?: number
          wins_n?: number
        }
        Update: {
          asset_id?: string
          calibration_error?: number
          drift_flag?: boolean
          ev_mean?: number
          id?: string
          last_updated_ts?: string
          success_likelihood_score?: number
          timeframe?: string
          trades_n?: number
          win_rate?: number
          win_rate_recent?: number
          wins_n?: number
        }
        Relationships: []
      }
      trade_scenario_attribution: {
        Row: {
          contributed_confidence: number | null
          contributed_direction: string | null
          created_at: string
          decision_id: string | null
          id: string
          metadata: Json
          position_id: string
          regime: string | null
          scenario_key: string
          session_primary: string | null
          symbol: string
          timeframe: string | null
        }
        Insert: {
          contributed_confidence?: number | null
          contributed_direction?: string | null
          created_at?: string
          decision_id?: string | null
          id?: string
          metadata?: Json
          position_id: string
          regime?: string | null
          scenario_key: string
          session_primary?: string | null
          symbol: string
          timeframe?: string | null
        }
        Update: {
          contributed_confidence?: number | null
          contributed_direction?: string | null
          created_at?: string
          decision_id?: string | null
          id?: string
          metadata?: Json
          position_id?: string
          regime?: string | null
          scenario_key?: string
          session_primary?: string | null
          symbol?: string
          timeframe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_scenario_attribution_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "paper_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_scenario_attribution_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "paper_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_scenario_attribution_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_atlas_v3_trade_entry_context"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "trade_scenario_attribution_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_market_context_trade_outcome"
            referencedColumns: ["trade_id"]
          },
          {
            foreignKeyName: "trade_scenario_attribution_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "v_whale_trade_outcome_analysis"
            referencedColumns: ["trade_id"]
          },
        ]
      }
      transfer_priors: {
        Row: {
          atr_sizing_json: Json | null
          calibration_shape_json: Json | null
          contradiction_count: number
          created_at: string
          current_local_decisions: number
          discard_reason: string | null
          discarded: boolean
          donor_asset: string
          id: string
          initial_transfer_weight: number
          integrity_pass: boolean
          last_decay_at: string
          local_decisions_at_transfer: number
          regime_map_json: Json | null
          signal_weights_json: Json | null
          similarity_score: number
          target_asset: string
          timeframe: string
          transfer_weight: number
          updated_at: string
        }
        Insert: {
          atr_sizing_json?: Json | null
          calibration_shape_json?: Json | null
          contradiction_count?: number
          created_at?: string
          current_local_decisions?: number
          discard_reason?: string | null
          discarded?: boolean
          donor_asset: string
          id?: string
          initial_transfer_weight?: number
          integrity_pass?: boolean
          last_decay_at?: string
          local_decisions_at_transfer?: number
          regime_map_json?: Json | null
          signal_weights_json?: Json | null
          similarity_score?: number
          target_asset: string
          timeframe?: string
          transfer_weight?: number
          updated_at?: string
        }
        Update: {
          atr_sizing_json?: Json | null
          calibration_shape_json?: Json | null
          contradiction_count?: number
          created_at?: string
          current_local_decisions?: number
          discard_reason?: string | null
          discarded?: boolean
          donor_asset?: string
          id?: string
          initial_transfer_weight?: number
          integrity_pass?: boolean
          last_decay_at?: string
          local_decisions_at_transfer?: number
          regime_map_json?: Json | null
          signal_weights_json?: Json | null
          similarity_score?: number
          target_asset?: string
          timeframe?: string
          transfer_weight?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whale_context_snapshots: {
        Row: {
          created_at: string
          decision_id: string | null
          exchange_inflow_24h_count: number
          exchange_outflow_24h_count: number
          flow_bias_24h: number
          id: string
          large_trade_24h_count: number
          large_transfer_24h_count: number
          last_event_notional_usd: number | null
          last_event_severity: number | null
          last_event_source: string | null
          last_event_time: string | null
          last_event_type: string | null
          metadata: Json
          snapshot_time: string
          symbol: string
          trade_id: string | null
          volume_spike_24h_count: number
          window_1h_count: number
          window_1h_severity_sum: number
          window_24h_count: number
          window_24h_severity_sum: number
          window_6h_count: number
          window_6h_severity_sum: number
        }
        Insert: {
          created_at?: string
          decision_id?: string | null
          exchange_inflow_24h_count?: number
          exchange_outflow_24h_count?: number
          flow_bias_24h?: number
          id?: string
          large_trade_24h_count?: number
          large_transfer_24h_count?: number
          last_event_notional_usd?: number | null
          last_event_severity?: number | null
          last_event_source?: string | null
          last_event_time?: string | null
          last_event_type?: string | null
          metadata?: Json
          snapshot_time: string
          symbol: string
          trade_id?: string | null
          volume_spike_24h_count?: number
          window_1h_count?: number
          window_1h_severity_sum?: number
          window_24h_count?: number
          window_24h_severity_sum?: number
          window_6h_count?: number
          window_6h_severity_sum?: number
        }
        Update: {
          created_at?: string
          decision_id?: string | null
          exchange_inflow_24h_count?: number
          exchange_outflow_24h_count?: number
          flow_bias_24h?: number
          id?: string
          large_trade_24h_count?: number
          large_transfer_24h_count?: number
          last_event_notional_usd?: number | null
          last_event_severity?: number | null
          last_event_source?: string | null
          last_event_time?: string | null
          last_event_type?: string | null
          metadata?: Json
          snapshot_time?: string
          symbol?: string
          trade_id?: string | null
          volume_spike_24h_count?: number
          window_1h_count?: number
          window_1h_severity_sum?: number
          window_24h_count?: number
          window_24h_severity_sum?: number
          window_6h_count?: number
          window_6h_severity_sum?: number
        }
        Relationships: [
          {
            foreignKeyName: "whale_context_snapshots_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "atlas_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      whale_engine_runs: {
        Row: {
          engine: string
          error: string | null
          finished_at: string | null
          id: string
          metadata: Json
          signals_emitted: number
          started_at: string
          status: string
        }
        Insert: {
          engine: string
          error?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          signals_emitted?: number
          started_at?: string
          status?: string
        }
        Update: {
          engine?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          signals_emitted?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      whale_positions: {
        Row: {
          asset_id: string
          chain: string | null
          closed_at: string | null
          confidence: number | null
          created_at: string | null
          entry_price: number
          exit_price: number | null
          hold_time_hours: number | null
          id: string
          opened_at: string
          pnl_r: number | null
          pnl_usd: number | null
          side: string
          size_tokens: number | null
          size_usd: number
          source: string | null
          status: string
          tx_hash: string | null
          updated_at: string | null
          whale_wallet_id: string | null
        }
        Insert: {
          asset_id: string
          chain?: string | null
          closed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          entry_price: number
          exit_price?: number | null
          hold_time_hours?: number | null
          id?: string
          opened_at?: string
          pnl_r?: number | null
          pnl_usd?: number | null
          side: string
          size_tokens?: number | null
          size_usd: number
          source?: string | null
          status: string
          tx_hash?: string | null
          updated_at?: string | null
          whale_wallet_id?: string | null
        }
        Update: {
          asset_id?: string
          chain?: string | null
          closed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          entry_price?: number
          exit_price?: number | null
          hold_time_hours?: number | null
          id?: string
          opened_at?: string
          pnl_r?: number | null
          pnl_usd?: number | null
          side?: string
          size_tokens?: number | null
          size_usd?: number
          source?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string | null
          whale_wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whale_positions_whale_wallet_id_fkey"
            columns: ["whale_wallet_id"]
            isOneToOne: false
            referencedRelation: "whale_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      whale_positions_v2: {
        Row: {
          chain: string | null
          closed_at: string | null
          confidence: number
          created_at: string
          direction: string
          id: string
          metadata: Json
          opened_at: string
          symbol: string
          wallet_id: string | null
        }
        Insert: {
          chain?: string | null
          closed_at?: string | null
          confidence?: number
          created_at?: string
          direction: string
          id?: string
          metadata?: Json
          opened_at: string
          symbol: string
          wallet_id?: string | null
        }
        Update: {
          chain?: string | null
          closed_at?: string | null
          confidence?: number
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json
          opened_at?: string
          symbol?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whale_positions_v2_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "atlas_assets"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "whale_positions_v2_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "whale_wallets_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      whale_signals: {
        Row: {
          asset_id: string
          avg_whale_integrity: number
          avg_whale_win_rate: number
          computed_at: string
          confidence: number
          direction: string
          elite_whale_count: number
          id: string
          long_position_size_usd: number
          lookback_hours: number
          net_bias: number
          short_position_size_usd: number
          timeframe: string
          top_whales_json: Json | null
          total_position_size_usd: number
          whale_count: number
        }
        Insert: {
          asset_id: string
          avg_whale_integrity: number
          avg_whale_win_rate: number
          computed_at?: string
          confidence: number
          direction: string
          elite_whale_count: number
          id?: string
          long_position_size_usd: number
          lookback_hours: number
          net_bias: number
          short_position_size_usd: number
          timeframe: string
          top_whales_json?: Json | null
          total_position_size_usd: number
          whale_count: number
        }
        Update: {
          asset_id?: string
          avg_whale_integrity?: number
          avg_whale_win_rate?: number
          computed_at?: string
          confidence?: number
          direction?: string
          elite_whale_count?: number
          id?: string
          long_position_size_usd?: number
          lookback_hours?: number
          net_bias?: number
          short_position_size_usd?: number
          timeframe?: string
          top_whales_json?: Json | null
          total_position_size_usd?: number
          whale_count?: number
        }
        Relationships: []
      }
      whale_signals_v2: {
        Row: {
          chain: string | null
          created_at: string
          event_time: string
          from_entity: string | null
          id: string
          metadata: Json
          notional_usd: number
          observed_price: number | null
          severity: number
          signal_type: string
          source: string
          symbol: string
          to_entity: string | null
        }
        Insert: {
          chain?: string | null
          created_at?: string
          event_time: string
          from_entity?: string | null
          id?: string
          metadata?: Json
          notional_usd: number
          observed_price?: number | null
          severity?: number
          signal_type: string
          source: string
          symbol: string
          to_entity?: string | null
        }
        Update: {
          chain?: string | null
          created_at?: string
          event_time?: string
          from_entity?: string | null
          id?: string
          metadata?: Json
          notional_usd?: number
          observed_price?: number | null
          severity?: number
          signal_type?: string
          source?: string
          symbol?: string
          to_entity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whale_signals_v2_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "atlas_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      whale_wallets: {
        Row: {
          asset_id: string
          attribution_confidence: number
          avg_hold_time_hours: number | null
          avg_position_size_usd: number | null
          consistency_score: number | null
          created_at: string | null
          first_seen_at: string | null
          id: string
          integrity_score: number
          is_active: boolean | null
          is_elite: boolean | null
          last_30d_pnl: number | null
          last_30d_trade_count: number | null
          last_30d_win_rate: number | null
          last_evaluated_at: string | null
          last_trade_ts: string | null
          lot_win_rate: number
          realized_pnl_usd: number
          tier: number | null
          trade_count: number
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          asset_id: string
          attribution_confidence: number
          avg_hold_time_hours?: number | null
          avg_position_size_usd?: number | null
          consistency_score?: number | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          integrity_score: number
          is_active?: boolean | null
          is_elite?: boolean | null
          last_30d_pnl?: number | null
          last_30d_trade_count?: number | null
          last_30d_win_rate?: number | null
          last_evaluated_at?: string | null
          last_trade_ts?: string | null
          lot_win_rate: number
          realized_pnl_usd: number
          tier?: number | null
          trade_count: number
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          asset_id?: string
          attribution_confidence?: number
          avg_hold_time_hours?: number | null
          avg_position_size_usd?: number | null
          consistency_score?: number | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          integrity_score?: number
          is_active?: boolean | null
          is_elite?: boolean | null
          last_30d_pnl?: number | null
          last_30d_trade_count?: number | null
          last_30d_win_rate?: number | null
          last_evaluated_at?: string | null
          last_trade_ts?: string | null
          lot_win_rate?: number
          realized_pnl_usd?: number
          tier?: number | null
          trade_count?: number
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      whale_wallets_v2: {
        Row: {
          address: string
          chain: string
          created_at: string
          entity_type: string | null
          id: string
          label: string | null
          metadata: Json
          updated_at: string
        }
        Insert: {
          address: string
          chain: string
          created_at?: string
          entity_type?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          updated_at?: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          entity_type?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      whale_watch_events: {
        Row: {
          asset_id: string
          chain: string | null
          confidence: number | null
          created_at: string
          details_json: Json
          direction: string | null
          event_type: string
          id: string
          size_usd: number | null
          source: string
          tx_hash: string | null
          whale_wallet_id: string | null
        }
        Insert: {
          asset_id: string
          chain?: string | null
          confidence?: number | null
          created_at?: string
          details_json?: Json
          direction?: string | null
          event_type?: string
          id?: string
          size_usd?: number | null
          source?: string
          tx_hash?: string | null
          whale_wallet_id?: string | null
        }
        Update: {
          asset_id?: string
          chain?: string | null
          confidence?: number | null
          created_at?: string
          details_json?: Json
          direction?: string | null
          event_type?: string
          id?: string
          size_usd?: number | null
          source?: string
          tx_hash?: string | null
          whale_wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whale_watch_events_whale_wallet_id_fkey"
            columns: ["whale_wallet_id"]
            isOneToOne: false
            referencedRelation: "whale_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      paper_trades: {
        Row: {
          asset_id: string | null
          close_reason: string | null
          created_at: string | null
          decision_id: string | null
          duplicate_key: string | null
          entry_zone_high: number | null
          entry_zone_low: number | null
          evidence_snapshot_json: Json | null
          exit_price: number | null
          fill_price: number | null
          id: string | null
          initial_probability_pred: number | null
          initial_probability_source: string | null
          mae_r: number | null
          mfe_r: number | null
          outcome_label: string | null
          regime_label: string | null
          return_pct: number | null
          return_r: number | null
          scenario_type: string | null
          status: string | null
          stop_level: number | null
          stop_rule: string | null
          targets_json: Json | null
          time_window_end: string | null
          timeframe: string | null
          trigger_rule: string | null
          ts_closed: string | null
          ts_created: string | null
          ts_opened: string | null
        }
        Relationships: []
      }
      v_active_paper_policy: {
        Row: {
          allow_shorts: boolean | null
          created_at: string | null
          expiry_minutes_by_tf: Json | null
          fee_bps: number | null
          fill_fraction_max: number | null
          fill_fraction_min: number | null
          id: string | null
          is_active: boolean | null
          latency_ms: number | null
          max_open: number | null
          max_pending: number | null
          min_prob: number | null
          min_rr: number | null
          notes: string | null
          require_ev_positive: boolean | null
          slippage_bps: number | null
          updated_at: string | null
          version_tag: string | null
          worst_case_same_candle: boolean | null
        }
        Relationships: []
      }
      v_atlas_v3_trade_entry_context: {
        Row: {
          closed_at: string | null
          depth_concentration: number | null
          est_total_cost_bps: number | null
          funding_rate: number | null
          liquidity_thin: boolean | null
          ob_imbalance: number | null
          open_interest_change_24h: number | null
          open_interest_usd: number | null
          opened_at: string | null
          realized_pnl_usd: number | null
          rv_1h: number | null
          rv_24h: number | null
          session_primary: string | null
          spread_bps: number | null
          symbol: string | null
          trade_id: string | null
          vol_regime: string | null
          win: number | null
        }
        Relationships: []
      }
      v_market_context_trade_outcome: {
        Row: {
          closed_at: string | null
          depth_concentration: number | null
          ob_imbalance: number | null
          opened_at: string | null
          realized_pnl_usd: number | null
          rv_1h: number | null
          rv_24h: number | null
          session_detail: string | null
          session_primary: string | null
          spread_bps: number | null
          symbol: string | null
          trade_id: string | null
          vol_regime: string | null
          win: number | null
        }
        Relationships: []
      }
      v_paper_exposure: {
        Row: {
          open_positions: number | null
          pending_positions: number | null
        }
        Relationships: []
      }
      v_whale_trade_outcome_analysis: {
        Row: {
          closed_at: string | null
          exchange_inflow_24h_count: number | null
          exchange_outflow_24h_count: number | null
          flow_bias_24h: number | null
          last_event_notional_usd: number | null
          last_event_severity: number | null
          last_event_source: string | null
          last_event_time: string | null
          last_event_type: string | null
          opened_at: string | null
          realized_pnl: number | null
          symbol: string | null
          trade_id: string | null
          win: number | null
          window_1h_count: number | null
          window_24h_count: number | null
          window_24h_severity_sum: number | null
          window_6h_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      compute_transfer_decay: {
        Args: {
          current_local_decisions: number
          half_life?: number
          initial_weight: number
          local_decisions_at_transfer: number
        }
        Returns: number
      }
      cosine_similarity: { Args: { a: Json; b: Json }; Returns: number }
      find_similar_assets: {
        Args: { p_asset_id: string; p_threshold?: number; p_timeframe?: string }
        Returns: {
          asset_id: string
          graduation_level: number
          is_stable: boolean
          similarity: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      admin_msg_category: "maturity" | "warning" | "audit" | "manual"
      admin_msg_severity: "info" | "watch" | "important"
      admin_sender_type: "admin" | "atlas"
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_msg_category: ["maturity", "warning", "audit", "manual"],
      admin_msg_severity: ["info", "watch", "important"],
      admin_sender_type: ["admin", "atlas"],
      app_role: ["admin", "user"],
    },
  },
} as const
