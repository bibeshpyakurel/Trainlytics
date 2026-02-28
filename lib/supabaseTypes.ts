export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      bodyweight_logs: {
        Row: {
          created_at: string;
          id: string;
          log_date: string;
          notes: string | null;
          unit_input: Database["public"]["Enums"]["unit_type"];
          user_id: string;
          weight_input: number;
          weight_kg: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          log_date: string;
          notes?: string | null;
          unit_input: Database["public"]["Enums"]["unit_type"];
          user_id: string;
          weight_input: number;
          weight_kg: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          log_date?: string;
          notes?: string | null;
          unit_input?: Database["public"]["Enums"]["unit_type"];
          user_id?: string;
          weight_input?: number;
          weight_kg?: number;
        };
        Relationships: [];
      };
      calories_logs: {
        Row: {
          created_at: string;
          id: string;
          log_date: string;
          post_workout_kcal: number | null;
          pre_workout_kcal: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          log_date: string;
          post_workout_kcal?: number | null;
          pre_workout_kcal?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          log_date?: string;
          post_workout_kcal?: number | null;
          pre_workout_kcal?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      daily_energy_metrics: {
        Row: {
          active_calories_kcal: number | null;
          bmi: number | null;
          calories_in_kcal: number | null;
          created_at: string;
          id: string;
          log_date: string;
          maintenance_kcal_for_day: number | null;
          net_calories_kcal: number | null;
          total_burn_kcal: number | null;
          updated_at: string;
          user_id: string;
          weight_kg: number | null;
        };
        Insert: {
          active_calories_kcal?: number | null;
          bmi?: number | null;
          calories_in_kcal?: number | null;
          created_at?: string;
          id?: string;
          log_date: string;
          maintenance_kcal_for_day?: number | null;
          net_calories_kcal?: number | null;
          total_burn_kcal?: number | null;
          updated_at?: string;
          user_id: string;
          weight_kg?: number | null;
        };
        Update: {
          active_calories_kcal?: number | null;
          bmi?: number | null;
          calories_in_kcal?: number | null;
          created_at?: string;
          id?: string;
          log_date?: string;
          maintenance_kcal_for_day?: number | null;
          net_calories_kcal?: number | null;
          total_burn_kcal?: number | null;
          updated_at?: string;
          user_id?: string;
          weight_kg?: number | null;
        };
        Relationships: [];
      };
      metabolic_activity_logs: {
        Row: {
          created_at: string;
          estimated_kcal_spent: number;
          id: string;
          log_date: string;
          source: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          estimated_kcal_spent: number;
          id?: string;
          log_date: string;
          source?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          estimated_kcal_spent?: number;
          id?: string;
          log_date?: string;
          source?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          metric_type: Database["public"]["Enums"]["exercise_metric_type"];
          muscle_group: string;
          name: string;
          sort_order: number;
          split: Database["public"]["Enums"]["split_type"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          metric_type?: Database["public"]["Enums"]["exercise_metric_type"];
          muscle_group: string;
          name: string;
          sort_order?: number;
          split: Database["public"]["Enums"]["split_type"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          metric_type?: Database["public"]["Enums"]["exercise_metric_type"];
          muscle_group?: string;
          name?: string;
          sort_order?: number;
          split?: Database["public"]["Enums"]["split_type"];
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          activity_level: Database["public"]["Enums"]["activity_level_type"] | null;
          avatar_url: string | null;
          birth_date: string | null;
          created_at: string;
          first_name: string | null;
          height_cm: number | null;
          last_name: string | null;
          maintenance_kcal_current: number | null;
          maintenance_method: Database["public"]["Enums"]["maintenance_method_type"] | null;
          maintenance_updated_at: string | null;
          sex: Database["public"]["Enums"]["profile_sex_type"] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          activity_level?: Database["public"]["Enums"]["activity_level_type"] | null;
          avatar_url?: string | null;
          birth_date?: string | null;
          created_at?: string;
          first_name?: string | null;
          height_cm?: number | null;
          last_name?: string | null;
          maintenance_kcal_current?: number | null;
          maintenance_method?: Database["public"]["Enums"]["maintenance_method_type"] | null;
          maintenance_updated_at?: string | null;
          sex?: Database["public"]["Enums"]["profile_sex_type"] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          activity_level?: Database["public"]["Enums"]["activity_level_type"] | null;
          avatar_url?: string | null;
          birth_date?: string | null;
          created_at?: string;
          first_name?: string | null;
          height_cm?: number | null;
          last_name?: string | null;
          maintenance_kcal_current?: number | null;
          maintenance_method?: Database["public"]["Enums"]["maintenance_method_type"] | null;
          maintenance_updated_at?: string | null;
          sex?: Database["public"]["Enums"]["profile_sex_type"] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          session_date: string;
          split: Database["public"]["Enums"]["split_type"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          session_date: string;
          split: Database["public"]["Enums"]["split_type"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          session_date?: string;
          split?: Database["public"]["Enums"]["split_type"];
          user_id?: string;
        };
        Relationships: [];
      };
      workout_sets: {
        Row: {
          created_at: string;
          duration_seconds: number | null;
          exercise_id: string;
          id: string;
          reps: number | null;
          session_id: string;
          set_number: number;
          unit_input: Database["public"]["Enums"]["unit_type"] | null;
          user_id: string;
          weight_input: number | null;
          weight_kg: number | null;
        };
        Insert: {
          created_at?: string;
          duration_seconds?: number | null;
          exercise_id: string;
          id?: string;
          reps?: number | null;
          session_id: string;
          set_number: number;
          unit_input?: Database["public"]["Enums"]["unit_type"] | null;
          user_id: string;
          weight_input?: number | null;
          weight_kg?: number | null;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number | null;
          exercise_id?: string;
          id?: string;
          reps?: number | null;
          session_id?: string;
          set_number?: number;
          unit_input?: Database["public"]["Enums"]["unit_type"] | null;
          user_id?: string;
          weight_input?: number | null;
          weight_kg?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      activity_level_type: "sedentary" | "light" | "moderate" | "very_active" | "extra_active";
      exercise_metric_type: "WEIGHTED_REPS" | "DURATION";
      maintenance_method_type: "mifflin_st_jeor_activity_multiplier";
      profile_sex_type: "male" | "female" | "other";
      split_type: "push" | "pull" | "legs" | "core";
      unit_type: "kg" | "lb";
    };
    CompositeTypes: Record<string, never>;
  };
};
