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
          avatar_url: string | null;
          created_at: string;
          first_name: string | null;
          last_name: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          first_name?: string | null;
          last_name?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          first_name?: string | null;
          last_name?: string | null;
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
      exercise_metric_type: "WEIGHTED_REPS" | "DURATION";
      split_type: "push" | "pull" | "legs" | "core";
      unit_type: "kg" | "lb";
    };
    CompositeTypes: Record<string, never>;
  };
};
