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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academy_courses: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_lessons: {
        Row: {
          attachment_url: string | null
          content: string | null
          course_id: string
          created_at: string
          id: string
          order_index: number
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          attachment_url?: string | null
          content?: string | null
          course_id: string
          created_at?: string
          id?: string
          order_index?: number
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          attachment_url?: string | null
          content?: string | null
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "academy_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_quiz_attempts: {
        Row: {
          answers: Json
          attempted_at: string
          id: string
          passed: boolean
          quiz_id: string
          score: number
          user_id: string
        }
        Insert: {
          answers: Json
          attempted_at?: string
          id?: string
          passed: boolean
          quiz_id: string
          score: number
          user_id: string
        }
        Update: {
          answers?: Json
          attempted_at?: string
          id?: string
          passed?: boolean
          quiz_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "academy_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_quiz_questions: {
        Row: {
          correct_value: number
          id: string
          options: Json
          order_index: number
          question_text: string
          quiz_id: string
        }
        Insert: {
          correct_value: number
          id?: string
          options: Json
          order_index?: number
          question_text: string
          quiz_id: string
        }
        Update: {
          correct_value?: number
          id?: string
          options?: Json
          order_index?: number
          question_text?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "academy_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_quizzes: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          passing_score: number
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          passing_score?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          passing_score?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_user_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          course_id: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          course_id: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          course_id?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_user_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "academy_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_user_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          condition_event_key: string | null
          condition_operator: string | null
          condition_value: number | null
          created_at: string
          description: string | null
          display_order: number
          enabled: boolean
          icon: string | null
          id: string
          key: string
          rule_type: string
          rule_value: number | null
          title_en: string | null
          title_fa: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          condition_event_key?: string | null
          condition_operator?: string | null
          condition_value?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          enabled?: boolean
          icon?: string | null
          id?: string
          key: string
          rule_type?: string
          rule_value?: number | null
          title_en?: string | null
          title_fa: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          condition_event_key?: string | null
          condition_operator?: string | null
          condition_value?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          enabled?: boolean
          icon?: string | null
          id?: string
          key?: string
          rule_type?: string
          rule_value?: number | null
          title_en?: string | null
          title_fa?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          content: string
          created_at: string
          group_id: string | null
          id: string
          model: string | null
          role: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id?: string | null
          id?: string
          model?: string | null
          role: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          model?: string | null
          role?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "messenger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generated_content: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          edited_content: string | null
          generated_variations: Json
          id: string
          input_data: Json
          selected_variation_index: number | null
          tool_type: string
          used_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          edited_content?: string | null
          generated_variations?: Json
          id?: string
          input_data?: Json
          selected_variation_index?: number | null
          tool_type: string
          used_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          edited_content?: string | null
          generated_variations?: Json
          id?: string
          input_data?: Json
          selected_variation_index?: number | null
          tool_type?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_content_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_content_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_content_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_content_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      appeal_reviewers: {
        Row: {
          appeal_id: string
          assigned_at: string
          id: string
          reviewer_id: string
          role: string
          vote: string | null
          vote_note: string | null
          voted_at: string | null
        }
        Insert: {
          appeal_id: string
          assigned_at?: string
          id?: string
          reviewer_id: string
          role: string
          vote?: string | null
          vote_note?: string | null
          voted_at?: string | null
        }
        Update: {
          appeal_id?: string
          assigned_at?: string
          id?: string
          reviewer_id?: string
          role?: string
          vote?: string | null
          vote_note?: string | null
          voted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appeal_reviewers_appeal_id_fkey"
            columns: ["appeal_id"]
            isOneToOne: false
            referencedRelation: "penalty_appeals"
            referencedColumns: ["id"]
          },
        ]
      }
      asan_export_numbers: {
        Row: {
          asan_number: number
          assigned_at: string
          assigned_by: string | null
          burned_at: string | null
          burned_reason: string | null
          doc_type: string
          id: string
          source_id: string
        }
        Insert: {
          asan_number: number
          assigned_at?: string
          assigned_by?: string | null
          burned_at?: string | null
          burned_reason?: string | null
          doc_type: string
          id?: string
          source_id: string
        }
        Update: {
          asan_number?: number
          assigned_at?: string
          assigned_by?: string | null
          burned_at?: string | null
          burned_reason?: string | null
          doc_type?: string
          id?: string
          source_id?: string
        }
        Relationships: []
      }
      asan_import_batches: {
        Row: {
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          kind: string
          row_count: number
          stats: Json
          status: string
        }
        Insert: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          kind: string
          row_count?: number
          stats?: Json
          status?: string
        }
        Update: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          row_count?: number
          stats?: Json
          status?: string
        }
        Relationships: []
      }
      asan_import_person_rows: {
        Row: {
          address: string | null
          apply_note: string | null
          applied_at: string | null
          asan_code: string | null
          batch_id: string
          classification: string
          conflict_reason: string | null
          decision: string
          display_name: string | null
          id: string
          landline_raw: string | null
          match_reason: string | null
          matched_person_id: string | null
          mobile_raw: string | null
          national_id_raw: string | null
          row_number: number
        }
        Insert: {
          address?: string | null
          apply_note?: string | null
          applied_at?: string | null
          asan_code?: string | null
          batch_id: string
          classification?: string
          conflict_reason?: string | null
          decision?: string
          display_name?: string | null
          id?: string
          landline_raw?: string | null
          match_reason?: string | null
          matched_person_id?: string | null
          mobile_raw?: string | null
          national_id_raw?: string | null
          row_number: number
        }
        Update: {
          address?: string | null
          apply_note?: string | null
          applied_at?: string | null
          asan_code?: string | null
          batch_id?: string
          classification?: string
          conflict_reason?: string | null
          decision?: string
          display_name?: string | null
          id?: string
          landline_raw?: string | null
          match_reason?: string | null
          matched_person_id?: string | null
          mobile_raw?: string | null
          national_id_raw?: string | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "asan_import_person_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "asan_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asan_import_person_rows_matched_person_id_fkey"
            columns: ["matched_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      asan_import_product_rows: {
        Row: {
          apply_note: string | null
          applied_at: string | null
          asan_code: string | null
          barcode_raw: string | null
          batch_id: string
          classification: string
          conflict_reason: string | null
          decision: string
          id: string
          match_reason: string | null
          matched_product_id: string | null
          name: string | null
          row_number: number
          serial_raw: string | null
          unit_raw: string | null
        }
        Insert: {
          apply_note?: string | null
          applied_at?: string | null
          asan_code?: string | null
          barcode_raw?: string | null
          batch_id: string
          classification?: string
          conflict_reason?: string | null
          decision?: string
          id?: string
          match_reason?: string | null
          matched_product_id?: string | null
          name?: string | null
          row_number: number
          serial_raw?: string | null
          unit_raw?: string | null
        }
        Update: {
          apply_note?: string | null
          applied_at?: string | null
          asan_code?: string | null
          barcode_raw?: string | null
          batch_id?: string
          classification?: string
          conflict_reason?: string | null
          decision?: string
          id?: string
          match_reason?: string | null
          matched_product_id?: string | null
          name?: string | null
          row_number?: number
          serial_raw?: string | null
          unit_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asan_import_product_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "asan_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asan_import_product_rows_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id: string
          entity_type: string
          id?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string
          entity_type?: string
          id?: number
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_no: string | null
          account_type: string
          accounting_code: string | null
          bank_name: string
          card_no: string | null
          created_at: string
          currency: string
          iban: string | null
          id: string
          is_active: boolean
          notes: string | null
          opening_balance: number
          title: string
          updated_at: string
        }
        Insert: {
          account_no?: string | null
          account_type?: string
          accounting_code?: string | null
          bank_name: string
          card_no?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          opening_balance?: number
          title: string
          updated_at?: string
        }
        Update: {
          account_no?: string | null
          account_type?: string
          accounting_code?: string | null
          bank_name?: string
          card_no?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          opening_balance?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_api_key_audit_log: {
        Row: {
          action: string
          id: string
          key_id: string | null
          key_name: string | null
          metadata: Json | null
          performed_at: string
          performed_by: string
          reason: string | null
        }
        Insert: {
          action: string
          id?: string
          key_id?: string | null
          key_name?: string | null
          metadata?: Json | null
          performed_at?: string
          performed_by: string
          reason?: string | null
        }
        Update: {
          action?: string
          id?: string
          key_id?: string | null
          key_name?: string | null
          metadata?: Json | null
          performed_at?: string
          performed_by?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_api_key_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_api_key_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_api_key_label_access: {
        Row: {
          api_key_id: string
          created_at: string
          label_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          label_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_api_key_label_access_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "bot_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_api_key_label_access_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "product_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_api_key_table_access: {
        Row: {
          allowed_update_columns: string[]
          api_key_id: string
          can_read: boolean
          can_update: boolean
          created_at: string
          id: string
          table_id: string
          updated_at: string
        }
        Insert: {
          allowed_update_columns?: string[]
          api_key_id: string
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          allowed_update_columns?: string[]
          api_key_id?: string
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_api_key_table_access_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "bot_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_api_key_table_access_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dynamic_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_api_keys: {
        Row: {
          allowed_table_ids: string[]
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string | null
          last_used_at: string | null
          managed_by_role: string | null
          name: string
        }
        Insert: {
          allowed_table_ids?: string[]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix?: string | null
          last_used_at?: string | null
          managed_by_role?: string | null
          name: string
        }
        Update: {
          allowed_table_ids?: string[]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string | null
          last_used_at?: string | null
          managed_by_role?: string | null
          name?: string
        }
        Relationships: []
      }
      bot_api_usage_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          error_code: string | null
          id: number
          ip: string | null
          method: string
          request_size: number | null
          response_count: number | null
          status_code: number
          table_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          error_code?: string | null
          id?: number
          ip?: string | null
          method: string
          request_size?: number | null
          response_count?: number | null
          status_code: number
          table_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          error_code?: string | null
          id?: number
          ip?: string | null
          method?: string
          request_size?: number | null
          response_count?: number | null
          status_code?: number
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_api_usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "bot_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          created_at: string
          customer_id: string | null
          direction: string
          duration_seconds: number
          employee_id: string
          ended_at: string | null
          external_id: string | null
          id: string
          metadata: Json
          source: string
          started_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          direction: string
          duration_seconds?: number
          employee_id: string
          ended_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          source?: string
          started_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          direction?: string
          duration_seconds?: number
          employee_id?: string
          ended_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          source?: string
          started_at?: string
        }
        Relationships: []
      }
      capital_allocation_ledger: {
        Row: {
          actor_id: string | null
          allocation_id: string
          allocation_kind: string
          amount: number
          consumed_after: number
          consumed_before: number
          created_at: string
          held_after: number
          held_before: number
          id: string
          metadata: Json
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
        }
        Insert: {
          actor_id?: string | null
          allocation_id: string
          allocation_kind: string
          amount: number
          consumed_after: number
          consumed_before: number
          created_at?: string
          held_after: number
          held_before: number
          id?: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
        }
        Update: {
          actor_id?: string | null
          allocation_id?: string
          allocation_kind?: string
          amount?: number
          consumed_after?: number
          consumed_before?: number
          created_at?: string
          held_after?: number
          held_before?: number
          id?: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          base_margin_percent: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          naming_template: string | null
          parent_id: string | null
          primary_spec_label: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          base_margin_percent?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          naming_template?: string | null
          parent_id?: string | null
          primary_spec_label?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          base_margin_percent?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          naming_template?: string | null
          parent_id?: string | null
          primary_spec_label?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_product_attributes: {
        Row: {
          attribute_key: string
          category_id: string
          created_at: string
          created_by: string | null
          help_text: string | null
          id: string
          input_type: string
          is_active: boolean
          is_required: boolean
          label_fa: string
          options: Json
          sort_order: number
          updated_at: string
          use_in_product_name: boolean
        }
        Insert: {
          attribute_key: string
          category_id: string
          created_at?: string
          created_by?: string | null
          help_text?: string | null
          id?: string
          input_type?: string
          is_active?: boolean
          is_required?: boolean
          label_fa: string
          options?: Json
          sort_order?: number
          updated_at?: string
          use_in_product_name?: boolean
        }
        Update: {
          attribute_key?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          help_text?: string | null
          id?: string
          input_type?: string
          is_active?: boolean
          is_required?: boolean
          label_fa?: string
          options?: Json
          sort_order?: number
          updated_at?: string
          use_in_product_name?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "category_product_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_requests: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          requested_amount: number
          requested_by: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          requested_amount: number
          requested_by?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          requested_amount?: number
          requested_by?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_score_snapshots: {
        Row: {
          calculated_at: string
          calculated_by: string | null
          credit_limit: number
          customer_id: string
          id: string
          params_used: Json
          score: number
        }
        Insert: {
          calculated_at?: string
          calculated_by?: string | null
          credit_limit?: number
          customer_id: string
          id?: string
          params_used?: Json
          score: number
        }
        Update: {
          calculated_at?: string
          calculated_by?: string | null
          credit_limit?: number
          customer_id?: string
          id?: string
          params_used?: Json
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_score_snapshots_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_score_snapshots_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_score_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_scoring_rules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          max_value: number | null
          min_value: number | null
          parameter_name: string
          score_formula: string | null
          updated_at: string
          weight: number
          window_months: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_value?: number | null
          min_value?: number | null
          parameter_name: string
          score_formula?: string | null
          updated_at?: string
          weight: number
          window_months?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_value?: number | null
          min_value?: number | null
          parameter_name?: string
          score_formula?: string | null
          updated_at?: string
          weight?: number
          window_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_scoring_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_scoring_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          symbol: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          symbol?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          symbol?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      currency_rate_fetches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          currency: string
          fetched_at: string
          fetched_by: string | null
          id: string
          note: string | null
          rate: number
          source_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          currency: string
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          note?: string | null
          rate: number
          source_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          currency?: string
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          note?: string | null
          rate?: number
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "currency_rate_fetches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_rate_fetches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_rate_fetches_fetched_by_fkey"
            columns: ["fetched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_rate_fetches_fetched_by_fkey"
            columns: ["fetched_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_rate_fetches_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "currency_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_rates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          effective_at: string
          fetch_source_id: string | null
          id: string
          is_active: boolean
          rate_to_toman: number
          source_name: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          effective_at?: string
          fetch_source_id?: string | null
          id?: string
          is_active?: boolean
          rate_to_toman: number
          source_name?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_at?: string
          fetch_source_id?: string | null
          id?: string
          is_active?: boolean
          rate_to_toman?: number
          source_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "currency_rates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_rates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_rates_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "currency_rates_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "effective_currencies_view"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "currency_rates_fetch_source_id_fkey"
            columns: ["fetch_source_id"]
            isOneToOne: false
            referencedRelation: "currency_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_sources: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          url: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_capital_allocations_dynamic: {
        Row: {
          binding_constraint: string | null
          capital_setting_id: string
          created_at: string
          customer_id: string
          final_limit: number | null
          id: string
          raw_allocation: number | null
          salesperson_id: string | null
          share_ratio: number | null
          weighted_score: number | null
        }
        Insert: {
          binding_constraint?: string | null
          capital_setting_id: string
          created_at?: string
          customer_id: string
          final_limit?: number | null
          id?: string
          raw_allocation?: number | null
          salesperson_id?: string | null
          share_ratio?: number | null
          weighted_score?: number | null
        }
        Update: {
          binding_constraint?: string | null
          capital_setting_id?: string
          created_at?: string
          customer_id?: string
          final_limit?: number | null
          id?: string
          raw_allocation?: number | null
          salesperson_id?: string | null
          share_ratio?: number | null
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_capital_allocations_dynamic_capital_setting_id_fkey"
            columns: ["capital_setting_id"]
            isOneToOne: false
            referencedRelation: "daily_capital_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_capital_allocations_dynamic_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_balance: {
        Row: {
          available_credit: number
          customer_id: string
          held_credit: number
          last_transaction_at: string | null
          updated_at: string
        }
        Insert: {
          available_credit?: number
          customer_id: string
          held_credit?: number
          last_transaction_at?: string | null
          updated_at?: string
        }
        Update: {
          available_credit?: number
          customer_id?: string
          held_credit?: number
          last_transaction_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_balance_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_ledger: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_profile: {
        Row: {
          created_at: string
          credit_limit: number
          credit_score: number
          customer_id: string
          has_overdue: boolean | null
          id: string
          is_active: boolean
          last_overdue_check_at: string | null
          last_purchase_date: string | null
          late_payments_count: number
          outstanding_balance: number
          overdue_since: string | null
          settlement_score: number | null
          total_paid: number
          total_purchases: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_limit?: number
          credit_score?: number
          customer_id: string
          has_overdue?: boolean | null
          id?: string
          is_active?: boolean
          last_overdue_check_at?: string | null
          last_purchase_date?: string | null
          late_payments_count?: number
          outstanding_balance?: number
          overdue_since?: string | null
          settlement_score?: number | null
          total_paid?: number
          total_purchases?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_limit?: number
          credit_score?: number
          customer_id?: string
          has_overdue?: boolean | null
          id?: string
          is_active?: boolean
          last_overdue_check_at?: string | null
          last_purchase_date?: string | null
          late_payments_count?: number
          outstanding_balance?: number
          overdue_since?: string | null
          settlement_score?: number | null
          total_paid?: number
          total_purchases?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          accounting_code: string | null
          address: string | null
          birth_date: string | null
          city: string | null
          created_at: string
          didar_contact_id: string | null
          email: string | null
          id: string
          is_active: boolean
          link_group: string | null
          name: string
          notes: string | null
          person_id: string | null
          phone: string | null
          responsible_id: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          accounting_code?: string | null
          address?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          didar_contact_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          link_group?: string | null
          name: string
          notes?: string | null
          person_id?: string | null
          phone?: string | null
          responsible_id?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          accounting_code?: string | null
          address?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          didar_contact_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          link_group?: string | null
          name?: string
          notes?: string | null
          person_id?: string | null
          phone?: string | null
          responsible_id?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_capital_inputs: {
        Row: {
          bank_balance: number
          blocked_funds: number
          capital_date: string
          cash_balance: number
          created_at: string
          created_by: string | null
          external_payables: number
          external_receivables: number
          id: string
          incoming_checks: number
          inventory_liquidity_value: number
          manual_adjustment: number
          near_term_expenses: number
          notes: string | null
          outgoing_checks: number
          risk_reserve: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_balance?: number
          blocked_funds?: number
          capital_date: string
          cash_balance?: number
          created_at?: string
          created_by?: string | null
          external_payables?: number
          external_receivables?: number
          id?: string
          incoming_checks?: number
          inventory_liquidity_value?: number
          manual_adjustment?: number
          near_term_expenses?: number
          notes?: string | null
          outgoing_checks?: number
          risk_reserve?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_balance?: number
          blocked_funds?: number
          capital_date?: string
          cash_balance?: number
          created_at?: string
          created_by?: string | null
          external_payables?: number
          external_receivables?: number
          id?: string
          incoming_checks?: number
          inventory_liquidity_value?: number
          manual_adjustment?: number
          near_term_expenses?: number
          notes?: string | null
          outgoing_checks?: number
          risk_reserve?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      daily_capital_settings: {
        Row: {
          capital_date: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          scoring_mode: string
          total_capital: number
          updated_at: string
        }
        Insert: {
          capital_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          scoring_mode?: string
          total_capital: number
          updated_at?: string
        }
        Update: {
          capital_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          scoring_mode?: string
          total_capital?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_capital_snapshots: {
        Row: {
          approved_by: string | null
          capital_date: string
          created_at: string
          created_by: string | null
          due_today_payables: number
          due_today_receivables: number
          final_capital: number
          formula_version: string
          future_payables: number
          future_receivables: number
          id: string
          input_id: string | null
          is_active: boolean
          overdue_payables: number
          overdue_receivables: number
          override_reason: string | null
          system_suggested_capital: number
          total_payables: number
          total_receivables: number
        }
        Insert: {
          approved_by?: string | null
          capital_date: string
          created_at?: string
          created_by?: string | null
          due_today_payables?: number
          due_today_receivables?: number
          final_capital?: number
          formula_version?: string
          future_payables?: number
          future_receivables?: number
          id?: string
          input_id?: string | null
          is_active?: boolean
          overdue_payables?: number
          overdue_receivables?: number
          override_reason?: string | null
          system_suggested_capital?: number
          total_payables?: number
          total_receivables?: number
        }
        Update: {
          approved_by?: string | null
          capital_date?: string
          created_at?: string
          created_by?: string | null
          due_today_payables?: number
          due_today_receivables?: number
          final_capital?: number
          formula_version?: string
          future_payables?: number
          future_receivables?: number
          id?: string
          input_id?: string | null
          is_active?: boolean
          overdue_payables?: number
          overdue_receivables?: number
          override_reason?: string | null
          system_suggested_capital?: number
          total_payables?: number
          total_receivables?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_capital_snapshots_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "daily_capital_inputs"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_mood_entries: {
        Row: {
          answers: Json
          created_at: string
          free_text: string | null
          hafez_poem_id: string | null
          hafez_saved: boolean
          id: string
          manager_note: string | null
          mood_date: string
          mood_key: string
          mood_label: string
          mood_score: number | null
          reasons: Json
          reviewed_at: string | null
          reviewed_by: string | null
          scenario_key: string | null
          status: string
          updated_at: string
          user_id: string
          visibility: string
          wants_follow_up: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          free_text?: string | null
          hafez_poem_id?: string | null
          hafez_saved?: boolean
          id?: string
          manager_note?: string | null
          mood_date?: string
          mood_key: string
          mood_label: string
          mood_score?: number | null
          reasons?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario_key?: string | null
          status?: string
          updated_at?: string
          user_id: string
          visibility?: string
          wants_follow_up?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          free_text?: string | null
          hafez_poem_id?: string | null
          hafez_saved?: boolean
          id?: string
          manager_note?: string | null
          mood_date?: string
          mood_key?: string
          mood_label?: string
          mood_score?: number | null
          reasons?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario_key?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          visibility?: string
          wants_follow_up?: string
        }
        Relationships: []
      }
      daily_mood_hafez_poems: {
        Row: {
          created_at: string
          id: string
          interpretation: string | null
          is_active: boolean
          poem_text: string
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          interpretation?: string | null
          is_active?: boolean
          poem_text: string
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          interpretation?: string | null
          is_active?: boolean
          poem_text?: string
          title?: string | null
        }
        Relationships: []
      }
      daily_mood_questions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          next_rules: Json
          options: Json
          question_key: string
          question_text: string
          question_type: string
          scenario_key: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          next_rules?: Json
          options?: Json
          question_key: string
          question_text: string
          question_type: string
          scenario_key: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          next_rules?: Json
          options?: Json
          question_key?: string
          question_text?: string
          question_type?: string
          scenario_key?: string
          sort_order?: number
        }
        Relationships: []
      }
      daily_mood_scenarios: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          mood_keys: string[]
          scenario_key: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          mood_keys: string[]
          scenario_key: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          mood_keys?: string[]
          scenario_key?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      dashboard_ticker_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          message_fa: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message_fa: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message_fa?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_ticker_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_ticker_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_receipt_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          note: string | null
          receipt_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          receipt_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          receipt_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_receipt_status_history_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "delivery_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_receipts: {
        Row: {
          created_at: string
          customer_id: string | null
          file_name: string
          file_size: number | null
          id: string
          invoice_id: string | null
          mime_type: string | null
          notes: string | null
          review_deadline: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          type: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          review_deadline: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          type: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          review_deadline?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          type?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_customer_receivables"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      didar_activities: {
        Row: {
          activity_type: string | null
          created_by_name: string | null
          customer_id: string | null
          description: string | null
          didar_id: string
          id: string
          imported_at: string
          occurred_at: string | null
          raw_data: Json | null
          subject: string | null
        }
        Insert: {
          activity_type?: string | null
          created_by_name?: string | null
          customer_id?: string | null
          description?: string | null
          didar_id: string
          id?: string
          imported_at?: string
          occurred_at?: string | null
          raw_data?: Json | null
          subject?: string | null
        }
        Update: {
          activity_type?: string | null
          created_by_name?: string | null
          customer_id?: string | null
          description?: string | null
          didar_id?: string
          id?: string
          imported_at?: string
          occurred_at?: string | null
          raw_data?: Json | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "didar_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      didar_import_log: {
        Row: {
          action: string | null
          didar_id: string
          entity_type: string
          error_message: string | null
          id: string
          imported_at: string
          raw_data: Json | null
        }
        Insert: {
          action?: string | null
          didar_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          imported_at?: string
          raw_data?: Json | null
        }
        Update: {
          action?: string | null
          didar_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          imported_at?: string
          raw_data?: Json | null
        }
        Relationships: []
      }
      document_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          document_id: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          document_id: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          document_id?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_status_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          reference_id: string | null
          reference_type: string | null
          review_deadline: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          type: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          review_deadline?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          type: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          review_deadline?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          type?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      dynamic_entity_scores: {
        Row: {
          actual_value: number | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          is_clipped: boolean
          note: string | null
          parameter_id: string
          period_month: string
          raw_score: number | null
          scored_at: string
          scored_by: string | null
          updated_at: string
        }
        Insert: {
          actual_value?: number | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          is_clipped?: boolean
          note?: string | null
          parameter_id: string
          period_month: string
          raw_score?: number | null
          scored_at?: string
          scored_by?: string | null
          updated_at?: string
        }
        Update: {
          actual_value?: number | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          is_clipped?: boolean
          note?: string | null
          parameter_id?: string
          period_month?: string
          raw_score?: number | null
          scored_at?: string
          scored_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_entity_scores_parameter_id_fkey"
            columns: ["parameter_id"]
            isOneToOne: false
            referencedRelation: "dynamic_scoring_parameters"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_parameter_weights: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          parameter_id: string
          valid_from: string
          valid_to: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          parameter_id: string
          valid_from?: string
          valid_to?: string | null
          weight: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          parameter_id?: string
          valid_from?: string
          valid_to?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_parameter_weights_parameter_id_fkey"
            columns: ["parameter_id"]
            isOneToOne: false
            referencedRelation: "dynamic_scoring_parameters"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_scoring_parameters: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          direction: string
          display_order: number
          entity_type: string
          id: string
          input_hint: string | null
          input_type: string
          is_active: boolean
          label_fa: string
          max_value: number
          min_value: number
          unit_label: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          direction?: string
          display_order?: number
          entity_type: string
          id?: string
          input_hint?: string | null
          input_type?: string
          is_active?: boolean
          label_fa: string
          max_value?: number
          min_value?: number
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          display_order?: number
          entity_type?: string
          id?: string
          input_hint?: string | null
          input_type?: string
          is_active?: boolean
          label_fa?: string
          max_value?: number
          min_value?: number
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dynamic_table_cells: {
        Row: {
          column_id: string
          id: string
          row_id: string
          table_id: string
          updated_at: string
          value_boolean: boolean | null
          value_date: string | null
          value_datetime: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          column_id: string
          id?: string
          row_id: string
          table_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_datetime?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          column_id?: string
          id?: string
          row_id?: string
          table_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_datetime?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_table_cells_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "dynamic_table_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dynamic_table_cells_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "dynamic_table_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dynamic_table_cells_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dynamic_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_table_columns: {
        Row: {
          column_key: string
          created_at: string
          data_type: Database["public"]["Enums"]["dynamic_column_data_type"]
          formula_config: Json
          formula_key: string | null
          id: string
          is_computed: boolean
          is_editable_by_bot: boolean
          is_filterable: boolean
          is_required: boolean
          label: string
          sort_order: number
          table_id: string
        }
        Insert: {
          column_key: string
          created_at?: string
          data_type: Database["public"]["Enums"]["dynamic_column_data_type"]
          formula_config?: Json
          formula_key?: string | null
          id?: string
          is_computed?: boolean
          is_editable_by_bot?: boolean
          is_filterable?: boolean
          is_required?: boolean
          label: string
          sort_order?: number
          table_id: string
        }
        Update: {
          column_key?: string
          created_at?: string
          data_type?: Database["public"]["Enums"]["dynamic_column_data_type"]
          formula_config?: Json
          formula_key?: string | null
          id?: string
          is_computed?: boolean
          is_editable_by_bot?: boolean
          is_filterable?: boolean
          is_required?: boolean
          label?: string
          sort_order?: number
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_table_columns_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dynamic_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_table_row_counters: {
        Row: {
          last_value: number
          table_id: string
          updated_at: string
        }
        Insert: {
          last_value?: number
          table_id: string
          updated_at?: string
        }
        Update: {
          last_value?: number
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_table_row_counters_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "dynamic_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_table_rows: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          row_number: number
          table_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          row_number: number
          table_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          row_number?: number
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_table_rows_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dynamic_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_tables: {
        Row: {
          access_level: string
          allowed_roles: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          allowed_roles?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          allowed_roles?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          employee_id: string
          id: string
          source_event_count: number | null
          source_event_type: string | null
          unlocked_at: string
          xp_awarded: number
        }
        Insert: {
          achievement_id: string
          created_at?: string
          employee_id: string
          id?: string
          source_event_count?: number | null
          source_event_type?: string | null
          unlocked_at?: string
          xp_awarded?: number
        }
        Update: {
          achievement_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          source_event_count?: number | null
          source_event_type?: string | null
          unlocked_at?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_achievements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_achievements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leagues: {
        Row: {
          created_at: string
          demoted: boolean
          employee_id: string
          id: string
          league: Database["public"]["Enums"]["league_tier"]
          promoted: boolean
          rank: number | null
          score: number
          season_id: string
        }
        Insert: {
          created_at?: string
          demoted?: boolean
          employee_id: string
          id?: string
          league?: Database["public"]["Enums"]["league_tier"]
          promoted?: boolean
          rank?: number | null
          score?: number
          season_id: string
        }
        Update: {
          created_at?: string
          demoted?: boolean
          employee_id?: string
          id?: string
          league?: Database["public"]["Enums"]["league_tier"]
          promoted?: boolean
          rank?: number | null
          score?: number
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leagues_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leagues_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leagues_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_level_up_events: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          new_level: number
          old_level: number
          xp_total: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          new_level: number
          old_level: number
          xp_total: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          new_level?: number
          old_level?: number
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_level_up_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_level_up_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_mission_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          current_value: number
          employee_id: string
          id: string
          mission_id: string
          period_end: string | null
          period_key: string
          period_start: string | null
          progress: number
          source_event_type: string | null
          target_value: number | null
          updated_at: string
          xp_awarded: number
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_value?: number
          employee_id: string
          id?: string
          mission_id: string
          period_end?: string | null
          period_key: string
          period_start?: string | null
          progress?: number
          source_event_type?: string | null
          target_value?: number | null
          updated_at?: string
          xp_awarded?: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          current_value?: number
          employee_id?: string
          id?: string
          mission_id?: string
          period_end?: string | null
          period_key?: string
          period_start?: string | null
          progress?: number
          source_event_type?: string | null
          target_value?: number | null
          updated_at?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_mission_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_mission_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_mission_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_profiles: {
        Row: {
          bio: string | null
          created_at: string
          department: string | null
          direct_manager_id: string | null
          employment_start_date: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          department?: string | null
          direct_manager_id?: string | null
          employment_start_date?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          department?: string | null
          direct_manager_id?: string | null
          employment_start_date?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_profiles_direct_manager_id_fkey"
            columns: ["direct_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_profiles_direct_manager_id_fkey"
            columns: ["direct_manager_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_progress: {
        Row: {
          created_at: string
          employee_id: string
          last_level_up: string | null
          last_score_converted: number
          level: number
          updated_at: string
          xp_current: number
          xp_next_level: number
          xp_total: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          last_level_up?: string | null
          last_score_converted?: number
          level?: number
          updated_at?: string
          xp_current?: number
          xp_next_level?: number
          xp_total?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          last_level_up?: string | null
          last_score_converted?: number
          level?: number
          updated_at?: string
          xp_current?: number
          xp_next_level?: number
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_score_events: {
        Row: {
          employee_id: string
          event_type: string
          id: number
          payload: Json | null
          source_id: string | null
          source_table: string | null
          triggered_at: string
        }
        Insert: {
          employee_id: string
          event_type: string
          id?: number
          payload?: Json | null
          source_id?: string | null
          source_table?: string | null
          triggered_at?: string
        }
        Update: {
          employee_id?: string
          event_type?: string
          id?: number
          payload?: Json | null
          source_id?: string | null
          source_table?: string | null
          triggered_at?: string
        }
        Relationships: []
      }
      employee_scores: {
        Row: {
          active_work_minutes: number
          breakdown: Json
          created_at: string
          daily_score: number
          employee_id: string
          last_calculated_at: string
          monthly_score: number
          normalized_score: number
          previous_rank: number | null
          rank: number | null
          total_score: number
          updated_at: string
          weekly_score: number
        }
        Insert: {
          active_work_minutes?: number
          breakdown?: Json
          created_at?: string
          daily_score?: number
          employee_id: string
          last_calculated_at?: string
          monthly_score?: number
          normalized_score?: number
          previous_rank?: number | null
          rank?: number | null
          total_score?: number
          updated_at?: string
          weekly_score?: number
        }
        Update: {
          active_work_minutes?: number
          breakdown?: Json
          created_at?: string
          daily_score?: number
          employee_id?: string
          last_calculated_at?: string
          monthly_score?: number
          normalized_score?: number
          previous_rank?: number | null
          rank?: number | null
          total_score?: number
          updated_at?: string
          weekly_score?: number
        }
        Relationships: []
      }
      employee_streaks: {
        Row: {
          best_count: number
          current_count: number
          employee_id: string
          id: string
          last_event_date: string | null
          streak_type: string
          updated_at: string
        }
        Insert: {
          best_count?: number
          current_count?: number
          employee_id: string
          id?: string
          last_event_date?: string | null
          streak_type: string
          updated_at?: string
        }
        Update: {
          best_count?: number
          current_count?: number
          employee_id?: string
          id?: string
          last_event_date?: string | null
          streak_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_streaks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_streaks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      external_parties: {
        Row: {
          accounting_code: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          national_id: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          accounting_code?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          accounting_code?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          category: string | null
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: []
      }
      feedback_items: {
        Row: {
          assigned_to: string | null
          attachment_urls: Json
          converted_task_id: string | null
          created_at: string
          description: string
          id: string
          impact: string | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          status: string
          submitted_by: string
          suggestion: string | null
          title: string
          type: string
          updated_at: string
          where_occurred: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachment_urls?: Json
          converted_task_id?: string | null
          created_at?: string
          description: string
          id?: string
          impact?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string
          submitted_by: string
          suggestion?: string | null
          title: string
          type: string
          updated_at?: string
          where_occurred?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachment_urls?: Json
          converted_task_id?: string | null
          created_at?: string
          description?: string
          id?: string
          impact?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string
          submitted_by?: string
          suggestion?: string | null
          title?: string
          type?: string
          updated_at?: string
          where_occurred?: string | null
        }
        Relationships: []
      }
      gamification_kpi_rules: {
        Row: {
          created_at: string
          description: string | null
          event_key: string
          id: string
          is_active: boolean
          sort_order: number
          title_en: string | null
          title_fa: string
          updated_at: string
          xp_amount: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_key: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title_en?: string | null
          title_fa: string
          updated_at?: string
          xp_amount?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          event_key?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title_en?: string | null
          title_fa?: string
          updated_at?: string
          xp_amount?: number
        }
        Relationships: []
      }
      gamification_kpis: {
        Row: {
          created_at: string
          description: string | null
          direction: string
          display_order: number
          enabled: boolean
          id: string
          key: string
          label_fa: string
          source: string
          team_scope: string
          unit: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          direction?: string
          display_order?: number
          enabled?: boolean
          id?: string
          key: string
          label_fa: string
          source?: string
          team_scope?: string
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          direction?: string
          display_order?: number
          enabled?: boolean
          id?: string
          key?: string
          label_fa?: string
          source?: string
          team_scope?: string
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      gamification_rewards: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          enabled: boolean
          id: string
          is_active: boolean
          key: string
          notes: string | null
          requires_manual_approval: boolean
          reward_type: string
          reward_unit: string
          reward_value: number | null
          sort_order: number
          title_en: string | null
          title_fa: string
          trigger_ref_id: string | null
          trigger_type: string
          trigger_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          enabled?: boolean
          id?: string
          is_active?: boolean
          key: string
          notes?: string | null
          requires_manual_approval?: boolean
          reward_type: string
          reward_unit?: string
          reward_value?: number | null
          sort_order?: number
          title_en?: string | null
          title_fa: string
          trigger_ref_id?: string | null
          trigger_type: string
          trigger_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          enabled?: boolean
          id?: string
          is_active?: boolean
          key?: string
          notes?: string | null
          requires_manual_approval?: boolean
          reward_type?: string
          reward_unit?: string
          reward_value?: number | null
          sort_order?: number
          title_en?: string | null
          title_fa?: string
          trigger_ref_id?: string | null
          trigger_type?: string
          trigger_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          answered_at: string | null
          assigned_to: string
          closed_at: string | null
          created_at: string
          group_id: string
          id: string
          message_id: string | null
          product_id: string
          requested_by: string
          status: Database["public"]["Enums"]["inquiry_status"]
        }
        Insert: {
          answered_at?: string | null
          assigned_to: string
          closed_at?: string | null
          created_at?: string
          group_id: string
          id?: string
          message_id?: string | null
          product_id: string
          requested_by: string
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Update: {
          answered_at?: string | null
          assigned_to?: string
          closed_at?: string | null
          created_at?: string
          group_id?: string
          id?: string
          message_id?: string | null
          product_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "messenger_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messenger_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inquiry_price_cache: {
        Row: {
          created_at: string
          created_by: string
          id: string
          price: number
          product_id: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          price: number
          product_id: string
          valid_until: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          price?: number
          product_id?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_price_cache_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_price_cache_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inquiry_replies: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string
          is_valid: boolean
          note: string | null
          price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id: string
          is_valid?: boolean
          note?: string | null
          price: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string
          is_valid?: boolean
          note?: string | null
          price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_replies_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["inquiry_status"] | null
          id: string
          inquiry_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["inquiry_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["inquiry_status"] | null
          id?: string
          inquiry_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["inquiry_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["inquiry_status"] | null
          id?: string
          inquiry_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_status_history_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_transfers: {
        Row: {
          from_user: string
          id: string
          inquiry_id: string
          to_user: string
          transferred_at: string
        }
        Insert: {
          from_user: string
          id?: string
          inquiry_id: string
          to_user: string
          transferred_at?: string
        }
        Update: {
          from_user?: string
          id?: string
          inquiry_id?: string
          to_user?: string
          transferred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_transfers_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          discount: number
          id: string
          invoice_id: string
          line_total: number
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          discount?: number
          id?: string
          invoice_id: string
          line_total: number
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          discount?: number
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_customer_receivables"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      invoice_workflow_stages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          order_index?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          accounting_registered_at: string | null
          accounting_registered_by: string | null
          accounting_sent_at: string | null
          accounting_sent_by: string | null
          actual_settlement_date: string | null
          commitment_confirmed: boolean
          created_at: string
          created_by: string | null
          customer_id: string | null
          deposit_amount: number | null
          discount_amount: number
          due_date: string | null
          expected_settlement_date: string | null
          id: string
          invoice_type: string
          issue_date: string
          issued_by: string | null
          notes: string | null
          number: string | null
          product_video_required: boolean
          sale_price_type_id: string | null
          settled_amount: number | null
          settlement_days: number | null
          settlement_due_date: string | null
          settlement_type_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          accounting_registered_at?: string | null
          accounting_registered_by?: string | null
          accounting_sent_at?: string | null
          accounting_sent_by?: string | null
          actual_settlement_date?: string | null
          commitment_confirmed?: boolean
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          discount_amount?: number
          due_date?: string | null
          expected_settlement_date?: string | null
          id?: string
          invoice_type?: string
          issue_date?: string
          issued_by?: string | null
          notes?: string | null
          number?: string | null
          product_video_required?: boolean
          sale_price_type_id?: string | null
          settled_amount?: number | null
          settlement_days?: number | null
          settlement_due_date?: string | null
          settlement_type_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Update: {
          accounting_registered_at?: string | null
          accounting_registered_by?: string | null
          accounting_sent_at?: string | null
          accounting_sent_by?: string | null
          actual_settlement_date?: string | null
          commitment_confirmed?: boolean
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          discount_amount?: number
          due_date?: string | null
          expected_settlement_date?: string | null
          id?: string
          invoice_type?: string
          issue_date?: string
          issued_by?: string | null
          notes?: string | null
          number?: string | null
          product_video_required?: boolean
          sale_price_type_id?: string | null
          settled_amount?: number | null
          settlement_days?: number | null
          settlement_due_date?: string | null
          settlement_type_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_settlement_type_id_fkey"
            columns: ["settlement_type_id"]
            isOneToOne: false
            referencedRelation: "settlement_types"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          description: string | null
          entry_date: string
          id: string
          payer_accounting_code: string | null
          posted_at: string
          posted_by: string | null
          receiver_accounting_code: string | null
          source_id: string
          source_type: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          payer_accounting_code?: string | null
          posted_at?: string
          posted_by?: string | null
          receiver_accounting_code?: string | null
          source_id: string
          source_type: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          payer_accounting_code?: string | null
          posted_at?: string
          posted_by?: string | null
          receiver_accounting_code?: string | null
          source_id?: string
          source_type?: string
          status?: string
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account_kind: string
          account_ref_id: string | null
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          line_no: number
        }
        Insert: {
          account_kind: string
          account_ref_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          line_no: number
        }
        Update: {
          account_kind?: string
          account_ref_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          line_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          author_id: string | null
          category: string | null
          content: string | null
          created_at: string
          id: string
          is_published: boolean
          slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_confirmations: {
        Row: {
          confirmed_at: string
          document_id: string
          id: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string
          document_id: string
          id?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string
          document_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_confirmations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_confirmations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_confirmations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          access_level: string
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          access_level?: string
          category: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          access_level?: string
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      league_seasons: {
        Row: {
          created_at: string
          end_date: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          season_name: string | null
          settled_at: string | null
          start_date: string | null
          starts_at: string | null
          status: string
          title_en: string | null
          title_fa: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          season_name?: string | null
          settled_at?: string | null
          start_date?: string | null
          starts_at?: string | null
          status?: string
          title_en?: string | null
          title_fa?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          season_name?: string | null
          settled_at?: string | null
          start_date?: string | null
          starts_at?: string | null
          status?: string
          title_en?: string | null
          title_fa?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      league_settings: {
        Row: {
          created_at: string
          demotion_percent: number
          id: string
          is_active: boolean
          min_level: number
          min_xp: number
          promotion_percent: number
          season_duration_days: number | null
          sort_order: number
          tier: Database["public"]["Enums"]["league_tier"] | null
          title_en: string | null
          title_fa: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          demotion_percent?: number
          id?: string
          is_active?: boolean
          min_level?: number
          min_xp?: number
          promotion_percent?: number
          season_duration_days?: number | null
          sort_order?: number
          tier?: Database["public"]["Enums"]["league_tier"] | null
          title_en?: string | null
          title_fa?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          demotion_percent?: number
          id?: string
          is_active?: boolean
          min_level?: number
          min_xp?: number
          promotion_percent?: number
          season_duration_days?: number | null
          sort_order?: number
          tier?: Database["public"]["Enums"]["league_tier"] | null
          title_en?: string | null
          title_fa?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      market_indicators: {
        Row: {
          category: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          rate_type: string | null
          sort_order: number
          title_en: string | null
          title_fa: string
          unit: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          rate_type?: string | null
          sort_order?: number
          title_en?: string | null
          title_fa: string
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          rate_type?: string | null
          sort_order?: number
          title_en?: string | null
          title_fa?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_product_match_events: {
        Row: {
          actor: Database["public"]["Enums"]["market_match_actor"]
          actor_user_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          match_id: string
          new_status: Database["public"]["Enums"]["market_match_status"] | null
          old_status: Database["public"]["Enums"]["market_match_status"] | null
        }
        Insert: {
          actor?: Database["public"]["Enums"]["market_match_actor"]
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          match_id: string
          new_status?: Database["public"]["Enums"]["market_match_status"] | null
          old_status?: Database["public"]["Enums"]["market_match_status"] | null
        }
        Update: {
          actor?: Database["public"]["Enums"]["market_match_actor"]
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          match_id?: string
          new_status?: Database["public"]["Enums"]["market_match_status"] | null
          old_status?: Database["public"]["Enums"]["market_match_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "market_product_match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "market_product_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      market_product_matches: {
        Row: {
          afrakala_product_id: string | null
          afrakala_product_name_snapshot: string | null
          confidence_score: number | null
          created_at: string
          id: string
          last_seen_at: string | null
          match_status: Database["public"]["Enums"]["market_match_status"]
          matched_by: Database["public"]["Enums"]["market_match_actor"]
          normalized_source_title: string | null
          notes: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_name: Database["public"]["Enums"]["market_match_source"]
          source_product_id: string | null
          source_product_url: string | null
          source_title: string
          updated_at: string
        }
        Insert: {
          afrakala_product_id?: string | null
          afrakala_product_name_snapshot?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          match_status?: Database["public"]["Enums"]["market_match_status"]
          matched_by?: Database["public"]["Enums"]["market_match_actor"]
          normalized_source_title?: string | null
          notes?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name: Database["public"]["Enums"]["market_match_source"]
          source_product_id?: string | null
          source_product_url?: string | null
          source_title: string
          updated_at?: string
        }
        Update: {
          afrakala_product_id?: string | null
          afrakala_product_name_snapshot?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          match_status?: Database["public"]["Enums"]["market_match_status"]
          matched_by?: Database["public"]["Enums"]["market_match_actor"]
          normalized_source_title?: string | null
          notes?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_name?: Database["public"]["Enums"]["market_match_source"]
          source_product_id?: string | null
          source_product_url?: string | null
          source_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_product_matches_afrakala_product_id_fkey"
            columns: ["afrakala_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_product_matches_afrakala_product_id_fkey"
            columns: ["afrakala_product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      market_rate_ingestion_runs: {
        Row: {
          error_message: string | null
          fetched_count: number
          finished_at: string | null
          id: string
          inserted_count: number
          source_code: string
          source_id: string | null
          started_at: string
          started_by: string | null
          status: string
          suspect_count: number
        }
        Insert: {
          error_message?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          source_code: string
          source_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          suspect_count?: number
        }
        Update: {
          error_message?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          source_code?: string
          source_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          suspect_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_rate_ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "market_rate_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      market_rate_source_mappings: {
        Row: {
          created_at: string
          id: string
          indicator_id: string
          is_enabled: boolean
          normalize_multiplier: number
          note: string | null
          source_id: string
          source_symbol: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_id: string
          is_enabled?: boolean
          normalize_multiplier?: number
          note?: string | null
          source_id: string
          source_symbol: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          indicator_id?: string
          is_enabled?: boolean
          normalize_multiplier?: number
          note?: string | null
          source_id?: string
          source_symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_rate_source_mappings_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "market_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_rate_source_mappings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "market_rate_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      market_rate_sources: {
        Row: {
          base_url: string | null
          code: string
          confidence_weight: number
          created_at: string
          fetch_interval_seconds: number | null
          id: string
          is_enabled: boolean
          requires_api_key: boolean
          source_type: string
          title_fa: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          code: string
          confidence_weight?: number
          created_at?: string
          fetch_interval_seconds?: number | null
          id?: string
          is_enabled?: boolean
          requires_api_key?: boolean
          source_type: string
          title_fa: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          code?: string
          confidence_weight?: number
          created_at?: string
          fetch_interval_seconds?: number | null
          id?: string
          is_enabled?: boolean
          requires_api_key?: boolean
          source_type?: string
          title_fa?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_rate_ticks: {
        Row: {
          change_amount: number | null
          change_percent: number | null
          confidence_score: number | null
          created_at: string
          created_by: string | null
          id: string
          indicator_id: string
          jalali_date_label: string | null
          note: string | null
          observed_at: string
          raw_payload: Json | null
          source_id: string
          source_reported_at: string | null
          status: string
          unit: string
          value: number
        }
        Insert: {
          change_amount?: number | null
          change_percent?: number | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          indicator_id: string
          jalali_date_label?: string | null
          note?: string | null
          observed_at?: string
          raw_payload?: Json | null
          source_id: string
          source_reported_at?: string | null
          status?: string
          unit?: string
          value: number
        }
        Update: {
          change_amount?: number | null
          change_percent?: number | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          indicator_id?: string
          jalali_date_label?: string | null
          note?: string | null
          observed_at?: string
          raw_payload?: Json | null
          source_id?: string
          source_reported_at?: string | null
          status?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_rate_ticks_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "market_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_rate_ticks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "market_rate_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_channels: {
        Row: {
          created_at: string
          daily_quota: number | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          daily_quota?: number | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          daily_quota?: number | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      message_embeddings: {
        Row: {
          content_excerpt: string | null
          created_at: string
          embedding: string
          group_id: string
          message_id: string
          model_version: string | null
        }
        Insert: {
          content_excerpt?: string | null
          created_at?: string
          embedding: string
          group_id: string
          message_id: string
          model_version?: string | null
        }
        Update: {
          content_excerpt?: string | null
          created_at?: string
          embedding?: string
          group_id?: string
          message_id?: string
          model_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_embeddings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "messenger_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_embeddings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messenger_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          recipient_id: string
          sender_id: string
          subject: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id: string
          sender_id: string
          subject?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id?: string
          sender_id?: string
          subject?: string | null
        }
        Relationships: []
      }
      messenger_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messenger_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messenger_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messenger_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messenger_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "messenger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      messenger_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: string
        }
        Relationships: []
      }
      messenger_messages: {
        Row: {
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          group_id: string
          id: string
          reply_to: string | null
          sender_id: string | null
          type: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          group_id: string
          id?: string
          reply_to?: string | null
          sender_id?: string | null
          type?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          group_id?: string
          id?: string
          reply_to?: string | null
          sender_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messenger_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "messenger_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messenger_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messenger_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messenger_read_receipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messenger_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messenger_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          condition_event_key: string | null
          condition_operator: string | null
          condition_value: number | null
          created_at: string
          description: string | null
          display_order: number
          enabled: boolean
          ends_at: string | null
          frequency: string
          id: string
          key: string
          mission_type: string
          repeat_rule: string
          sort_order: number
          starts_at: string | null
          target_value: number
          title_en: string | null
          title_fa: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          condition_event_key?: string | null
          condition_operator?: string | null
          condition_value?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          enabled?: boolean
          ends_at?: string | null
          frequency?: string
          id?: string
          key: string
          mission_type?: string
          repeat_rule?: string
          sort_order?: number
          starts_at?: string | null
          target_value?: number
          title_en?: string | null
          title_fa: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          condition_event_key?: string | null
          condition_operator?: string | null
          condition_value?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          enabled?: boolean
          ends_at?: string | null
          frequency?: string
          id?: string
          key?: string
          mission_type?: string
          repeat_rule?: string
          sort_order?: number
          starts_at?: string | null
          target_value?: number
          title_en?: string | null
          title_fa?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipt_custom_fields: {
        Row: {
          created_at: string
          field_key: string
          field_label: string
          field_options: Json | null
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_label: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_label?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_receipt_documents: {
        Row: {
          created_at: string
          extracted_data: Json | null
          extraction_confidence: number | null
          extraction_notes: string | null
          extraction_status: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          receipt_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          extracted_data?: Json | null
          extraction_confidence?: number | null
          extraction_notes?: string | null
          extraction_status?: string
          file_name: string
          file_size: number
          file_type: string
          id?: string
          receipt_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          extracted_data?: Json | null
          extraction_confidence?: number | null
          extraction_notes?: string | null
          extraction_status?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          receipt_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipt_documents_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipt_links: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          receipt_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          receipt_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipt_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipt_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_customer_receivables"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payment_receipt_links_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount: number
          bank_name: string | null
          beneficiary_accounting_code: string | null
          created_at: string
          created_by: string
          custom_data: Json
          customer_id: string
          /**
           * Phase 7: unified person behind customer_id.
           * Derived by trg_payment_receipts_derive_person - supplying a value is accepted but ignored.
           */
          customer_person_id: string | null
          description: string | null
          destination_bank: string | null
          destination_bank_account_id: string | null
          document_channel: string | null
          has_perforation: boolean
          id: string
          is_mobile_bank_screenshot: boolean
          is_typed_receipt: boolean
          payer_accounting_code: string | null
          payer_name: string
          payer_name_on_receipt: string | null
          payer_phone: string | null
          payment_date: string
          payment_time: string
          posted_at: string | null
          posting_status: string
          receipt_image_url: string | null
          receipt_time: string | null
          receipt_type: string
          receiver_accounting_code: string | null
          receiver_name: string
          receiver_name_on_receipt: string | null
          receiver_party_id: string | null
          /**
           * Phase 7 (migrations 235-238): unified person behind receiver_party_id.
           * Derived by trg_payment_receipts_derive_person - supplying a value is accepted but ignored.
           */
          receiver_party_person_id: string | null
          receiver_phone: string | null
          rejection_reason: string | null
          security_warnings: Json
          source_bank: string | null
          source_bank_account_id: string | null
          status: string
          tracking_number: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          beneficiary_accounting_code?: string | null
          created_at?: string
          created_by: string
          custom_data?: Json
          customer_id: string
          /**
           * Phase 7: unified person behind customer_id.
           * Derived by trg_payment_receipts_derive_person - supplying a value is accepted but ignored.
           */
          customer_person_id?: string | null
          description?: string | null
          destination_bank?: string | null
          destination_bank_account_id?: string | null
          document_channel?: string | null
          has_perforation?: boolean
          id?: string
          is_mobile_bank_screenshot?: boolean
          is_typed_receipt?: boolean
          payer_accounting_code?: string | null
          payer_name: string
          payer_name_on_receipt?: string | null
          payer_phone?: string | null
          payment_date: string
          payment_time: string
          posted_at?: string | null
          posting_status?: string
          receipt_image_url?: string | null
          receipt_time?: string | null
          receipt_type?: string
          receiver_accounting_code?: string | null
          receiver_name: string
          receiver_name_on_receipt?: string | null
          receiver_party_id?: string | null
          /**
           * Phase 7: unified person behind receiver_party_id.
           * Derived by trg_payment_receipts_derive_person - supplying a value is accepted but ignored.
           */
          receiver_party_person_id?: string | null
          receiver_phone?: string | null
          rejection_reason?: string | null
          security_warnings?: Json
          source_bank?: string | null
          source_bank_account_id?: string | null
          status?: string
          tracking_number: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          beneficiary_accounting_code?: string | null
          created_at?: string
          created_by?: string
          custom_data?: Json
          customer_id?: string
          /**
           * Phase 7: unified person behind customer_id.
           * Derived by trg_payment_receipts_derive_person - supplying a value is accepted but ignored.
           */
          customer_person_id?: string | null
          description?: string | null
          destination_bank?: string | null
          destination_bank_account_id?: string | null
          document_channel?: string | null
          has_perforation?: boolean
          id?: string
          is_mobile_bank_screenshot?: boolean
          is_typed_receipt?: boolean
          payer_accounting_code?: string | null
          payer_name?: string
          payer_name_on_receipt?: string | null
          payer_phone?: string | null
          payment_date?: string
          payment_time?: string
          posted_at?: string | null
          posting_status?: string
          receipt_image_url?: string | null
          receipt_time?: string | null
          receipt_type?: string
          receiver_accounting_code?: string | null
          receiver_name?: string
          receiver_name_on_receipt?: string | null
          receiver_party_id?: string | null
          /**
           * Phase 7: unified person behind receiver_party_id.
           * Derived by trg_payment_receipts_derive_person - supplying a value is accepted but ignored.
           */
          receiver_party_person_id?: string | null
          receiver_phone?: string | null
          rejection_reason?: string | null
          security_warnings?: Json
          source_bank?: string | null
          source_bank_account_id?: string | null
          status?: string
          tracking_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_destination_bank_account_id_fkey"
            columns: ["destination_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_receiver_party_id_fkey"
            columns: ["receiver_party_id"]
            isOneToOne: false
            referencedRelation: "external_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_source_bank_account_id_fkey"
            columns: ["source_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_terms: {
        Row: {
          created_at: string
          created_by: string | null
          days: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days?: number | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      penalty_appeals: {
        Row: {
          appellant_id: string
          created_at: string
          deadline: string
          id: string
          penalty_id: string
          reason: string
          review_deadline: string
          review_note: string | null
          reviewed_at: string | null
          status: string
        }
        Insert: {
          appellant_id: string
          created_at?: string
          deadline?: string
          id?: string
          penalty_id: string
          reason: string
          review_deadline?: string
          review_note?: string | null
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          appellant_id?: string
          created_at?: string
          deadline?: string
          id?: string
          penalty_id?: string
          reason?: string
          review_deadline?: string
          review_note?: string | null
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "penalty_appeals_penalty_id_fkey"
            columns: ["penalty_id"]
            isOneToOne: true
            referencedRelation: "performance_penalties"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_penalties: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          inquiry_id: string | null
          is_active: boolean
          severity: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inquiry_id?: string | null
          is_active?: boolean
          severity: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inquiry_id?: string | null
          is_active?: boolean
          severity?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_penalties_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      person_aliases: {
        Row: {
          alias: string
          alias_kind: string
          alias_normalized: string | null
          created_at: string
          created_by: string | null
          id: string
          person_id: string
          source: string | null
          updated_at: string
        }
        Insert: {
          alias: string
          alias_kind?: string
          created_at?: string
          created_by?: string | null
          id?: string
          person_id: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          alias?: string
          alias_kind?: string
          created_at?: string
          created_by?: string | null
          id?: string
          person_id?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_aliases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      person_context_links: {
        Row: {
          context_kind: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          note: string | null
          person_id: string
          ref_id: string | null
          ref_table: string | null
          started_at: string
          updated_at: string
        }
        Insert: {
          context_kind: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          note?: string | null
          person_id: string
          ref_id?: string | null
          ref_table?: string | null
          started_at?: string
          updated_at?: string
        }
        Update: {
          context_kind?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          note?: string | null
          person_id?: string
          ref_id?: string | null
          ref_table?: string | null
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_context_links_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      person_field_definitions: {
        Row: {
          applies_to_kind: string
          created_at: string
          created_by: string | null
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          name: string
          options: Json | null
          sort_order: number
          updated_at: string
          validation_regex: string | null
        }
        Insert: {
          applies_to_kind?: string
          created_at?: string
          created_by?: string | null
          field_type: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          name: string
          options?: Json | null
          sort_order?: number
          updated_at?: string
          validation_regex?: string | null
        }
        Update: {
          applies_to_kind?: string
          created_at?: string
          created_by?: string | null
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          name?: string
          options?: Json | null
          sort_order?: number
          updated_at?: string
          validation_regex?: string | null
        }
        Relationships: []
      }
      person_field_values: {
        Row: {
          field_definition_id: string
          id: string
          person_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          field_definition_id: string
          id?: string
          person_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          field_definition_id?: string
          id?: string
          person_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "person_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "person_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_field_values_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      person_identifiers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          kind: string
          person_id: string
          status: string
          updated_at: string
          value_normalized: string
          value_raw: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          kind: string
          person_id: string
          status?: string
          updated_at?: string
          /**
           * Optional since migration 228: trg_person_identifiers_normalize
           * computes it from (kind, value_raw) BEFORE INSERT, so it behaves as
           * a defaulted column even though it is NOT NULL. Supplying a value
           * here is accepted but ignored — the trigger overwrites it.
           */
          value_normalized?: string
          value_raw: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          kind?: string
          person_id?: string
          status?: string
          updated_at?: string
          value_normalized?: string
          value_raw?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_identifiers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          is_active: boolean
          kind: string
          legal_name: string | null
          notes: string | null
          updated_at: string
          visibility_scope: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          kind?: string
          legal_name?: string | null
          notes?: string | null
          updated_at?: string
          visibility_scope?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          kind?: string
          legal_name?: string | null
          notes?: string | null
          updated_at?: string
          visibility_scope?: string
        }
        Relationships: []
      }
      presence_logs: {
        Row: {
          clock_in_at: string
          clock_out_at: string | null
          date: string
          id: string
          notes: string | null
          total_minutes: number | null
          user_id: string
        }
        Insert: {
          clock_in_at?: string
          clock_out_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          total_minutes?: number | null
          user_id: string
        }
        Update: {
          clock_in_at?: string
          clock_out_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          total_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alert_notifications: {
        Row: {
          alert_rule_id: string
          change_percent: number | null
          created_at: string
          current_price: number | null
          id: string
          is_read: boolean
          message: string
          previous_price: number | null
          product_id: string
          sale_price_type_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          alert_rule_id: string
          change_percent?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          is_read?: boolean
          message: string
          previous_price?: number | null
          product_id: string
          sale_price_type_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          alert_rule_id?: string
          change_percent?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          is_read?: boolean
          message?: string
          previous_price?: number | null
          product_id?: string
          sale_price_type_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alert_notifications_alert_rule_id_fkey"
            columns: ["alert_rule_id"]
            isOneToOne: false
            referencedRelation: "price_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alert_rules: {
        Row: {
          baseline_change_percent: number | null
          baseline_price: number | null
          created_at: string
          id: string
          is_active: boolean
          is_repeatable: boolean
          last_triggered_at: string | null
          note: string | null
          operator: string
          product_id: string
          sale_price_type_id: string | null
          stock_status_from: string | null
          stock_status_to: string | null
          target_currency: string
          target_value: number | null
          triggered_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_change_percent?: number | null
          baseline_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_repeatable?: boolean
          last_triggered_at?: string | null
          note?: string | null
          operator: string
          product_id: string
          sale_price_type_id?: string | null
          stock_status_from?: string | null
          stock_status_to?: string | null
          target_currency?: string
          target_value?: number | null
          triggered_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_change_percent?: number | null
          baseline_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_repeatable?: boolean
          last_triggered_at?: string | null
          note?: string | null
          operator?: string
          product_id?: string
          sale_price_type_id?: string | null
          stock_status_from?: string | null
          stock_status_to?: string | null
          target_currency?: string
          target_value?: number | null
          triggered_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alert_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alert_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_alert_rules_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_collisions: {
        Row: {
          detected_at: string
          entity_refs: Json
          id: string
          normalized_phone: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          detected_at?: string
          entity_refs: Json
          id?: string
          normalized_phone: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          detected_at?: string
          entity_refs?: Json
          id?: string
          normalized_phone?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      price_calculation_snapshots: {
        Row: {
          calculated_at: string
          calculated_by: string | null
          calculation_details: Json | null
          currency_rate: number
          final_sale_price: number
          id: string
          input_currency: Database["public"]["Enums"]["currency_code"]
          input_purchase_price: number
          margin_amount: number
          pricing_rule_id: string | null
          product_id: string
          purchase_price_id: string | null
          purchase_price_toman: number
          rounded_sale_price: number
          sale_price_type_id: string | null
          settlement_type_id: string | null
          shipping_cost: number
        }
        Insert: {
          calculated_at?: string
          calculated_by?: string | null
          calculation_details?: Json | null
          currency_rate: number
          final_sale_price: number
          id?: string
          input_currency: Database["public"]["Enums"]["currency_code"]
          input_purchase_price: number
          margin_amount?: number
          pricing_rule_id?: string | null
          product_id: string
          purchase_price_id?: string | null
          purchase_price_toman: number
          rounded_sale_price: number
          sale_price_type_id?: string | null
          settlement_type_id?: string | null
          shipping_cost?: number
        }
        Update: {
          calculated_at?: string
          calculated_by?: string | null
          calculation_details?: Json | null
          currency_rate?: number
          final_sale_price?: number
          id?: string
          input_currency?: Database["public"]["Enums"]["currency_code"]
          input_purchase_price?: number
          margin_amount?: number
          pricing_rule_id?: string | null
          product_id?: string
          purchase_price_id?: string | null
          purchase_price_toman?: number
          rounded_sale_price?: number
          sale_price_type_id?: string | null
          settlement_type_id?: string | null
          shipping_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_calculation_snapshots_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_calculation_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_calculation_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_calculation_snapshots_purchase_price_id_fkey"
            columns: ["purchase_price_id"]
            isOneToOne: false
            referencedRelation: "purchase_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_calculation_snapshots_purchase_price_id_fkey"
            columns: ["purchase_price_id"]
            isOneToOne: false
            referencedRelation: "v_latest_active_purchase_prices"
            referencedColumns: ["purchase_price_id"]
          },
          {
            foreignKeyName: "price_calculation_snapshots_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_calculation_snapshots_settlement_type_id_fkey"
            columns: ["settlement_type_id"]
            isOneToOne: false
            referencedRelation: "settlement_types"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_reasons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_list_items: {
        Row: {
          id: string
          min_qty: number | null
          price_list_id: string
          product_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          min_qty?: number | null
          price_list_id: string
          product_id: string
          unit_price: number
        }
        Update: {
          id?: string
          min_qty?: number | null
          price_list_id?: string
          product_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      platform_releases: {
        Row: {
          build_time: string | null
          category: string
          created_at: string
          created_by: string | null
          details_fa: string | null
          git_sha: string | null
          id: string
          items: Json
          published_at: string | null
          release_number: number | null
          status: string
          summary_fa: string
          title_fa: string
          updated_at: string
          updated_by: string | null
          version: string | null
        }
        Insert: {
          build_time?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          details_fa?: string | null
          git_sha?: string | null
          id?: string
          items?: Json
          published_at?: string | null
          release_number?: number | null
          status?: string
          summary_fa: string
          title_fa: string
          updated_at?: string
          updated_by?: string | null
          version?: string | null
        }
        Update: {
          build_time?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          details_fa?: string | null
          git_sha?: string | null
          id?: string
          items?: Json
          published_at?: string | null
          release_number?: number | null
          status?: string
          summary_fa?: string
          title_fa?: string
          updated_at?: string
          updated_by?: string | null
          version?: string | null
        }
        Relationships: []
      }
      price_lists: {
        Row: {
          created_at: string
          currency: string
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_board_access_requests: {
        Row: {
          board_key: string
          created_at: string
          id: string
          requested_at: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          board_key: string
          created_at?: string
          id?: string
          requested_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          board_key?: string
          created_at?: string
          id?: string
          requested_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_board_settings: {
        Row: {
          board_key: string
          created_at: string
          id: string
          is_active: boolean
          sale_price_type_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          board_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          sale_price_type_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          board_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sale_price_type_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_board_settings_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_board_viewer_sessions: {
        Row: {
          board_key: string
          created_at: string
          entered_at: string
          id: string
          last_seen_at: string
          left_at: string | null
          sale_price_type_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          board_key: string
          created_at?: string
          entered_at?: string
          id?: string
          last_seen_at?: string
          left_at?: string | null
          sale_price_type_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          board_key?: string
          created_at?: string
          entered_at?: string
          id?: string
          last_seen_at?: string
          left_at?: string | null
          sale_price_type_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pricing_recompute_queue: {
        Row: {
          attempts: number
          created_by: string | null
          enqueued_at: string
          error: string | null
          id: string
          priority: number
          processed_at: string | null
          product_id: string
          reason: string
          sale_price_type_id: string | null
          source_id: string | null
          source_table: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_by?: string | null
          enqueued_at?: string
          error?: string | null
          id?: string
          priority?: number
          processed_at?: string | null
          product_id: string
          reason: string
          sale_price_type_id?: string | null
          source_id?: string | null
          source_table?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_by?: string | null
          enqueued_at?: string
          error?: string | null
          id?: string
          priority?: number
          processed_at?: string | null
          product_id?: string
          reason?: string
          sale_price_type_id?: string | null
          source_id?: string | null
          source_table?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_recompute_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_recompute_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pricing_recompute_queue_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          actions: Json
          brand_id: string | null
          category_id: string | null
          conditions: Json
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          fixed_margin_value: number | null
          id: string
          is_active: boolean
          is_system_default: boolean
          margin_type: Database["public"]["Enums"]["margin_type"] | null
          margin_value: number | null
          max_purchase_price_toman: number | null
          min_purchase_price_toman: number | null
          name: string
          priority: number
          product_type: Database["public"]["Enums"]["product_type"] | null
          rule_name: string | null
          sale_price_type_id: string | null
          settlement_type_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          actions?: Json
          brand_id?: string | null
          category_id?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          fixed_margin_value?: number | null
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          margin_type?: Database["public"]["Enums"]["margin_type"] | null
          margin_value?: number | null
          max_purchase_price_toman?: number | null
          min_purchase_price_toman?: number | null
          name: string
          priority?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          rule_name?: string | null
          sale_price_type_id?: string | null
          settlement_type_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          actions?: Json
          brand_id?: string | null
          category_id?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          fixed_margin_value?: number | null
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          margin_type?: Database["public"]["Enums"]["margin_type"] | null
          margin_value?: number | null
          max_purchase_price_toman?: number | null
          min_purchase_price_toman?: number | null
          name?: string
          priority?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          rule_name?: string | null
          sale_price_type_id?: string | null
          settlement_type_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_settlement_type_id_fkey"
            columns: ["settlement_type_id"]
            isOneToOne: false
            referencedRelation: "settlement_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          label_fa: string
          sort_order: number
          updated_at: string
          value_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          label_fa: string
          sort_order?: number
          updated_at?: string
          value_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          label_fa?: string
          sort_order?: number
          updated_at?: string
          value_type?: string
        }
        Relationships: []
      }
      product_attributes: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["product_attribute_type"]
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          type: Database["public"]["Enums"]["product_attribute_type"]
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["product_attribute_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attributes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_category_attribute_values: {
        Row: {
          category_attribute_id: string
          created_at: string
          id: string
          product_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          category_attribute_id: string
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          category_attribute_id?: string
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_category_attribute_values_category_attribute_id_fkey"
            columns: ["category_attribute_id"]
            isOneToOne: false
            referencedRelation: "category_product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_computed_prices: {
        Row: {
          computed_at: string
          computed_by: string | null
          currency_rate: number
          final_sale_price: number
          id: string
          input_currency: string
          input_purchase_price: number
          margin_amount: number
          pricing_rule_id: string | null
          product_id: string
          purchase_price_id: string | null
          purchase_price_toman: number
          rounded_sale_price: number
          sale_price_type_id: string
          settlement_type_id: string | null
          shipping_cost: number
          source: string
        }
        Insert: {
          computed_at?: string
          computed_by?: string | null
          currency_rate: number
          final_sale_price: number
          id?: string
          input_currency: string
          input_purchase_price: number
          margin_amount?: number
          pricing_rule_id?: string | null
          product_id: string
          purchase_price_id?: string | null
          purchase_price_toman: number
          rounded_sale_price: number
          sale_price_type_id: string
          settlement_type_id?: string | null
          shipping_cost?: number
          source?: string
        }
        Update: {
          computed_at?: string
          computed_by?: string | null
          currency_rate?: number
          final_sale_price?: number
          id?: string
          input_currency?: string
          input_purchase_price?: number
          margin_amount?: number
          pricing_rule_id?: string | null
          product_id?: string
          purchase_price_id?: string | null
          purchase_price_toman?: number
          rounded_sale_price?: number
          sale_price_type_id?: string
          settlement_type_id?: string | null
          shipping_cost?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_computed_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_computed_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_computed_prices_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_interaction_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          product_id: string
          sale_price_type_id: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          product_id: string
          sale_price_type_id?: string | null
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          product_id?: string
          sale_price_type_id?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_interaction_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_interaction_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_interaction_events_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_label_links: {
        Row: {
          created_at: string
          label_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          label_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          label_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_label_links_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "product_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_label_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_label_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_labels: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
          visibility: string
          weight: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          visibility?: string
          weight?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          visibility?: string
          weight?: number
        }
        Relationships: []
      }
      product_owner_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_owner_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_owner_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_recommendation_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_disabled: boolean
          is_pinned: boolean
          priority: number
          product_id: string
          recommended_product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_disabled?: boolean
          is_pinned?: boolean
          priority?: number
          product_id: string
          recommended_product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_disabled?: boolean
          is_pinned?: boolean
          priority?: number
          product_id?: string
          recommended_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_recommendation_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recommendation_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_recommendation_overrides_recommended_product_id_fkey"
            columns: ["recommended_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recommendation_overrides_recommended_product_id_fkey"
            columns: ["recommended_product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_sale_price_history: {
        Row: {
          change_amount: number | null
          change_percent: number | null
          created_at: string
          created_by: string | null
          id: string
          new_sale_price: number
          old_sale_price: number | null
          product_id: string
          sale_price_type_id: string | null
          settlement_type_id: string | null
          snapshot_id: string | null
        }
        Insert: {
          change_amount?: number | null
          change_percent?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          new_sale_price: number
          old_sale_price?: number | null
          product_id: string
          sale_price_type_id?: string | null
          settlement_type_id?: string | null
          snapshot_id?: string | null
        }
        Update: {
          change_amount?: number | null
          change_percent?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          new_sale_price?: number
          old_sale_price?: number | null
          product_id?: string
          sale_price_type_id?: string | null
          settlement_type_id?: string | null
          snapshot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sale_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sale_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_sale_price_history_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sale_price_history_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_calculation_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sku_counters: {
        Row: {
          last_value: number
          updated_at: string
          year: number
        }
        Insert: {
          last_value?: number
          updated_at?: string
          year: number
        }
        Update: {
          last_value?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      product_suppliers: {
        Row: {
          auto_added: boolean
          created_at: string
          id: string
          is_primary: boolean
          notes: string | null
          product_id: string
          supplier_id: string
          /**
           * Phase 7: unified person behind supplier_id.
           * Derived by trg_product_suppliers_derive_person - supplying a value is accepted but ignored.
           */
          supplier_person_id: string
        }
        Insert: {
          auto_added?: boolean
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          product_id: string
          supplier_id: string
          /**
           * Phase 7: unified person behind supplier_id.
           * Derived by trg_product_suppliers_derive_person - supplying a value is accepted but ignored.
           */
          supplier_person_id?: string
        }
        Update: {
          auto_added?: boolean
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          product_id?: string
          supplier_id?: string
          /**
           * Phase 7: unified person behind supplier_id.
           * Derived by trg_product_suppliers_derive_person - supplying a value is accepted but ignored.
           */
          supplier_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          accounting_code: string | null
          barcode: string | null
          base_currency: string
          brand_id: string | null
          capacity: string | null
          category: string | null
          category_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          dedup_key: string | null
          description: string | null
          id: string
          is_active: boolean
          model: string | null
          name: string
          primary_spec: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          promotion_weight: number
          received_at: string | null
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          stock_status: Database["public"]["Enums"]["stock_status"]
          technical_notes: string | null
          torob_url: string | null
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accounting_code?: string | null
          barcode?: string | null
          base_currency?: string
          brand_id?: string | null
          capacity?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dedup_key?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          model?: string | null
          name: string
          primary_spec?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          promotion_weight?: number
          received_at?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_status?: Database["public"]["Enums"]["stock_status"]
          technical_notes?: string | null
          torob_url?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounting_code?: string | null
          barcode?: string | null
          base_currency?: string
          brand_id?: string | null
          capacity?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dedup_key?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          model?: string | null
          name?: string
          primary_spec?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          promotion_weight?: number
          received_at?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_status?: Database["public"]["Enums"]["stock_status"]
          technical_notes?: string | null
          torob_url?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_field_definitions: {
        Row: {
          created_at: string
          field_type: Database["public"]["Enums"]["profile_field_type"]
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          name: string
          options: Json
          show_on_register: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_type?: Database["public"]["Enums"]["profile_field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          name: string
          options?: Json
          show_on_register?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_type?: Database["public"]["Enums"]["profile_field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          name?: string
          options?: Json
          show_on_register?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profile_field_values: {
        Row: {
          created_at: string
          field_name: string
          id: string
          updated_at: string
          user_id: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          updated_at?: string
          user_id: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          updated_at?: string
          user_id?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_field_values_field_name_fkey"
            columns: ["field_name"]
            isOneToOne: false
            referencedRelation: "profile_field_definitions"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "profile_field_values_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_field_values_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          phone: string | null
          position: string | null
          registered_at: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          last_seen_at?: string | null
          phone?: string | null
          position?: string | null
          registered_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          phone?: string | null
          position?: string | null
          registered_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          id: string
          line_total: number
          product_id: string
          purchase_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          line_total: number
          product_id: string
          purchase_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number
          product_id?: string
          purchase_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "vw_purchase_float"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "vw_supplier_payables"
            referencedColumns: ["purchase_id"]
          },
        ]
      }
      purchase_prices: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          effective_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          private_note: string | null
          product_id: string
          purchase_price: number
          reason_id: string | null
          registered_by: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          private_note?: string | null
          product_id: string
          purchase_price: number
          reason_id?: string | null
          registered_by?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          private_note?: string | null
          product_id?: string
          purchase_price?: number
          reason_id?: string | null
          registered_by?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_prices_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "price_change_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_prices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          request_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          request_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          request_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_request_status_history: {
        Row: {
          changed_at: string
          changed_by: string
          from_status: string | null
          id: string
          note: string | null
          request_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          assigned_to: string | null
          created_at: string
          expected_price: number | null
          final_price: number | null
          id: string
          inquiry_id: string | null
          notes: string | null
          product_id: string
          quantity: number
          requested_by: string
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          expected_price?: number | null
          final_price?: number | null
          id?: string
          inquiry_id?: string | null
          notes?: string | null
          product_id: string
          quantity: number
          requested_by: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          expected_price?: number | null
          final_price?: number | null
          id?: string
          inquiry_id?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          requested_by?: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      purchases: {
        Row: {
          cash_price: number | null
          cash_price_currency: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          id: string
          notes: string | null
          number: string | null
          paid_at: string | null
          paid_by: string | null
          payment_term_id: string | null
          product_id: string | null
          purchase_date: string
          purchase_price: number | null
          quantity: number
          status: string
          supplier_id: string | null
          /**
           * Migration 231 (Phase 5): the unified person behind supplier_id.
           * Derived by trg_purchases_derive_person — read it, never write it.
           */
          supplier_person_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          cash_price?: number | null
          cash_price_currency?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_term_id?: string | null
          product_id?: string | null
          purchase_date?: string
          purchase_price?: number | null
          quantity?: number
          status?: string
          supplier_id?: string | null
          /**
           * Migration 231 (Phase 5): derived by trg_purchases_derive_person
           * from supplier_id. Supplying a value here is accepted but ignored —
           * the trigger overwrites it.
           */
          supplier_person_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cash_price?: number | null
          cash_price_currency?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_term_id?: string | null
          product_id?: string | null
          purchase_date?: string
          purchase_price?: number | null
          quantity?: number
          status?: string
          supplier_id?: string | null
          /**
           * Migration 231 (Phase 5): derived by trg_purchases_derive_person
           * from supplier_id. Supplying a value here is accepted but ignored —
           * the trigger overwrites it.
           */
          supplier_person_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recent_purchase_settings: {
        Row: {
          id: string
          limited_after_hours: number
          singleton: boolean
          unavailable_after_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          limited_after_hours?: number
          singleton?: boolean
          unavailable_after_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          limited_after_hours?: number
          singleton?: boolean
          unavailable_after_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_export: boolean
          can_update: boolean
          can_view: boolean
          can_view_sensitive: boolean
          created_at: string
          id: string
          module: string
          role_name: string
          updated_at: string
        }
        Insert: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_export?: boolean
          can_update?: boolean
          can_view?: boolean
          can_view_sensitive?: boolean
          created_at?: string
          id?: string
          module: string
          role_name: string
          updated_at?: string
        }
        Update: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_export?: boolean
          can_update?: boolean
          can_view?: boolean
          can_view_sensitive?: boolean
          created_at?: string
          id?: string
          module?: string
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sale_list_items: {
        Row: {
          change_amount: number | null
          change_percent: number | null
          created_at: string
          current_price: number
          id: string
          previous_price: number | null
          product_id: string
          sale_list_id: string
          sort_order: number
          stock_status: string | null
        }
        Insert: {
          change_amount?: number | null
          change_percent?: number | null
          created_at?: string
          current_price: number
          id?: string
          previous_price?: number | null
          product_id: string
          sale_list_id: string
          sort_order?: number
          stock_status?: string | null
        }
        Update: {
          change_amount?: number | null
          change_percent?: number | null
          created_at?: string
          current_price?: number
          id?: string
          previous_price?: number | null
          product_id?: string
          sale_list_id?: string
          sort_order?: number
          stock_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_list_items_sale_list_id_fkey"
            columns: ["sale_list_id"]
            isOneToOne: false
            referencedRelation: "sale_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_list_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          sale_list_id: string
          snapshot_data: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          sale_list_id: string
          snapshot_data: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          sale_list_id?: string
          snapshot_data?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_list_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_list_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_list_versions_sale_list_id_fkey"
            columns: ["sale_list_id"]
            isOneToOne: false
            referencedRelation: "sale_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lists: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          pdf_brand_order: Json | null
          pdf_cell_padding_x: number
          pdf_column_widths: Json | null
          pdf_font_size: number
          pdf_product_order_by_brand: Json | null
          pdf_row_padding_y: number
          published_at: string | null
          sale_price_type_id: string
          selected_columns: Json | null
          seller_info: string | null
          settlement_type_id: string | null
          status: string
          terms_text: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          pdf_brand_order?: Json | null
          pdf_cell_padding_x?: number
          pdf_column_widths?: Json | null
          pdf_font_size?: number
          pdf_product_order_by_brand?: Json | null
          pdf_row_padding_y?: number
          published_at?: string | null
          sale_price_type_id: string
          selected_columns?: Json | null
          seller_info?: string | null
          settlement_type_id?: string | null
          status?: string
          terms_text?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          pdf_brand_order?: Json | null
          pdf_cell_padding_x?: number
          pdf_column_widths?: Json | null
          pdf_font_size?: number
          pdf_product_order_by_brand?: Json | null
          pdf_row_padding_y?: number
          published_at?: string | null
          sale_price_type_id?: string
          selected_columns?: Json | null
          seller_info?: string | null
          settlement_type_id?: string | null
          status?: string
          terms_text?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lists_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lists_settlement_type_id_fkey"
            columns: ["settlement_type_id"]
            isOneToOne: false
            referencedRelation: "settlement_types"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_price_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_settlement_days: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_settlement_days?: number
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_settlement_days?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_quote_counters: {
        Row: {
          last_value: number
          updated_at: string
          year: number
        }
        Insert: {
          last_value?: number
          updated_at?: string
          year: number
        }
        Update: {
          last_value?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      sales_quote_items: {
        Row: {
          created_at: string
          discount_amount: number
          free_item_name: string | null
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          quote_id: string
          sale_price_type_id: string | null
          sku_snapshot: string | null
          source: Database["public"]["Enums"]["sales_quote_item_source"]
          title_snapshot: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          free_item_name?: string | null
          id?: string
          line_total: number
          product_id?: string | null
          quantity: number
          quote_id: string
          sale_price_type_id?: string | null
          sku_snapshot?: string | null
          source: Database["public"]["Enums"]["sales_quote_item_source"]
          title_snapshot?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          free_item_name?: string | null
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          quote_id?: string
          sale_price_type_id?: string | null
          sku_snapshot?: string | null
          source?: Database["public"]["Enums"]["sales_quote_item_source"]
          title_snapshot?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_send_queue: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          message_text: string | null
          pdf_attached: boolean
          processed_at: string | null
          quote_id: string
          recipient: string
          scheduled_at: string
          share_log_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          message_text?: string | null
          pdf_attached?: boolean
          processed_at?: string | null
          quote_id: string
          recipient: string
          scheduled_at?: string
          share_log_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          message_text?: string | null
          pdf_attached?: boolean
          processed_at?: string | null
          quote_id?: string
          recipient?: string
          scheduled_at?: string
          share_log_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_send_queue_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_send_queue_share_log_id_fkey"
            columns: ["share_log_id"]
            isOneToOne: false
            referencedRelation: "sales_quote_share_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_share_logs: {
        Row: {
          attempted_at: string
          attempted_by: string | null
          channel: string
          created_at: string
          id: string
          message_text: string | null
          pdf_attached: boolean
          quote_id: string
          recipient: string
          result_message: string | null
          status: string
        }
        Insert: {
          attempted_at?: string
          attempted_by?: string | null
          channel: string
          created_at?: string
          id?: string
          message_text?: string | null
          pdf_attached?: boolean
          quote_id: string
          recipient: string
          result_message?: string | null
          status?: string
        }
        Update: {
          attempted_at?: string
          attempted_by?: string | null
          channel?: string
          created_at?: string
          id?: string
          message_text?: string | null
          pdf_attached?: boolean
          quote_id?: string
          recipient?: string
          result_message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_share_logs_attempted_by_fkey"
            columns: ["attempted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_share_logs_attempted_by_fkey"
            columns: ["attempted_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_share_logs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quotes: {
        Row: {
          accounting_registered_at: string | null
          accounting_registered_by: string | null
          accounting_sent_at: string | null
          accounting_sent_by: string | null
          cancel_reason: string | null
          below_list_price_ack: boolean
          below_list_price_ack_at: string | null
          below_list_price_ack_by: string | null
          commitment_confirmed: boolean
          credit_check_snapshot: Json | null
          customer_id: string | null
          /**
           * Migration 231 (Phase 5): the unified person behind customer_id.
           * Derived by trg_sales_quotes_derive_person — read it, never write it.
           */
          customer_person_id: string | null
          deposit_amount: number | null
          list_price_snapshot: number | null
          quote_exception_amount: number | null
          quote_exception_confirmed_at: string | null
          quote_exception_confirmed_by: string | null
          quote_exception_minutes: number | null
          quote_exception_snapshot: Json | null
          quote_exception_text: string | null
          quote_exception_type: string | null
          reject_reason: string | null
          visitor_id: string | null
          warehouse_id: string | null
          canceled_at: string | null
          canceled_by: string | null
          created_at: string
          customer_name: string
          customer_note: string | null
          customer_phone: string
          discount_amount: number
          expires_at: string | null
          final_amount: number
          id: string
          quote_number: string
          salesperson_id: string | null
          settlement_type_id: string | null
          status: Database["public"]["Enums"]["sales_quote_status"]
          subtotal_amount: number
          updated_at: string
        }
        Insert: {
          accounting_registered_at?: string | null
          accounting_registered_by?: string | null
          accounting_sent_at?: string | null
          accounting_sent_by?: string | null
          cancel_reason?: string | null
          below_list_price_ack?: boolean
          below_list_price_ack_at?: string | null
          below_list_price_ack_by?: string | null
          commitment_confirmed?: boolean
          credit_check_snapshot?: Json | null
          customer_id?: string | null
          /**
           * Migration 231 (Phase 5): derived by trg_sales_quotes_derive_person
           * from customer_id. Supplying a value here is accepted but ignored —
           * the trigger overwrites it. Same contract as
           * person_identifiers.value_normalized (migration 228).
           */
          customer_person_id?: string | null
          deposit_amount?: number | null
          list_price_snapshot?: number | null
          quote_exception_amount?: number | null
          quote_exception_confirmed_at?: string | null
          quote_exception_confirmed_by?: string | null
          quote_exception_minutes?: number | null
          quote_exception_snapshot?: Json | null
          quote_exception_text?: string | null
          quote_exception_type?: string | null
          reject_reason?: string | null
          visitor_id?: string | null
          warehouse_id?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          customer_name: string
          customer_note?: string | null
          customer_phone: string
          discount_amount?: number
          expires_at?: string | null
          final_amount?: number
          id?: string
          quote_number: string
          salesperson_id?: string | null
          settlement_type_id?: string | null
          status?: Database["public"]["Enums"]["sales_quote_status"]
          subtotal_amount?: number
          updated_at?: string
        }
        Update: {
          accounting_registered_at?: string | null
          accounting_registered_by?: string | null
          accounting_sent_at?: string | null
          accounting_sent_by?: string | null
          cancel_reason?: string | null
          below_list_price_ack?: boolean
          below_list_price_ack_at?: string | null
          below_list_price_ack_by?: string | null
          commitment_confirmed?: boolean
          credit_check_snapshot?: Json | null
          customer_id?: string | null
          /**
           * Migration 231 (Phase 5): derived by trg_sales_quotes_derive_person
           * from customer_id. Supplying a value here is accepted but ignored —
           * the trigger overwrites it. Same contract as
           * person_identifiers.value_normalized (migration 228).
           */
          customer_person_id?: string | null
          deposit_amount?: number | null
          list_price_snapshot?: number | null
          quote_exception_amount?: number | null
          quote_exception_confirmed_at?: string | null
          quote_exception_confirmed_by?: string | null
          quote_exception_minutes?: number | null
          quote_exception_snapshot?: Json | null
          quote_exception_text?: string | null
          quote_exception_type?: string | null
          reject_reason?: string | null
          visitor_id?: string | null
          warehouse_id?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          customer_name?: string
          customer_note?: string | null
          customer_phone?: string
          discount_amount?: number
          expires_at?: string | null
          final_amount?: number
          id?: string
          quote_number?: string
          salesperson_id?: string | null
          settlement_type_id?: string | null
          status?: Database["public"]["Enums"]["sales_quote_status"]
          subtotal_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      salesperson_capital_allocations_dynamic: {
        Row: {
          allocated_capital: number | null
          capital_setting_id: string
          created_at: string
          id: string
          salesperson_id: string
          share_ratio: number | null
          weighted_score: number | null
        }
        Insert: {
          allocated_capital?: number | null
          capital_setting_id: string
          created_at?: string
          id?: string
          salesperson_id: string
          share_ratio?: number | null
          weighted_score?: number | null
        }
        Update: {
          allocated_capital?: number | null
          capital_setting_id?: string
          created_at?: string
          id?: string
          salesperson_id?: string
          share_ratio?: number | null
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "salesperson_capital_allocations_dynamic_capital_setting_id_fkey"
            columns: ["capital_setting_id"]
            isOneToOne: false
            referencedRelation: "daily_capital_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      score_snapshots: {
        Row: {
          captured_at: string
          daily_score: number
          employee_id: string
          id: number
          monthly_score: number
          normalized_score: number
          total_score: number
          weekly_score: number
        }
        Insert: {
          captured_at?: string
          daily_score?: number
          employee_id: string
          id?: number
          monthly_score?: number
          normalized_score?: number
          total_score?: number
          weekly_score?: number
        }
        Update: {
          captured_at?: string
          daily_score?: number
          employee_id?: string
          id?: number
          monthly_score?: number
          normalized_score?: number
          total_score?: number
          weekly_score?: number
        }
        Relationships: []
      }
      settlement_types: {
        Row: {
          code: string
          created_at: string
          days: number
          description: string | null
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_cost_rules: {
        Row: {
          brand_id: string | null
          category_id: string | null
          cost_currency: string | null
          cost_type: Database["public"]["Enums"]["shipping_cost_type"]
          cost_value: number
          created_at: string
          id: string
          is_active: boolean
          max_purchase_price: number | null
          min_purchase_price: number | null
          priority: number
          product_id: string | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          cost_currency?: string | null
          cost_type: Database["public"]["Enums"]["shipping_cost_type"]
          cost_value: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_purchase_price?: number | null
          min_purchase_price?: number | null
          priority?: number
          product_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          cost_currency?: string | null
          cost_type?: Database["public"]["Enums"]["shipping_cost_type"]
          cost_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_purchase_price?: number | null
          min_purchase_price?: number | null
          priority?: number
          product_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_cost_rules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_cost_rules_cost_currency_fkey"
            columns: ["cost_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "shipping_cost_rules_cost_currency_fkey"
            columns: ["cost_currency"]
            isOneToOne: false
            referencedRelation: "effective_currencies_view"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "shipping_cost_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_cost_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      stock_alert_requests: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          note: string | null
          priority: Database["public"]["Enums"]["stock_alert_priority"]
          product_id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          salesperson_id: string | null
          status: Database["public"]["Enums"]["stock_alert_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone: string
          id?: string
          note?: string | null
          priority?: Database["public"]["Enums"]["stock_alert_priority"]
          product_id: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          salesperson_id?: string | null
          status?: Database["public"]["Enums"]["stock_alert_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          note?: string | null
          priority?: Database["public"]["Enums"]["stock_alert_priority"]
          product_id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          salesperson_id?: string | null
          status?: Database["public"]["Enums"]["stock_alert_status"]
          updated_at?: string
        }
        Relationships: []
      }
      staff_daily_performance_metrics: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inbound_calls_count: number
          metric_date: string
          notes: string | null
          outbound_calls_count: number
          profit_amount: number
          sales_amount: number
          staff_user_id: string
          talk_time_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inbound_calls_count?: number
          metric_date: string
          notes?: string | null
          outbound_calls_count?: number
          profit_amount?: number
          sales_amount?: number
          staff_user_id: string
          talk_time_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inbound_calls_count?: number
          metric_date?: string
          notes?: string | null
          outbound_calls_count?: number
          profit_amount?: number
          sales_amount?: number
          staff_user_id?: string
          talk_time_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          status: string
          trust_level: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          trust_level?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          trust_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          reference_id: string | null
          reference_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      validation_rules: {
        Row: {
          created_at: string
          enabled: boolean
          field_key: string
          id: string
          message: string
          rule_type: string
          scope: string
          severity: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          field_key: string
          id?: string
          message: string
          rule_type: string
          scope: string
          severity?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          field_key?: string
          id?: string
          message?: string
          rule_type?: string
          scope?: string
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_vouchers: {
        Row: {
          amount: number
          cheque_due_date: string | null
          cheque_number: string | null
          created_at: string
          created_by: string | null
          description: string | null
          document_channel: string
          id: string
          payee_customer_id: string | null
          payee_name: string | null
          payee_party_id: string | null
          /**
           * Migration 231 (Phase 5): the unified person behind a supplier or
           * customer payee. Derived by trg_payment_vouchers_derive_person —
           * read it, never write it. Always null for payee_type
           * 'external_party' and 'other', which have no person behind them.
           */
          payee_person_id: string | null
          payee_supplier_id: string | null
          payee_type: string
          payment_date: string
          payment_time: string | null
          purchase_id: string | null
          source_bank_account_id: string
          status: string
          tracking_number: string | null
          updated_at: string
          voucher_number: string | null
        }
        Insert: {
          amount: number
          cheque_due_date?: string | null
          cheque_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_channel: string
          id?: string
          payee_customer_id?: string | null
          payee_name?: string | null
          payee_party_id?: string | null
          /**
           * Migration 231 (Phase 5): derived by
           * trg_payment_vouchers_derive_person from the supplier/customer
           * payee. Supplying a value here is accepted but ignored.
           */
          payee_person_id?: string | null
          payee_supplier_id?: string | null
          payee_type: string
          payment_date: string
          payment_time?: string | null
          purchase_id?: string | null
          source_bank_account_id: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
          voucher_number?: string | null
        }
        Update: {
          amount?: number
          cheque_due_date?: string | null
          cheque_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_channel?: string
          id?: string
          payee_customer_id?: string | null
          payee_name?: string | null
          payee_party_id?: string | null
          /**
           * Migration 231 (Phase 5): derived by
           * trg_payment_vouchers_derive_person from the supplier/customer
           * payee. Supplying a value here is accepted but ignored.
           */
          payee_person_id?: string | null
          payee_supplier_id?: string | null
          payee_type?: string
          payment_date?: string
          payment_time?: string | null
          purchase_id?: string | null
          source_bank_account_id?: string
          status?: string
          tracking_number?: string | null
          updated_at?: string
          voucher_number?: string | null
        }
        Relationships: []
      }
      warehouse_stock: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: []
      }
      visitors: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number | null
          id: string
          movement_type: string
          note: string | null
          product_id: string
          quantity: number
          ref_id: string | null
          ref_type: string | null
          related_warehouse_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta?: number | null
          id?: string
          movement_type: string
          note?: string | null
          product_id: string
          quantity: number
          ref_id?: string | null
          ref_type?: string | null
          related_warehouse_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number | null
          id?: string
          movement_type?: string
          note?: string | null
          product_id?: string
          quantity?: number
          ref_id?: string | null
          ref_type?: string | null
          related_warehouse_id?: string | null
          warehouse_id?: string
        }
        Relationships: []
      }
      stock_transfers: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          from_warehouse_id: string
          id: string
          note: string | null
          status: string
          to_warehouse_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id: string
          id?: string
          note?: string | null
          status?: string
          to_warehouse_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string
          id?: string
          note?: string | null
          status?: string
          to_warehouse_id?: string
        }
        Relationships: []
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          transfer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          transfer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          transfer_id?: string
        }
        Relationships: []
      }
      waybill_custom_fields: {
        Row: {
          created_at: string
          field_key: string
          field_label: string
          field_options: Json | null
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_label: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_label?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      waybill_items: {
        Row: {
          created_at: string
          id: string
          invoice_item_id: string
          notes: string | null
          product_id: string
          quantity: number
          waybill_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_item_id: string
          notes?: string | null
          product_id: string
          quantity: number
          waybill_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_item_id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          waybill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waybill_items_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waybill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waybill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "waybill_items_waybill_id_fkey"
            columns: ["waybill_id"]
            isOneToOne: false
            referencedRelation: "waybills"
            referencedColumns: ["id"]
          },
        ]
      }
      waybill_number_counter: {
        Row: {
          day: string
          last_value: number
        }
        Insert: {
          day: string
          last_value?: number
        }
        Update: {
          day?: string
          last_value?: number
        }
        Relationships: []
      }
      waybills: {
        Row: {
          created_at: string
          created_by: string
          custom_data: Json
          customer_accounting_code: string | null
          destination_address: string | null
          destination_city: string
          id: string
          invoice_id: string
          receiver_name: string
          receiver_phone: string
          sender_name: string
          sender_phone: string
          shipping_company: string
          shipping_notes: string | null
          status: string
          updated_at: string
          waybill_number: string
        }
        Insert: {
          created_at?: string
          created_by: string
          custom_data?: Json
          customer_accounting_code?: string | null
          destination_address?: string | null
          destination_city: string
          id?: string
          invoice_id: string
          receiver_name: string
          receiver_phone: string
          sender_name: string
          sender_phone: string
          shipping_company: string
          shipping_notes?: string | null
          status?: string
          updated_at?: string
          waybill_number: string
        }
        Update: {
          created_at?: string
          created_by?: string
          custom_data?: Json
          customer_accounting_code?: string | null
          destination_address?: string | null
          destination_city?: string
          id?: string
          invoice_id?: string
          receiver_name?: string
          receiver_phone?: string
          sender_name?: string
          sender_phone?: string
          shipping_company?: string
          shipping_notes?: string | null
          status?: string
          updated_at?: string
          waybill_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "waybills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waybills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waybills_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waybills_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vw_customer_receivables"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      workflow_settings: {
        Row: {
          id: string
          is_active: boolean
          penalty_enabled: boolean
          penalty_for: string | null
          process_key: string
          process_name_fa: string
          reviewer_role: string | null
          timer_minutes: number
          updated_at: string
          updated_by: string | null
          uploader_role: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          penalty_enabled?: boolean
          penalty_for?: string | null
          process_key: string
          process_name_fa: string
          reviewer_role?: string | null
          timer_minutes?: number
          updated_at?: string
          updated_by?: string | null
          uploader_role?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          penalty_enabled?: boolean
          penalty_for?: string | null
          process_key?: string
          process_name_fa?: string
          reviewer_role?: string | null
          timer_minutes?: number
          updated_at?: string
          updated_by?: string | null
          uploader_role?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      academy_quiz_questions_public: {
        Row: {
          id: string | null
          options: Json | null
          order_index: number | null
          question_text: string | null
          quiz_id: string | null
        }
        Insert: {
          id?: string | null
          options?: Json | null
          order_index?: number | null
          question_text?: string | null
          quiz_id?: string | null
        }
        Update: {
          id?: string | null
          options?: Json | null
          order_index?: number | null
          question_text?: string | null
          quiz_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "academy_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      effective_currencies_view: {
        Row: {
          code: string | null
          is_active: boolean | null
          sort_order: number | null
          symbol: string | null
          title: string | null
        }
        Relationships: []
      }
      employee_monthly_hours: {
        Row: {
          days_present: number | null
          month: string | null
          total_minutes: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presence_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "publish_recipients_view"
            referencedColumns: ["id"]
          },
        ]
      }
      product_computed_prices_public: {
        Row: {
          computed_at: string | null
          final_sale_price: number | null
          id: string | null
          pricing_rule_id: string | null
          product_id: string | null
          rounded_sale_price: number | null
          sale_price_type_id: string | null
          source: string | null
        }
        Insert: {
          computed_at?: string | null
          final_sale_price?: number | null
          id?: string | null
          pricing_rule_id?: string | null
          product_id?: string | null
          rounded_sale_price?: number | null
          sale_price_type_id?: string | null
          source?: string | null
        }
        Update: {
          computed_at?: string | null
          final_sale_price?: number | null
          id?: string | null
          pricing_rule_id?: string | null
          product_id?: string | null
          rounded_sale_price?: number | null
          sale_price_type_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_computed_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_computed_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_computed_prices_sale_price_type_id_fkey"
            columns: ["sale_price_type_id"]
            isOneToOne: false
            referencedRelation: "sale_price_types"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_recipients_view: {
        Row: {
          full_name: string | null
          id: string | null
          roles: string[] | null
        }
        Relationships: []
      }
      v_latest_active_purchase_prices: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"] | null
          effective_at: string | null
          expires_at: string | null
          product_id: string | null
          purchase_price: number | null
          purchase_price_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      v_league_tiers_public: {
        Row: {
          id: string | null
          is_active: boolean | null
          min_level: number | null
          min_xp: number | null
          sort_order: number | null
          tier: Database["public"]["Enums"]["league_tier"] | null
          title_en: string | null
          title_fa: string | null
        }
        Insert: {
          id?: string | null
          is_active?: boolean | null
          min_level?: number | null
          min_xp?: number | null
          sort_order?: number | null
          tier?: Database["public"]["Enums"]["league_tier"] | null
          title_en?: string | null
          title_fa?: string | null
        }
        Update: {
          id?: string | null
          is_active?: boolean | null
          min_level?: number | null
          min_xp?: number | null
          sort_order?: number | null
          tier?: Database["public"]["Enums"]["league_tier"] | null
          title_en?: string | null
          title_fa?: string | null
        }
        Relationships: []
      }
      v_dynamic_customer_capital_balances: {
        Row: {
          allocation_id: string | null
          binding_constraint: string | null
          capital_setting_id: string | null
          consumed_amount: number | null
          created_at: string | null
          customer_id: string | null
          final_limit: number | null
          held_amount: number | null
          raw_allocation: number | null
          remaining_amount: number | null
          salesperson_id: string | null
          share_ratio: number | null
          weighted_score: number | null
        }
        Relationships: []
      }
      v_dynamic_salesperson_capital_balances: {
        Row: {
          allocated_capital: number | null
          allocation_id: string | null
          capital_setting_id: string | null
          consumed_amount: number | null
          created_at: string | null
          held_amount: number | null
          remaining_amount: number | null
          salesperson_id: string | null
          share_ratio: number | null
          weighted_score: number | null
        }
        Relationships: []
      }
      v_pricing_recompute_queue_summary: {
        Row: {
          done_count: number | null
          failed_count: number | null
          latest_error: string | null
          oldest_pending_at: string | null
          pending_count: number | null
          processing_count: number | null
        }
        Relationships: []
      }
      v_promotion_suggestions: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          channel_weight: number | null
          daily_quota: number | null
          label_weight_sum: number | null
          product_id: string | null
          product_name: string | null
          qty_90d: number | null
          recency_factor: number | null
          remaining_today: number | null
          score: number | null
          sku: string | null
          stock_factor: number | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
          used_today: number | null
        }
        Relationships: []
      }
      vw_customer_receivables: {
        Row: {
          commitment_confirmed: boolean | null
          confirmed_paid_amount: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          days_until_due: number | null
          deposit_amount: number | null
          due_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          invoice_status: string | null
          invoice_type: string | null
          is_overdue: boolean | null
          outstanding_amount: number | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_purchase_float: {
        Row: {
          accountant_id: string | null
          actual_days: number | null
          buyer_id: string | null
          cash_price: number | null
          implied_daily_cost: number | null
          paid_at: string | null
          payment_term_id: string | null
          product_id: string | null
          promised_days: number | null
          purchase_date: string | null
          purchase_id: string | null
          purchase_price: number | null
          quantity: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_supplier_payables: {
        Row: {
          cash_price: number | null
          created_at: string | null
          currency: string | null
          days_until_due: number | null
          due_date: string | null
          is_overdue: boolean | null
          is_paid: boolean | null
          outstanding_amount: number | null
          paid_at: string | null
          payment_term_days: number | null
          product_summary: string | null
          purchase_date: string | null
          purchase_id: string | null
          purchase_total_amount: number | null
          supplier_id: string | null
          supplier_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _capital_alloc_used: {
        Args: { p_alloc_id: string; p_kind: string }
        Returns: Record<string, unknown>
      }
      _dyn_compute_row_values: {
        Args: { p_row_id: string; p_table_id: string }
        Returns: Json
      }
      _ensure_credit_balance: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      _latest_active_capital_setting: { Args: never; Returns: string }
      _mi_require_privileged: { Args: never; Returns: undefined }
      _obs_compute_row_values: { Args: { p_row_id: string }; Returns: Json }
      _par_latest_usd_rate: { Args: never; Returns: number }
      add_dynamic_table_column: {
        Args: {
          p_column_key: string
          p_data_type: string
          p_is_editable_by_bot?: boolean
          p_is_filterable?: boolean
          p_is_required?: boolean
          p_label: string
          p_table_id: string
        }
        Returns: string
      }
      add_employee_xp: {
        Args: { _employee_id: string; _xp: number }
        Returns: Json
      }
      add_messenger_group_member: {
        Args: { p_group_id: string; p_role?: string; p_user_id: string }
        Returns: string
      }
      archive_platform_release: {
        Args: { p_id: string }
        Returns: Database["public"]["Tables"]["platform_releases"]["Row"]
      }
      asan_assign_document_number: {
        Args: { _doc_type: string; _source_id: string }
        Returns: number
      }
      asan_assign_document_numbers: {
        Args: { _doc_type: string; _ids: string[] }
        Returns: { source_id: string; asan_number: number }[]
      }
      asan_classify_person_batch: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      asan_classify_product_batch: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      asan_commit_person_batch: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      asan_commit_product_batch: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      asan_list_bank_deposit_export: {
        Args: { _from: string; _to: string }
        Returns: {
          doc_id: string
          doc_label: string | null
          doc_date: string | null
          party_name: string | null
          person_code: string | null
          tracking_number: string | null
          amount: number | null
          bank_code: string | null
          bank_title: string | null
          blocked_reason: string | null
        }[]
      }
      asan_list_journal_export: {
        Args: { _from: string; _to: string; _filter: string }
        Returns: {
          doc_id: string
          doc_label: string | null
          doc_date: string | null
          doc_kind: string | null
          party_name: string | null
          blocked_reason: string | null
          line_no: number | null
          account_code: string | null
          product_code: string | null
          line_description: string | null
          quantity: number | null
          debit: number | null
          credit: number | null
          doc_debit: number | null
          doc_credit: number | null
        }[]
      }
      asan_list_purchase_export: {
        Args: { _from: string; _to: string }
        Returns: {
          doc_id: string
          doc_number: string | null
          doc_date: string | null
          party_name: string | null
          party_phone: string | null
          person_code: string | null
          doc_total: number | null
          blocked_reason: string | null
          line_no: number | null
          product_code: string | null
          product_name: string | null
          product_barcode: string | null
          quantity: number | null
          unit_price: number | null
          line_discount: number | null
          line_total: number | null
          cash_amount: number | null
          bank_amount: number | null
          cheque_amount: number | null
        }[]
      }
      asan_list_sales_export: {
        Args: { _from: string; _to: string }
        Returns: {
          doc_id: string
          doc_number: string | null
          doc_date: string | null
          party_name: string | null
          party_phone: string | null
          person_code: string | null
          doc_total: number | null
          blocked_reason: string | null
          line_no: number | null
          product_code: string | null
          product_name: string | null
          product_barcode: string | null
          quantity: number | null
          unit_price: number | null
          line_discount: number | null
          line_total: number | null
          cash_amount: number | null
          bank_amount: number | null
          cheque_amount: number | null
        }[]
      }
      product_video_advance: {
        Args: { _chain_id: string; _to_stage: string; _note: string | null }
        Returns: Json
      }
      product_video_mark_uploaded: {
        Args: {
          _chain_id: string
          _storage_path: string
          _file_name: string
          _file_size: number
          _mime_type: string
        }
        Returns: Json
      }
      product_videos_waiting: {
        Args: Record<PropertyKey, never>
        Returns: {
          chain_id: string
          quote_id: string
          quote_number: string | null
          customer_name: string | null
          product_name: string | null
          stage: string
          task_id: string | null
          accepted: boolean
          created_at: string
        }[]
      }
      detect_phone_collisions: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      set_messenger_group_member_role: {
        Args: { p_group_id: string; p_user_id: string; p_role: string }
        Returns: undefined
      }
      admin_gamification_overview: { Args: never; Returns: Json }
      api_dynamic_table_query_rows: {
        Args: {
          p_filters?: Json
          p_limit?: number
          p_offset?: number
          p_table_slug: string
        }
        Returns: Json
      }
      api_dynamic_table_update_cell: {
        Args: {
          p_column_key: string
          p_row_id: string
          p_table_slug: string
          p_value: string
        }
        Returns: Json
      }
      approve_currency_fetch: {
        Args: { p_deactivate_previous?: boolean; p_fetch_id: string }
        Returns: string
      }
      approve_pending_user: {
        Args: {
          _position?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      assign_user_role_txt: {
        Args: { _role: string; _target_user: string }
        Returns: undefined
      }
      auto_submit_penalty: {
        Args: {
          p_description: string
          p_inquiry_id: string
          p_severity: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      award_xp_from_score: { Args: { _employee_id: string }; Returns: Json }
      bot_authenticate_key: {
        Args: { p_raw_key: string }
        Returns: {
          key_id: string
          name: string
        }[]
      }
      bot_check_rate_limit: {
        Args: { p_ip: string; p_key_id: string }
        Returns: {
          ok: boolean
          reason: string
          retry_after_seconds: number
        }[]
      }
      bot_create_table_row: {
        Args: { p_key_id: string; p_table_id: string; p_values: Json }
        Returns: {
          out_created_at: string
          out_is_active: boolean
          out_row_id: string
          out_row_number: number
          out_updated_at: string
          out_values: Json
        }[]
      }
      bot_get_product_for_key: {
        Args: { p_key_id: string; p_product_id: string }
        Returns: Json
      }
      bot_key_stats_today: {
        Args: never
        Returns: {
          api_key_id: string
          errors_today: number
          last_used_at: string
          requests_today: number
        }[]
      }
      bot_list_products_for_key: {
        Args: {
          p_key_id: string
          p_label_id?: string
          p_page?: number
          p_page_size?: number
          p_updated_since?: string
        }
        Returns: {
          product: Json
          total_count: number
        }[]
      }
      bot_query_table_rows: {
        Args: {
          p_key_id: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_table_id: string
        }
        Returns: {
          out_created_at: string
          out_is_active: boolean
          out_row_id: string
          out_row_number: number
          out_updated_at: string
          out_values: Json
          total_count: number
        }[]
      }
      bot_suspicious_ips: {
        Args: { p_limit?: number }
        Returns: {
          distinct_endpoints: number
          failed_count: number
          ip: string
          last_attempt_at: string
        }[]
      }
      bot_update_table_row: {
        Args: {
          p_key_id: string
          p_row_id: string
          p_table_id: string
          p_values: Json
        }
        Returns: {
          applied_keys: string[]
          updated_count: number
        }[]
      }
      bot_upsert_table_row: {
        Args: {
          p_key_id: string
          p_table_id: string
          p_unique_by: string[]
          p_values: Json
        }
        Returns: {
          out_created_at: string
          out_is_active: boolean
          out_mode: string
          out_row_id: string
          out_row_number: number
          out_updated_at: string
          out_values: Json
        }[]
      }
      calc_xp_for_level: { Args: { _level: number }; Returns: number }
      calculate_adjusted_price: {
        Args: { _product_id: string }
        Returns: number
      }
      calculate_credit_score: {
        Args: { _customer_id: string }
        Returns: {
          credit_limit: number
          params: Json
          score: number
        }[]
      }
      calculate_customer_realtime_credit: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      calculate_dynamic_score: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_period_month?: string
        }
        Returns: Json
      }
      calculate_employee_score: {
        Args: { _employee_id?: string }
        Returns: undefined
      }
      calculate_salesperson_collected_sales: {
        Args: { p_employee_id: string; p_window_months?: number }
        Returns: {
          collected_amount: number
          employee_id: string
          linked_invoice_count: number
          qualifying_receipt_count: number
          window_months: number
          window_start: string
        }[]
      }
      can_issue_customer_invoice: {
        Args: { p_customer_id: string }
        Returns: {
          can_issue: boolean
          customer_id: string
          oldest_due_date: string
          overdue_amount: number
          overdue_count: number
          reason: string
        }[]
      }
      can_use_customer_capital_allocation: {
        Args: { p_amount: number; p_customer_id: string }
        Returns: {
          available: number
          can_use: boolean
          customer_allocation_id: string
          reason: string
          salesperson_allocation_id: string
        }[]
      }
      cancel_invoice: { Args: { p_invoice_id: string }; Returns: Json }
      capture_score_snapshots: { Args: never; Returns: number }
      check_and_unlock_achievements_for_employee: {
        Args: { _employee_id: string; _event_type: string }
        Returns: Json
      }
      check_and_update_mission_progress_for_employee: {
        Args: { _employee_id: string; _event_type: string }
        Returns: Json
      }
      check_price_alerts_for_product: {
        Args: {
          p_change_percent?: number
          p_current_price: number
          p_previous_price?: number
          p_product_id: string
          p_sale_price_type_id: string
        }
        Returns: number
      }
      claim_next_quote_send_queue_item: {
        Args: never
        Returns: {
          attempts: number
          channel: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          message_text: string | null
          pdf_attached: boolean
          processed_at: string | null
          quote_id: string
          recipient: string
          scheduled_at: string
          share_log_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_quote_send_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_pricing_recompute_jobs: {
        Args: { _batch_size?: number; _max_attempts?: number }
        Returns: {
          attempts: number
          created_by: string | null
          enqueued_at: string
          error: string | null
          id: string
          priority: number
          processed_at: string | null
          product_id: string
          reason: string
          sale_price_type_id: string | null
          source_id: string | null
          source_table: string | null
          started_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pricing_recompute_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_stale_auto_suppliers: { Args: never; Returns: number }
      complete_invoice_task: { Args: { p_task_id: string }; Returns: undefined }
      complete_quote_send_queue_item: {
        Args: { p_error?: string; p_queue_id: string; p_success: boolean }
        Returns: {
          attempts: number
          channel: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          message_text: string | null
          pdf_attached: boolean
          processed_at: string | null
          quote_id: string
          recipient: string
          scheduled_at: string
          share_log_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_quote_send_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_daily_capital: {
        Args: { p_capital_date?: string }
        Returns: {
          bank_balance: number
          blocked_funds: number
          capital_date: string
          cash_balance: number
          due_today_payables: number
          due_today_receivables: number
          external_payables: number
          external_receivables: number
          formula_version: string
          future_payables: number
          future_receivables: number
          incoming_checks: number
          input_id: string
          inventory_liquidity_value: number
          manual_adjustment: number
          near_term_expenses: number
          outgoing_checks: number
          overdue_payables: number
          overdue_receivables: number
          risk_reserve: number
          system_suggested_capital: number
          total_payables: number
          total_receivables: number
        }[]
      }
      compute_promotion_scores: {
        Args: { _channel_id?: string; _limit?: number; _min_score?: number }
        Returns: {
          channel_id: string | null
          channel_name: string | null
          channel_weight: number | null
          daily_quota: number | null
          label_weight_sum: number | null
          product_id: string | null
          product_name: string | null
          qty_90d: number | null
          recency_factor: number | null
          remaining_today: number | null
          score: number | null
          sku: string | null
          stock_factor: number | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
          used_today: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "v_promotion_suggestions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_capital_allocation: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_invoice_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      create_bot_api_key: {
        Args: { p_expires_at?: string; p_name: string }
        Returns: {
          id: string
          key_prefix: string
          raw_key: string
        }[]
      }
      create_custom_role: {
        Args: { _description?: string; _display_name?: string; _name: string }
        Returns: string
      }
      create_delivery_receipt: {
        Args: {
          p_customer_id?: string
          p_file_name: string
          p_file_size: number
          p_invoice_id?: string
          p_mime_type: string
          p_notes?: string
          p_storage_path: string
          p_type: string
        }
        Returns: string
      }
      create_document: {
        Args: {
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_notes?: string
          p_reference_id?: string
          p_reference_type?: string
          p_storage_path: string
          p_type: string
        }
        Returns: string
      }
      create_dynamic_scoring_parameter: {
        Args: {
          _code: string
          _direction: string
          _label_fa: string
          _weight: number
        }
        Returns: string
      }
      create_dynamic_table_row: {
        Args: { p_table_id: string; p_values: Json }
        Returns: string
      }
      create_inquiry: {
        Args: {
          p_assigned_to: string
          p_group_id: string
          p_product_id: string
        }
        Returns: string
      }
      create_manual_penalty: {
        Args: {
          p_description?: string
          p_severity: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_messenger_group: {
        Args: { p_name: string; p_type: string }
        Returns: string
      }
      create_purchase_request: {
        Args: {
          p_assigned_to?: string
          p_expected_price?: number
          p_inquiry_id?: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_unit: string
        }
        Returns: Json
      }
      create_sales_quote_with_items: {
        Args: {
          p_below_list_ack?: boolean
          p_commitment_confirmed?: boolean
          p_customer_id?: string
          p_customer_name: string
          p_customer_note: string
          p_customer_phone: string
          p_deposit_amount?: number
          p_discount_amount: number
          p_expires_at: string
          p_final_amount: number
          p_items: Json
          p_quote_exception_amount?: number
          p_quote_exception_minutes?: number
          p_quote_exception_text?: string
          p_quote_exception_type?: string
          p_settlement_type_id?: string
          p_subtotal_amount: number
          p_visitor_id?: string
          p_warehouse_id?: string
        }
        Returns: Json
      }
      create_waybill_for_invoice: {
        Args: {
          p_customer_accounting_code?: string
          p_destination_address?: string
          p_destination_city: string
          p_invoice_id: string
          p_receiver_name: string
          p_receiver_phone: string
          p_register?: boolean
          p_sender_name: string
          p_sender_phone: string
          p_shipping_company: string
          p_shipping_notes?: string
        }
        Returns: string
      }
      create_waybills_batch: {
        Args: { p_invoice_id: string; p_register?: boolean; p_waybills: Json }
        Returns: string[]
      }
      customer_clear_person: {
        Args: { p_customer_id: string; p_note?: string }
        Returns: boolean
      }
      customer_set_person: {
        Args: { p_customer_id: string; p_note?: string; p_person_id: string }
        Returns: string
      }
      deactivate_messenger_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      deactivate_user: { Args: { _user_id: string }; Returns: undefined }
      delete_bot_api_key_secure: {
        Args: { _key_id: string; _reason: string }
        Returns: boolean
      }
      delete_bot_api_key_table_access: {
        Args: { p_key_id: string; p_table_id: string }
        Returns: undefined
      }
      dyn_table_role_can_view:
        | {
            Args: { _access_level: string; _user_id: string }
            Returns: boolean
          }
        | {
            Args: {
              _access_level: string
              _allowed_roles: Json
              _user_id: string
            }
            Returns: boolean
          }
      enqueue_pricing_recompute: {
        Args: {
          _priority?: number
          _product_ids: string[]
          _reason: string
          _sale_price_type_id?: string
          _source_id?: string
          _source_table?: string
        }
        Returns: number
      }
      expire_pending_delivery_receipts: { Args: never; Returns: undefined }
      expire_pending_documents: { Args: never; Returns: undefined }
      export_dynamic_table_rows: {
        Args: {
          p_filters?: Json
          p_limit?: number
          p_search?: string
          p_show_inactive?: boolean
          p_table_id: string
        }
        Returns: {
          exported_count: number
          out_created_at: string
          out_is_active: boolean
          out_row_id: string
          out_row_number: number
          out_values: Json
          total_count: number
        }[]
      }
      find_duplicate_product: {
        Args: {
          p_brand_id: string
          p_capacity: string
          p_category_id: string
          p_color: string
          p_exclude_id?: string
          p_model: string
        }
        Returns: {
          id: string
          name: string
          sku: string
        }[]
      }
      find_or_create_model: {
        Args: { p_category_id: string; p_name: string }
        Returns: {
          category_id: string
          id: string
          name: string
        }[]
      }
      finish_market_rate_ingestion_run: {
        Args: {
          p_error?: string
          p_fetched: number
          p_inserted: number
          p_run_id: string
          p_status: string
          p_suspect: number
        }
        Returns: undefined
      }
      finish_market_rate_ingestion_run_system: {
        Args: {
          p_error?: string
          p_fetched: number
          p_inserted: number
          p_run_id: string
          p_status: string
          p_suspect: number
        }
        Returns: undefined
      }
      gamification_analytics_achievements: {
        Args: { p_from: string; p_to: string }
        Returns: {
          achievement_id: string
          enabled: boolean
          last_unlock: string
          title_fa: string
          unlocks: number
          xp_reward: number
        }[]
      }
      gamification_analytics_active_season: {
        Args: never
        Returns: {
          ends_at: string
          id: string
          starts_at: string
          title_fa: string
        }[]
      }
      gamification_analytics_employees: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      gamification_analytics_kpi_effectiveness: {
        Args: { p_from: string; p_to: string }
        Returns: {
          event_key: string
          events_count: number
          is_active: boolean
          title_fa: string
          xp_amount: number
        }[]
      }
      gamification_analytics_league_distribution: {
        Args: never
        Returns: {
          employees_count: number
          league: string
        }[]
      }
      gamification_analytics_missions: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_progress: number
          completions: number
          enabled: boolean
          mission_id: string
          title_fa: string
          unique_employees: number
          xp_reward: number
        }[]
      }
      gamification_analytics_risk: {
        Args: { p_from: string; p_limit?: number; p_to: string }
        Returns: {
          current_league: string
          employee_id: string
          events_in_window: number
          full_name: string
          last_event_at: string
          status: string
        }[]
      }
      gamification_analytics_summary: {
        Args: {
          p_employee_id?: string
          p_event_type?: string
          p_from: string
          p_to: string
        }
        Returns: {
          active_employees: number
          avg_events_per_employee: number
          total_achievements: number
          total_events: number
          total_missions_completed: number
        }[]
      }
      gamification_analytics_top_employees: {
        Args: {
          p_event_type?: string
          p_from: string
          p_limit?: number
          p_to: string
        }
        Returns: {
          achievements_count: number
          current_league: string
          employee_id: string
          events_count: number
          full_name: string
          missions_count: number
        }[]
      }
      gamification_analytics_trend: {
        Args: {
          p_employee_id?: string
          p_event_type?: string
          p_from: string
          p_to: string
        }
        Returns: {
          cnt: number
          day: string
          event_type: string
        }[]
      }
      gamification_assert_manager: { Args: never; Returns: undefined }
      generate_birthday_notifications: {
        Args: never
        Returns: {
          created_count: number
        }[]
      }
      generate_sale_price_type_code: { Args: never; Returns: string }
      get_current_league: { Args: { _employee_id: string }; Returns: Json }
      get_customer_credit: {
        Args: { p_customer_id: string }
        Returns: {
          available_credit: number
          has_overdue: boolean
          held_credit: number
          outstanding_balance: number
          overdue_since: string
          settlement_score: number
          total_purchases: number
        }[]
      }
      get_customer_dynamic_credit: {
        Args: { p_customer_id: string }
        Returns: {
          available_credit: number
          binding_constraint: string
          capital_date: string
          final_limit: number
          has_allocation: boolean
          has_overdue: boolean
          held_credit: number
          is_today: boolean
          outstanding_balance: number
          overdue_since: string
          settlement_score: number
          total_purchases: number
        }[]
      }
      get_delivery_receipts: {
        Args: {
          p_invoice_id?: string
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_type?: string
        }
        Returns: {
          created_at: string
          customer_id: string
          file_name: string
          file_size: number
          id: string
          invoice_id: string
          notes: string
          review_deadline: string
          reviewed_at: string
          reviewed_by: string
          reviewer_name: string
          status: string
          storage_path: string
          type: string
          uploaded_by: string
          uploader_name: string
        }[]
      }
      get_documents: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_type?: string
        }
        Returns: {
          created_at: string
          file_name: string
          file_size: number
          id: string
          notes: string
          reference_id: string
          reference_type: string
          review_deadline: string
          reviewed_at: string
          reviewed_by: string
          reviewer_name: string
          status: string
          storage_path: string
          type: string
          uploaded_by: string
          uploader_name: string
        }[]
      }
      get_employee_progress: { Args: { _employee_id: string }; Returns: Json }
      get_employee_rank: {
        Args: { _employee_id?: string }
        Returns: {
          all_time_rank: number
          daily_rank: number
          daily_score: number
          employee_id: string
          monthly_rank: number
          monthly_score: number
          total_score: number
          weekly_rank: number
          weekly_score: number
        }[]
      }
      get_kpi_xp: {
        Args: { p_default: number; p_event_key: string }
        Returns: number
      }
      get_leaderboard: {
        Args: {
          _department?: string
          _limit?: number
          _offset?: number
          _period?: string
          _role?: string
          _team?: string
        }
        Returns: {
          department: string
          employee_id: string
          full_name: string
          rank: number
          role: string
          score: number
          team: string
        }[]
      }
      get_leaderboard_all_time: {
        Args: {
          _department?: string
          _limit?: number
          _offset?: number
          _role?: string
          _team?: string
        }
        Returns: {
          department: string
          employee_id: string
          full_name: string
          rank: number
          role: string
          score: number
          team: string
        }[]
      }
      get_leaderboard_daily: {
        Args: {
          _department?: string
          _limit?: number
          _offset?: number
          _role?: string
          _team?: string
        }
        Returns: {
          department: string
          employee_id: string
          full_name: string
          rank: number
          role: string
          score: number
          team: string
        }[]
      }
      get_leaderboard_monthly: {
        Args: {
          _department?: string
          _limit?: number
          _offset?: number
          _role?: string
          _team?: string
        }
        Returns: {
          department: string
          employee_id: string
          full_name: string
          rank: number
          role: string
          score: number
          team: string
        }[]
      }
      get_leaderboard_weekly: {
        Args: {
          _department?: string
          _limit?: number
          _offset?: number
          _role?: string
          _team?: string
        }
        Returns: {
          department: string
          employee_id: string
          full_name: string
          rank: number
          role: string
          score: number
          team: string
        }[]
      }
      get_league_leaderboard: {
        Args: {
          _league: Database["public"]["Enums"]["league_tier"]
          _limit?: number
          _offset?: number
        }
        Returns: {
          demoted: boolean
          employee_id: string
          full_name: string
          league: Database["public"]["Enums"]["league_tier"]
          promoted: boolean
          rank: number
          score: number
        }[]
      }
      get_numeric_setting: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      get_observatory_pdf_hints_for_products: {
        Args: { p_product_ids: string[] }
        Returns: {
          has_price_advantage: boolean
          product_id: string
        }[]
      }
      get_observatory_snippets_for_products: {
        Args: { p_product_ids: string[] }
        Returns: {
          competitive_price_status: string
          product_id: string
          sales_opportunity_score: number
          suggested_sales_message: string
        }[]
      }
      get_payable_detail: {
        Args: { p_purchase_id?: string; p_supplier_id?: string }
        Returns: {
          cash_price: number
          currency: string
          due_date: string
          is_overdue: boolean
          is_paid: boolean
          item_id: string
          item_line_total: number
          item_quantity: number
          item_unit_price: number
          outstanding_amount: number
          paid_at: string
          payment_term_days: number
          product_id: string
          product_name: string
          purchase_date: string
          purchase_id: string
          purchase_total_amount: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      get_payables_list: {
        Args: {
          p_due_filter?: string
          p_from_date?: string
          p_include_paid?: boolean
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_supplier_id?: string
          p_to_date?: string
        }
        Returns: {
          cash_price: number
          created_at: string
          currency: string
          days_until_due: number
          due_date: string
          is_overdue: boolean
          is_paid: boolean
          outstanding_amount: number
          paid_at: string
          payment_term_days: number
          product_summary: string
          purchase_date: string
          purchase_id: string
          purchase_total_amount: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      get_payables_summary: {
        Args: {
          p_from_date?: string
          p_supplier_id?: string
          p_to_date?: string
        }
        Returns: {
          due_today: number
          due_tomorrow: number
          future_outstanding: number
          items_count: number
          overdue_outstanding: number
          total_outstanding: number
        }[]
      }
      get_product_price_bounds: {
        Args: { _product_id: string; _sale_price_type_id?: string }
        Returns: {
          cap_price: number
          has_any: boolean
          max_price: number
          min_price: number
          selected_price: number
        }[]
      }
      get_product_recommendations: {
        Args: { p_product_id: string }
        Returns: {
          brand_name: string
          category_name: string
          current_price: number
          is_pinned: boolean
          name: string
          product_id: string
          reason: string
          recommendation_score: number
          sku: string
          stock_status: string
        }[]
      }
      get_product_sale_price: {
        Args: { _product_id: string; _sale_price_type_id?: string }
        Returns: number
      }
      get_product_stats: { Args: { p_product_id: string }; Returns: Json }
      get_product_timeline: {
        Args: { p_limit?: number; p_offset?: number; p_product_id: string }
        Returns: {
          actor_id: string
          actor_name: string
          amount: number
          description: string
          event_time: string
          event_type: string
          reference_id: string
          reference_type: string
        }[]
      }
      assign_purchase_request: {
        Args: {
          p_assignee_id?: string
          p_expect_provided?: boolean
          p_expected_current_assignee_id?: string
          p_note?: string
          p_request_id: string
        }
        Returns: Json
      }
      get_default_purchase_assignee: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_purchase_assignee_options: {
        Args: Record<PropertyKey, never>
        Returns: {
          full_name: string
          is_default: boolean
          roles: string[]
          user_id: string
        }[]
      }
      is_valid_purchase_assignee: {
        Args: { _user: string }
        Returns: boolean
      }
      set_default_purchase_assignee: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      get_purchase_requests: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_product_id?: string
          p_status?: string
          p_unassigned_only?: boolean
        }
        Returns: {
          assigned_to: string
          assignee_name: string
          created_at: string
          effective_supplied: number
          expected_price: number
          final_price: number
          fulfillment_state: string
          has_over_allocation: boolean
          id: string
          inquiry_id: string
          legacy_no_fulfillment: boolean
          notes: string
          product_id: string
          product_name: string
          purchase_count: number
          purchase_summaries: Json
          quantity: number
          receipt_count: number
          remaining_quantity: number
          requested_by: string
          requester_name: string
          status: string
          supplied_quantity: number
          unit: string
        }[]
      }
      get_rank_neighbors: {
        Args: { _employee_id: string; _period?: string; _window?: number }
        Returns: {
          employee_id: string
          full_name: string
          rank: number
          relative_position: string
          score: number
        }[]
      }
      get_receivable_detail: {
        Args: { p_customer_id?: string; p_invoice_id?: string }
        Returns: {
          confirmed_paid_amount: number
          customer_id: string
          customer_name: string
          customer_phone: string
          deposit_amount: number
          due_date: string
          invoice_id: string
          invoice_number: string
          invoice_status: string
          invoice_type: string
          is_overdue: boolean
          issue_date: string
          outstanding_amount: number
          receipt_amount: number
          receipt_bank_name: string
          receipt_id: string
          receipt_payment_date: string
          receipt_status: string
          receipt_tracking_number: string
          total_amount: number
        }[]
      }
      get_receivables_list: {
        Args: {
          p_customer_id?: string
          p_due_filter?: string
          p_from_date?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_to_date?: string
        }
        Returns: {
          confirmed_paid_amount: number
          created_at: string
          customer_id: string
          customer_name: string
          days_until_due: number
          deposit_amount: number
          due_date: string
          invoice_id: string
          invoice_number: string
          invoice_status: string
          invoice_type: string
          is_overdue: boolean
          outstanding_amount: number
          total_amount: number
        }[]
      }
      get_receivables_summary: {
        Args: {
          p_customer_id?: string
          p_from_date?: string
          p_to_date?: string
        }
        Returns: {
          due_today: number
          due_tomorrow: number
          future_outstanding: number
          items_count: number
          overdue_outstanding: number
          total_outstanding: number
        }[]
      }
      get_recent_purchase_label: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_sales_search_products: {
        Args: {
          p_brand_ids?: string[]
          p_category_ids?: string[]
          p_label_ids?: string[]
          p_limit?: number
          p_offset?: number
          p_only_with_price?: boolean
          p_product_type?: string
          p_search?: string
          p_stock_status?: string
        }
        Returns: {
          barcode: string
          brand: Json
          capacity: string
          category: Json
          color: string
          description: string
          has_purchase_price: boolean
          id: string
          is_unavailable_for_sales: boolean
          labels: Json
          model: string
          name: string
          prices: Json
          primary_spec: string
          product_type: string
          sku: string
          stock_status: string
        }[]
      }
      get_user_penalties: {
        Args: { p_user_id?: string }
        Returns: {
          appeal_status: string
          can_appeal: boolean
          created_at: string
          description: string
          has_appeal: boolean
          id: string
          inquiry_id: string
          is_active: boolean
          severity: string
          type: string
        }[]
      }
      get_workflow_setting: {
        Args: { p_process_key: string }
        Returns: {
          id: string
          is_active: boolean
          penalty_enabled: boolean
          penalty_for: string | null
          process_key: string
          process_name_fa: string
          reviewer_role: string | null
          timer_minutes: number
          updated_at: string
          updated_by: string | null
          uploader_role: string | null
        }
        SetofOptions: {
          from: "*"
          to: "workflow_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_workflow_settings: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          penalty_enabled: boolean
          penalty_for: string | null
          process_key: string
          process_name_fa: string
          reviewer_role: string | null
          timer_minutes: number
          updated_at: string
          updated_by: string | null
          uploader_role: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_any_role:
        | {
            Args: {
              _roles: Database["public"]["Enums"]["app_role"][]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _roles: string[]; _user_id: string }; Returns: boolean }
      has_dynamic_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      hold_capital_allocation: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_invoice_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      hold_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_invoice_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      import_dynamic_table_rows: {
        Args: { p_rows: Json; p_session_id?: string; p_table_id: string }
        Returns: Json
      }
      increase_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_receipt_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_appellant_of_appeal: {
        Args: { _appeal_id: string; _user: string }
        Returns: boolean
      }
      is_board_approved: {
        Args: { _board_key: string; _user_id: string }
        Returns: boolean
      }
      is_board_manager: { Args: { _user_id: string }; Returns: boolean }
      is_hr_manager: { Args: { _user_id: string }; Returns: boolean }
      is_messenger_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_product_owner: {
        Args: { _product_id: string; _user_id: string }
        Returns: boolean
      }
      is_reviewer_of_appeal: {
        Args: { _appeal_id: string; _user: string }
        Returns: boolean
      }
      is_user_online: { Args: { _user_id: string }; Returns: boolean }
      is_valid_audit_entity_type: {
        Args: { _entity_type: string }
        Returns: boolean
      }
      kd_role_can_view: {
        Args: { _access_level: string; _uid: string }
        Returns: boolean
      }
      league_tier_from_index: {
        Args: { _idx: number }
        Returns: Database["public"]["Enums"]["league_tier"]
      }
      league_tier_index: {
        Args: { _tier: Database["public"]["Enums"]["league_tier"] }
        Returns: number
      }
      list_market_rate_ticks_public: {
        Args: { p_indicator_id?: string; p_limit?: number }
        Returns: {
          change_amount: number
          change_percent: number
          id: string
          indicator_id: string
          jalali_date_label: string
          observed_at: string
          source_id: string
          status: string
          unit: string
          value: number
        }[]
      }
      log_event: {
        Args: {
          _action: string
          _diff?: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: undefined
      }
      log_invoice_issuance_blocked_overdue: {
        Args: {
          p_commitment_confirmed?: boolean
          p_customer_id: string
          p_invoice_type?: string
          p_oldest_due_date: string
          p_overdue_amount: number
          p_overdue_count: number
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      messenger_attachment_path_owner: {
        Args: { _name: string }
        Returns: boolean
      }
      messenger_attachment_size_ok: {
        Args: { _name: string; _size: number }
        Returns: boolean
      }
      messenger_attachment_visible: {
        Args: { _name: string; _uid: string }
        Returns: boolean
      }
      mi_get_demand_growth: {
        Args: { p_days?: number }
        Returns: {
          current_event_count: number
          current_score: number
          growth_percent: number
          previous_event_count: number
          previous_score: number
          range_days: number
          status: string
        }[]
      }
      mi_get_emerging_products: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          brand: Json
          category: Json
          current_score: number
          growth_percent: number
          name: string
          previous_score: number
          product_id: string
          sku: string
          stock_status: string
        }[]
      }
      mi_get_hot_brands: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          brand_id: string
          brand_name: string
          growth_percent: number
          interaction_count: number
          previous_count: number
          unique_product_count: number
        }[]
      }
      mi_get_hot_categories: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          category_id: string
          category_name: string
          growth_percent: number
          interaction_count: number
          previous_count: number
          unique_product_count: number
        }[]
      }
      mi_get_market_index: {
        Args: { p_days?: number }
        Returns: {
          falling_count: number
          flat_count: number
          index_change_percent: number
          product_count: number
          range_days: number
          rising_count: number
          status: string
        }[]
      }
      mi_get_price_movers: {
        Args: {
          p_days?: number
          p_direction?: string
          p_limit?: number
          p_sale_price_type_id?: string
        }
        Returns: {
          brand: Json
          category: Json
          change_amount: number
          change_percent: number
          end_price: number
          name: string
          product_id: string
          sale_price_type_id: string
          sale_price_type_title: string
          sku: string
          start_price: number
          stock_status: string
        }[]
      }
      mi_get_seller_favorite_products: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          brand: Json
          category: Json
          current_price: number
          interaction_count: number
          last_interaction_at: string
          name: string
          product_id: string
          sku: string
          stock_status: string
        }[]
      }
      mi_get_seller_top_products: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          brand: Json
          category: Json
          last_interaction_at: string
          name: string
          product_id: string
          seller_interaction_count: number
          sku: string
          stock_status: string
          unique_seller_count: number
        }[]
      }
      mi_get_top_checked_today: {
        Args: { p_limit?: number }
        Returns: {
          brand: Json
          category: Json
          current_price: number
          last_interaction_at: string
          name: string
          price_check_count: number
          product_id: string
          sku: string
          stock_status: string
          unique_user_count: number
        }[]
      }
      mi_get_trending_products: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          board_view_count: number
          brand: Json
          category: Json
          change_percent: number
          chart_view_count: number
          current_price: number
          name: string
          previous_price: number
          price_view_count: number
          product_id: string
          search_count: number
          sku: string
          stock_status: string
          trend_score: number
        }[]
      }
      next_product_sku: { Args: { _year: number }; Returns: string }
      next_sales_quote_number: { Args: { _year: number }; Returns: string }
      normalize_fa: { Args: { input: string }; Returns: string }
      normalize_fa_text: { Args: { input: string }; Returns: string }
      person_create_full: {
        Args: {
          p_context_kind?: string | null
          p_context_note?: string | null
          p_context_ref_id?: string | null
          p_context_ref_table?: string | null
          p_display_name: string
          p_field_values?: Json
          p_identifiers?: Json
          p_is_active?: boolean
          p_kind?: string
          p_legal_name?: string | null
          p_notes?: string | null
          p_visibility_scope?: string
        }
        Returns: Json
      }
      person_backfill_existing: {
        Args: {
          p_default_kind?: string | null
          p_limit?: number | null
          p_table: string
        }
        Returns: Json
      }
      person_create_inline: {
        Args: {
          p_accounting_code?: string | null
          p_city?: string | null
          p_context_kind: string
          p_display_name: string
          p_identifiers?: Json
          p_kind?: string
          /**
           * Migration 232 (Phase 6.1): fields that live only on the legacy
           * suppliers/customers row. Applied through a per-table whitelist —
           * suppliers: contact_name, trust_level, status; customers:
           * responsible_id, link_group, birth_date. Unknown keys are ignored.
           */
          p_legacy_fields?: Json
          p_notes?: string | null
          p_visibility_scope?: string
        }
        Returns: Json
      }
      person_find_by_identifiers: {
        Args: { p_identifiers: Json }
        Returns: Json
      }
      /**
       * Migration 231 (Phase 5). Returns one row per table whose derived
       * *_person_id column disagrees with its legacy FK. An empty result is
       * the healthy state.
       */
      person_fk_drift_report: {
        Args: Record<PropertyKey, never>
        Returns: {
          drifted_rows: number
          table_name: string
        }[]
      }
      /**
       * Issue 219 (migration 251). Atomically creates a purchase document and
       * its line in one transaction, replacing the two client-side inserts.
       * All existing triggers (inventory, audit, gamification, supplier person
       * derivation) still fire. Validation, permission and derived values are
       * enforced server-side; created_by comes from auth.uid(). Admin/manager
       * only, mirroring the RLS policy on purchases.
       *
       * The p_request_id family is reserved for the request-linking phase and
       * is currently rejected.
       */
      create_purchase: {
        Args: {
          p_product_id: string
          p_payment_term_id: string
          p_purchase_price: number
          p_currency: string
          p_quantity: number
          p_purchase_date: string
          p_supplier_id?: string | null
          p_cash_price?: number | null
          p_warehouse_id?: string | null
          p_notes?: string | null
          p_request_id?: string | null
          p_allocate_quantity?: number | null
          p_allow_over_allocation?: boolean | null
          p_over_allocation_note?: string | null
          p_idempotency_key?: string | null
        }
        Returns: Json
      }
      person_import_batch: {
        Args: { p_rows: Json }
        Returns: Json
      }
      /**
       * Migration 239 (Phase 8.1). Merges the losing person into the winning
       * one: repoints every FK referencing persons, moves identifiers/aliases/
       * context links with de-duplication, deactivates the loser and writes a
       * person_merge_log row. Raises when both sides own a customer or both own
       * a supplier. Admin/manager only.
       */
      person_merge: {
        Args: { p_loser_id: string; p_reason?: string | null; p_winner_id: string }
        Returns: Json
      }
      /**
       * Migration 239b (Phase 8.1). Read-only evidence feed for the duplicate
       * review page: both sides of every pending candidate pair, with
       * identifiers, aliases, contexts, ownership flags, reference counts and
       * blocked_reason when person_merge's cardinality guard would refuse.
       */
      person_merge_candidates_overview: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      /**
       * Migration 239 (Phase 8.1). Marks a candidate pair as dismissed - a
       * human confirmed the two records are different people. Mutates no
       * person data. Admin/manager only.
       */
      person_merge_dismiss: {
        Args: { p_candidate_id: string; p_reason?: string | null }
        Returns: Json
      }
      search_visible_persons: {
        Args: {
          p_query?: string | null
          p_limit?: number
          p_offset?: number
          p_kind?: string | null
          p_context_kinds?: string[] | null
          p_active_status?: string | null
          p_missing_identifier_kinds?: string[] | null
        }
        Returns: {
          id: string
          kind: string
          display_name: string
          legal_name: string | null
          visibility_scope: string
          is_active: boolean
          created_at: string
          updated_at: string
          matched_by: string | null
          total_count: number
        }[]
      }
      post_receipt_accounting: {
        Args: { p_receipt_id: string; p_user_id: string }
        Returns: Json
      }
      post_receipt_journal: { Args: { _receipt_id: string }; Returns: string }
      preview_league_season_changes: {
        Args: { _season_id: string }
        Returns: {
          current_tier: Database["public"]["Enums"]["league_tier"]
          employee_id: string
          full_name: string
          rank_in_tier: number
          score: number
          suggested_action: string
          target_tier: Database["public"]["Enums"]["league_tier"]
        }[]
      }
      query_dynamic_table_rows: {
        Args: {
          p_filters?: Json
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_show_inactive?: boolean
          p_table_id: string
        }
        Returns: {
          out_created_at: string
          out_is_active: boolean
          out_row_id: string
          out_row_number: number
          out_values: Json
          total_count: number
        }[]
      }
      query_dynamic_table_rows_v2: {
        Args: {
          p_filters?: Json
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_show_inactive?: boolean
          p_table_id: string
        }
        Returns: {
          out_created_at: string
          out_is_active: boolean
          out_row_id: string
          out_row_number: number
          out_values: Json
          total_count: number
        }[]
      }
      publish_platform_release: {
        Args: { p_id: string }
        Returns: Database["public"]["Tables"]["platform_releases"]["Row"]
      }
      quick_approve_user: {
        Args: { _role?: string; _user_id: string }
        Returns: undefined
      }
      reactivate_user: { Args: { _user_id: string }; Returns: undefined }
      recalculate_settlement_score: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      recompute_all_employee_scores: { Args: never; Returns: number }
      recompute_customer_credit_scores: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          credit_limit: number
          customer_id: string
          error: string
          score: number
          status: string
        }[]
      }
      record_currency_fetch: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_note?: string
          p_rate: number
          p_source_id: string
        }
        Returns: string
      }
      record_external_market_rate_tick: {
        Args: {
          p_indicator_id: string
          p_observed_at: string
          p_raw_payload?: Json
          p_source_id: string
          p_source_reported_at?: string
          p_unit?: string
          p_value: number
        }
        Returns: {
          status_out: string
          tick_id: string
        }[]
      }
      record_external_market_rate_tick_system: {
        Args: {
          p_indicator_id: string
          p_observed_at: string
          p_raw_payload?: Json
          p_source_id: string
          p_source_reported_at?: string
          p_unit?: string
          p_value: number
        }
        Returns: {
          status_out: string
          tick_id: string
        }[]
      }
      record_market_rate_tick: {
        Args: {
          p_indicator_id: string
          p_note?: string
          p_observed_at: string
          p_source_id: string
          p_status?: string
          p_unit?: string
          p_value: number
        }
        Returns: string
      }
      refresh_all_sale_list_prices: { Args: never; Returns: undefined }
      refresh_sale_list_prices: {
        Args: { p_list_id: string }
        Returns: undefined
      }
      refund_capital_allocation: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_invoice_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      reject_currency_fetch: {
        Args: { p_fetch_id: string; p_reason?: string }
        Returns: undefined
      }
      reject_pending_user: {
        Args: { _notes?: string; _user_id: string }
        Returns: undefined
      }
      release_capital_allocation: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_invoice_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      release_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_invoice_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      release_stale_quote_send_locks: { Args: never; Returns: number }
      reorder_dynamic_table_columns: {
        Args: { p_ordered_ids: string[]; p_table_id: string }
        Returns: undefined
      }
      reply_inquiry: {
        Args: { p_inquiry_id: string; p_note?: string; p_price: number }
        Returns: undefined
      }
      requeue_failed_quote_send_item: {
        Args: { p_queue_id: string }
        Returns: {
          attempts: number
          channel: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          message_text: string | null
          pdf_attached: boolean
          processed_at: string | null
          quote_id: string
          recipient: string
          scheduled_at: string
          share_log_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_quote_send_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_market_product_match: {
        Args: {
          p_source_name: Database["public"]["Enums"]["market_match_source"]
          p_source_product_id?: string
          p_source_product_url?: string
        }
        Returns: {
          afrakala_product_id: string
          confidence_score: number
          match_id: string
          match_status: Database["public"]["Enums"]["market_match_status"]
        }[]
      }
      review_delivery_receipt: {
        Args: { p_decision: string; p_note?: string; p_receipt_id: string }
        Returns: undefined
      }
      review_document: {
        Args: { p_decision: string; p_document_id: string; p_note?: string }
        Returns: undefined
      }
      review_market_product_match_approve: {
        Args: {
          p_afrakala_product_id: string
          p_match_id: string
          p_notes?: string
        }
        Returns: {
          afrakala_product_id: string | null
          afrakala_product_name_snapshot: string | null
          confidence_score: number | null
          created_at: string
          id: string
          last_seen_at: string | null
          match_status: Database["public"]["Enums"]["market_match_status"]
          matched_by: Database["public"]["Enums"]["market_match_actor"]
          normalized_source_title: string | null
          notes: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_name: Database["public"]["Enums"]["market_match_source"]
          source_product_id: string | null
          source_product_url: string | null
          source_title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_product_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_market_product_match_disable: {
        Args: { p_match_id: string; p_notes?: string; p_reason: string }
        Returns: {
          afrakala_product_id: string | null
          afrakala_product_name_snapshot: string | null
          confidence_score: number | null
          created_at: string
          id: string
          last_seen_at: string | null
          match_status: Database["public"]["Enums"]["market_match_status"]
          matched_by: Database["public"]["Enums"]["market_match_actor"]
          normalized_source_title: string | null
          notes: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_name: Database["public"]["Enums"]["market_match_source"]
          source_product_id: string | null
          source_product_url: string | null
          source_title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_product_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_market_product_match_reject: {
        Args: { p_match_id: string; p_notes?: string; p_reject_reason: string }
        Returns: {
          afrakala_product_id: string | null
          afrakala_product_name_snapshot: string | null
          confidence_score: number | null
          created_at: string
          id: string
          last_seen_at: string | null
          match_status: Database["public"]["Enums"]["market_match_status"]
          matched_by: Database["public"]["Enums"]["market_match_actor"]
          normalized_source_title: string | null
          notes: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_name: Database["public"]["Enums"]["market_match_source"]
          source_product_id: string | null
          source_product_url: string | null
          source_title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_product_matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      revoke_user_role_txt: {
        Args: { _role: string; _target_user: string }
        Returns: undefined
      }
      run_daily_capital_allocation: {
        Args: {
          p_capital_date: string
          p_notes?: string
          p_total_capital: number
        }
        Returns: Json
      }
      save_daily_capital_snapshot: {
        Args: {
          p_capital_date: string
          p_final_capital: number
          p_override_reason?: string
        }
        Returns: {
          approved_by: string | null
          capital_date: string
          created_at: string
          created_by: string | null
          due_today_payables: number
          due_today_receivables: number
          final_capital: number
          formula_version: string
          future_payables: number
          future_receivables: number
          id: string
          input_id: string | null
          is_active: boolean
          overdue_payables: number
          overdue_receivables: number
          override_reason: string | null
          system_suggested_capital: number
          total_payables: number
          total_receivables: number
        }
        SetofOptions: {
          from: "*"
          to: "daily_capital_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_messenger_messages_semantic: {
        Args: {
          p_group_id: string
          p_limit?: number
          p_query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          message_id: string
          sender_id: string
          similarity: number
        }[]
      }
      search_product_ids: {
        Args: { p_limit?: number; p_term: string }
        Returns: {
          barcode: string
          id: string
          is_active: boolean
          name: string
          sku: string
          stock_status: string
        }[]
      }
      send_invoice_to_accountant: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      send_messenger_message: {
        Args: {
          p_content: string
          p_group_id: string
          p_reply_to?: string
          p_type?: string
        }
        Returns: {
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          group_id: string
          id: string
          reply_to: string | null
          sender_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "messenger_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_messenger_message_with_attachment: {
        Args: {
          p_content: string
          p_file_name: string
          p_file_path: string
          p_file_size: number
          p_file_type: string
          p_group_id: string
          p_reply_to: string
          p_type: string
        }
        Returns: {
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          group_id: string
          id: string
          reply_to: string | null
          sender_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "messenger_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_bot_api_key_active: {
        Args: { p_is_active: boolean; p_key_id: string }
        Returns: undefined
      }
      set_bot_api_key_table_access: {
        Args: {
          p_allowed_update_columns?: string[]
          p_can_read: boolean
          p_can_update: boolean
          p_key_id: string
          p_table_id: string
        }
        Returns: undefined
      }
      set_dynamic_table_row_active: {
        Args: { p_is_active: boolean; p_row_id: string }
        Returns: undefined
      }
      set_market_rate_tick_status: {
        Args: { p_note?: string; p_status: string; p_tick_id: string }
        Returns: undefined
      }
      set_primary_product_image: {
        Args: { p_image_id: string }
        Returns: undefined
      }
      set_profile_field_value: {
        Args: { _field_name: string; _user_id: string; _value: Json }
        Returns: undefined
      }
      settle_league_season: { Args: never; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_league_season: {
        Args: { _end: string; _name: string; _start: string }
        Returns: string
      }
      start_market_rate_ingestion_run: {
        Args: { p_source_code: string }
        Returns: string
      }
      start_market_rate_ingestion_run_system: {
        Args: { p_source_code: string }
        Returns: string
      }
      submit_appeal: {
        Args: { p_penalty_id: string; p_reason: string }
        Returns: string
      }
      submit_quiz_attempt: {
        Args: { _answers: Json; _quiz_id: string }
        Returns: {
          attempt_id: string
          passed: boolean
          score: number
        }[]
      }
      sync_product_price_observatory_rows: {
        Args: never
        Returns: {
          inserted_rows: number
          updated_rows: number
        }[]
      }
      tick_inquiries: { Args: never; Returns: undefined }
      toggle_custom_role_status: {
        Args: { _is_active: boolean; _role_id: string }
        Returns: undefined
      }
      transfer_inquiry: {
        Args: { p_inquiry_id: string; p_to_user: string }
        Returns: undefined
      }
      update_customer_overdue_status: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      update_dynamic_table_cell: {
        Args: { p_column_id: string; p_row_id: string; p_value: string }
        Returns: undefined
      }
      update_dynamic_table_column: {
        Args: {
          p_column_id: string
          p_is_editable_by_bot: boolean
          p_is_filterable: boolean
          p_is_required: boolean
          p_label: string
        }
        Returns: undefined
      }
      update_inquiry_status: {
        Args: {
          p_inquiry_id: string
          p_new_status: Database["public"]["Enums"]["inquiry_status"]
        }
        Returns: undefined
      }
      update_market_rate_source_mapping: {
        Args: {
          p_is_enabled: boolean
          p_mapping_id: string
          p_normalize_multiplier: number
          p_note: string
          p_source_symbol: string
        }
        Returns: {
          created_at: string
          id: string
          indicator_id: string
          is_enabled: boolean
          normalize_multiplier: number
          note: string | null
          source_id: string
          source_symbol: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_rate_source_mappings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_purchase_status: {
        Args: {
          p_final_price?: number
          p_new_status: string
          p_note?: string
          p_request_id: string
        }
        Returns: undefined
      }
      update_role_permissions: {
        Args: { _permissions: Json; _role_name: string }
        Returns: undefined
      }
      update_sales_quote_status: {
        Args: {
          p_next: Database["public"]["Enums"]["sales_quote_status"]
          p_quote_id: string
          p_reason?: string
        }
        Returns: {
          cancel_reason: string
          id: string
          status: Database["public"]["Enums"]["sales_quote_status"]
        }[]
      }
      update_waybill_status: {
        Args: { p_new_status: string; p_waybill_id: string }
        Returns: undefined
      }
      update_workflow_setting: {
        Args: {
          p_is_active?: boolean
          p_penalty_enabled?: boolean
          p_penalty_for?: string
          p_process_key: string
          p_reviewer_role?: string
          p_timer_minutes?: number
          p_uploader_role?: string
        }
        Returns: undefined
      }
      upsert_daily_capital_input: {
        Args: {
          p_bank_balance?: number
          p_blocked_funds?: number
          p_capital_date: string
          p_cash_balance?: number
          p_external_payables?: number
          p_external_receivables?: number
          p_incoming_checks?: number
          p_inventory_liquidity_value?: number
          p_manual_adjustment?: number
          p_near_term_expenses?: number
          p_notes?: string
          p_outgoing_checks?: number
          p_risk_reserve?: number
        }
        Returns: {
          bank_balance: number
          blocked_funds: number
          capital_date: string
          cash_balance: number
          created_at: string
          created_by: string | null
          external_payables: number
          external_receivables: number
          id: string
          incoming_checks: number
          inventory_liquidity_value: number
          manual_adjustment: number
          near_term_expenses: number
          notes: string | null
          outgoing_checks: number
          risk_reserve: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "daily_capital_inputs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_dynamic_parameter_weight: {
        Args: {
          _new_is_active: boolean
          _new_weight: number
          _parameter_id: string
        }
        Returns: undefined
      }
      upsert_market_product_match_candidate: {
        Args: {
          p_confidence_score?: number
          p_normalized_source_title?: string
          p_notes?: string
          p_source_name: Database["public"]["Enums"]["market_match_source"]
          p_source_product_id: string
          p_source_product_url: string
          p_source_title: string
        }
        Returns: {
          created_or_updated: string
          match_id: string
          match_status: Database["public"]["Enums"]["market_match_status"]
        }[]
      }
      validate_journal_entry_balance: {
        Args: { p_journal_entry_id: string }
        Returns: {
          is_balanced: boolean
          total_credit: number
          total_debit: number
        }[]
      }
      validate_price_settlement_compatibility: {
        Args: { p_sale_price_type_id: string; p_settlement_type_id: string }
        Returns: Json
      }
      vote_on_appeal: {
        Args: { p_appeal_id: string; p_note?: string; p_vote: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "sales"
        | "accountant"
        | "viewer"
        | "purchase_specialist"
        | "site"
      base_currency: "toman" | "usd" | "aed"
      currency_code: "toman" | "usd" | "aed" | "usd_us"
      dynamic_column_data_type:
        | "text"
        | "number"
        | "boolean"
        | "date"
        | "datetime"
        | "phone"
        | "tag"
        | "status"
      inquiry_status:
        | "draft"
        | "pending"
        | "warning_5min"
        | "danger_8min"
        | "critical_10min"
        | "transfer_available"
        | "transferred"
        | "answered"
        | "completed_on_time"
        | "completed_late"
        | "expired"
        | "cancelled"
        | "rejected"
      league_tier:
        | "Bronze"
        | "Silver"
        | "Gold"
        | "Platinum"
        | "Diamond"
        | "Legend"
      margin_type: "fixed" | "percent" | "mixed"
      market_match_actor: "system" | "human" | "imported" | "bot"
      market_match_source: "torob" | "purchista" | "other"
      market_match_status:
        | "pending"
        | "needs_review"
        | "approved"
        | "rejected"
        | "disabled"
      product_attribute_type:
        | "brand"
        | "category"
        | "color"
        | "capacity"
        | "model"
      product_status: "active" | "inactive" | "discontinued"
      product_type: "iranian" | "foreign"
      profile_field_type:
        | "text"
        | "number"
        | "select"
        | "multiselect"
        | "time"
        | "days"
        | "textarea"
        | "date"
      sales_quote_item_source: "product_price" | "quick_price" | "manual"
      sales_quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "canceled"
      shipping_cost_type: "fixed" | "percent" | "currency"
      stock_alert_priority: "low" | "normal" | "high"
      stock_alert_status:
        | "open"
        | "contacted"
        | "closed"
        | "canceled"
        | "notified"
      stock_status: "available" | "unavailable" | "limited" | "unknown"
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
      app_role: [
        "admin",
        "manager",
        "sales",
        "accountant",
        "viewer",
        "purchase_specialist",
        "site",
      ],
      base_currency: ["toman", "usd", "aed"],
      currency_code: ["toman", "usd", "aed", "usd_us"],
      dynamic_column_data_type: [
        "text",
        "number",
        "boolean",
        "date",
        "datetime",
        "phone",
        "tag",
        "status",
      ],
      inquiry_status: [
        "draft",
        "pending",
        "warning_5min",
        "danger_8min",
        "critical_10min",
        "transfer_available",
        "transferred",
        "answered",
        "completed_on_time",
        "completed_late",
        "expired",
        "cancelled",
        "rejected",
      ],
      league_tier: [
        "Bronze",
        "Silver",
        "Gold",
        "Platinum",
        "Diamond",
        "Legend",
      ],
      margin_type: ["fixed", "percent", "mixed"],
      market_match_actor: ["system", "human", "imported", "bot"],
      market_match_source: ["torob", "purchista", "other"],
      market_match_status: [
        "pending",
        "needs_review",
        "approved",
        "rejected",
        "disabled",
      ],
      product_attribute_type: [
        "brand",
        "category",
        "color",
        "capacity",
        "model",
      ],
      product_status: ["active", "inactive", "discontinued"],
      product_type: ["iranian", "foreign"],
      profile_field_type: [
        "text",
        "number",
        "select",
        "multiselect",
        "time",
        "days",
        "textarea",
        "date",
      ],
      sales_quote_item_source: ["product_price", "quick_price", "manual"],
      sales_quote_status: ["draft", "sent", "accepted", "rejected", "canceled"],
      shipping_cost_type: ["fixed", "percent", "currency"],
      stock_alert_priority: ["low", "normal", "high"],
      stock_alert_status: [
        "open",
        "contacted",
        "closed",
        "canceled",
        "notified",
      ],
      stock_status: ["available", "unavailable", "limited", "unknown"],
    },
  },
} as const
