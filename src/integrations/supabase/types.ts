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
            referencedRelation: "paper_trades"
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
      paper_decisions: {
        Row: {
          agreement_score: number
          asset_id: string
          completeness_score: number
          consensus_score: number
          correct: boolean | null
          created_at: string
          direction_pred: string
          evaluated_at: string | null
          evidence_snapshot_json: Json | null
          horizon: string
          id: string
          probability_pred: number
          realized_dir: string | null
          realized_move_pct: number | null
          ref_price: number
          timeframe: string
          ts: string
        }
        Insert: {
          agreement_score?: number
          asset_id: string
          completeness_score?: number
          consensus_score?: number
          correct?: boolean | null
          created_at?: string
          direction_pred: string
          evaluated_at?: string | null
          evidence_snapshot_json?: Json | null
          horizon?: string
          id?: string
          probability_pred: number
          realized_dir?: string | null
          realized_move_pct?: number | null
          ref_price: number
          timeframe?: string
          ts?: string
        }
        Update: {
          agreement_score?: number
          asset_id?: string
          completeness_score?: number
          consensus_score?: number
          correct?: boolean | null
          created_at?: string
          direction_pred?: string
          evaluated_at?: string | null
          evidence_snapshot_json?: Json | null
          horizon?: string
          id?: string
          probability_pred?: number
          realized_dir?: string | null
          realized_move_pct?: number | null
          ref_price?: number
          timeframe?: string
          ts?: string
        }
        Relationships: []
      }
      paper_trades: {
        Row: {
          asset_id: string
          created_at: string
          decision_id: string | null
          entry_zone_high: number
          entry_zone_low: number
          evidence_snapshot_json: Json | null
          exit_price: number | null
          fill_price: number | null
          id: string
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
          created_at?: string
          decision_id?: string | null
          entry_zone_high: number
          entry_zone_low: number
          evidence_snapshot_json?: Json | null
          exit_price?: number | null
          fill_price?: number | null
          id?: string
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
          created_at?: string
          decision_id?: string | null
          entry_zone_high?: number
          entry_zone_low?: number
          evidence_snapshot_json?: Json | null
          exit_price?: number | null
          fill_price?: number | null
          id?: string
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
    }
    Views: {
      [_ in never]: never
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
      app_role: ["admin", "user"],
    },
  },
} as const
