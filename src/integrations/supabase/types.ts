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
      categories: {
        Row: {
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
          id: string
          is_active: boolean
          last_purchase_date: string | null
          late_payments_count: number
          outstanding_balance: number
          total_paid: number
          total_purchases: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_limit?: number
          credit_score?: number
          customer_id: string
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          late_payments_count?: number
          outstanding_balance?: number
          total_paid?: number
          total_purchases?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_limit?: number
          credit_score?: number
          customer_id?: string
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          late_payments_count?: number
          outstanding_balance?: number
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
          email: string | null
          id: string
          is_active: boolean
          link_group: string | null
          name: string
          notes: string | null
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
          email?: string | null
          id?: string
          is_active?: boolean
          link_group?: string | null
          name: string
          notes?: string | null
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
          email?: string | null
          id?: string
          is_active?: boolean
          link_group?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          responsible_id?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
          id: string
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
          id?: string
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
          id?: string
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
          commitment_confirmed: boolean
          created_at: string
          created_by: string | null
          customer_id: string | null
          deposit_amount: number | null
          discount_amount: number
          due_date: string | null
          id: string
          invoice_type: string
          issue_date: string
          issued_by: string | null
          notes: string | null
          number: string | null
          sale_price_type_id: string | null
          settlement_type_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          commitment_confirmed?: boolean
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_type?: string
          issue_date?: string
          issued_by?: string | null
          notes?: string | null
          number?: string | null
          sale_price_type_id?: string | null
          settlement_type_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Update: {
          commitment_confirmed?: boolean
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_type?: string
          issue_date?: string
          issued_by?: string | null
          notes?: string | null
          number?: string | null
          sale_price_type_id?: string | null
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
      marketing_channels: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          weight?: number
        }
        Relationships: []
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
          description: string | null
          destination_bank: string | null
          destination_bank_account_id: string | null
          document_channel: string | null
          has_perforation: boolean
          id: string
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
          description?: string | null
          destination_bank?: string | null
          destination_bank_account_id?: string | null
          document_channel?: string | null
          has_perforation?: boolean
          id?: string
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
          description?: string | null
          destination_bank?: string | null
          destination_bank_account_id?: string | null
          document_channel?: string | null
          has_perforation?: boolean
          id?: string
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
          created_at: string
          id: string
          is_primary: boolean
          notes: string | null
          product_id: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          product_id: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          product_id?: string
          supplier_id?: string
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
          base_currency: string
          brand_id: string | null
          capacity: string | null
          category: string | null
          category_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          model: string | null
          name: string
          primary_spec: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          stock_status: Database["public"]["Enums"]["stock_status"]
          technical_notes: string | null
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_currency?: string
          brand_id?: string | null
          capacity?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          model?: string | null
          name: string
          primary_spec?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_status?: Database["public"]["Enums"]["stock_status"]
          technical_notes?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_currency?: string
          brand_id?: string | null
          capacity?: string | null
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          model?: string | null
          name?: string
          primary_spec?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          stock_status?: Database["public"]["Enums"]["stock_status"]
          technical_notes?: string | null
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
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string | null
          id: string
          notes: string | null
          number: string | null
          product_id: string | null
          purchase_date: string
          purchase_price: number | null
          quantity: number
          status: string
          supplier_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          product_id?: string | null
          purchase_date?: string
          purchase_price?: number | null
          quantity?: number
          status?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          product_id?: string | null
          purchase_date?: string
          purchase_price?: number | null
          quantity?: number
          status?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
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
          published_at: string | null
          sale_price_type_id: string
          selected_columns: Json | null
          seller_info: string | null
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
          published_at?: string | null
          sale_price_type_id: string
          selected_columns?: Json | null
          seller_info?: string | null
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
          published_at?: string | null
          sale_price_type_id?: string
          selected_columns?: Json | null
          seller_info?: string | null
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
        ]
      }
      sale_price_types: {
        Row: {
          code: string
          created_at: string
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
          description?: string | null
          id?: string
          is_active?: boolean
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
          cancel_reason: string | null
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
          status: Database["public"]["Enums"]["sales_quote_status"]
          subtotal_amount: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
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
          status?: Database["public"]["Enums"]["sales_quote_status"]
          subtotal_amount?: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
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
          status?: Database["public"]["Enums"]["sales_quote_status"]
          subtotal_amount?: number
          updated_at?: string
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
        ]
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
      publish_recipients_view: {
        Row: {
          full_name: string | null
          id: string | null
          roles: string[] | null
        }
        Relationships: []
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
      v_promotion_suggestions: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          channel_weight: number | null
          label_weight_sum: number | null
          product_id: string | null
          product_name: string | null
          qty_90d: number | null
          recency_factor: number | null
          score: number | null
          sku: string | null
          stock_factor: number | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      _ensure_credit_balance: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      _mi_require_privileged: { Args: never; Returns: undefined }
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
      bot_key_stats_today: {
        Args: never
        Returns: {
          api_key_id: string
          errors_today: number
          last_used_at: string
          requests_today: number
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
      calc_xp_for_level: { Args: { _level: number }; Returns: number }
      calculate_credit_score: {
        Args: { _customer_id: string }
        Returns: {
          credit_limit: number
          params: Json
          score: number
        }[]
      }
      calculate_employee_score: {
        Args: { _employee_id: string }
        Returns: Json
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
      compute_promotion_scores: {
        Args: { _channel_id?: string; _limit?: number; _min_score?: number }
        Returns: {
          channel_id: string | null
          channel_name: string | null
          channel_weight: number | null
          label_weight_sum: number | null
          product_id: string | null
          product_name: string | null
          qty_90d: number | null
          recency_factor: number | null
          score: number | null
          sku: string | null
          stock_factor: number | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "v_promotion_suggestions"
          isOneToOne: false
          isSetofReturn: true
        }
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
      create_dynamic_table_row: {
        Args: { p_table_id: string; p_values: Json }
        Returns: string
      }
      create_sales_quote_with_items: {
        Args: {
          p_customer_name: string
          p_customer_note: string
          p_customer_phone: string
          p_discount_amount: number
          p_expires_at: string
          p_final_amount: number
          p_items: Json
          p_subtotal_amount: number
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
      deactivate_user: { Args: { _user_id: string }; Returns: undefined }
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
          held_credit: number
          outstanding_balance: number
          total_purchases: number
        }[]
      }
      get_employee_progress: { Args: { _employee_id: string }; Returns: Json }
      get_employee_rank: {
        Args: { _employee_id: string }
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
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_dynamic_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      is_board_approved: {
        Args: { _board_key: string; _user_id: string }
        Returns: boolean
      }
      is_board_manager: { Args: { _user_id: string }; Returns: boolean }
      is_hr_manager: { Args: { _user_id: string }; Returns: boolean }
      is_product_owner: {
        Args: { _product_id: string; _user_id: string }
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
      log_event: {
        Args: {
          _action: string
          _diff?: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
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
      normalize_fa_text: { Args: { input: string }; Returns: string }
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
      quick_approve_user: {
        Args: { _role?: string; _user_id: string }
        Returns: undefined
      }
      reactivate_user: { Args: { _user_id: string }; Returns: undefined }
      recompute_all_employee_scores: { Args: never; Returns: number }
      record_currency_fetch: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_note?: string
          p_rate: number
          p_source_id: string
        }
        Returns: string
      }
      reject_currency_fetch: {
        Args: { p_fetch_id: string; p_reason?: string }
        Returns: undefined
      }
      reject_pending_user: {
        Args: { _notes?: string; _user_id: string }
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
      revoke_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      search_product_ids: {
        Args: { p_limit?: number; p_term: string }
        Returns: {
          id: string
        }[]
      }
      send_invoice_to_accountant: {
        Args: { p_invoice_id: string }
        Returns: string
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
      toggle_custom_role_status: {
        Args: { _is_active: boolean; _role_id: string }
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
      update_role_permissions: {
        Args: { _permissions: Json; _role_name: string }
        Returns: undefined
      }
      update_waybill_status: {
        Args: { p_new_status: string; p_waybill_id: string }
        Returns: undefined
      }
      validate_journal_entry_balance: {
        Args: { p_journal_entry_id: string }
        Returns: {
          is_balanced: boolean
          total_credit: number
          total_debit: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "sales" | "accountant" | "viewer"
      base_currency: "toman" | "usd" | "aed"
      currency_code: "toman" | "usd" | "aed"
      dynamic_column_data_type:
        | "text"
        | "number"
        | "boolean"
        | "date"
        | "datetime"
        | "phone"
        | "tag"
        | "status"
      league_tier:
        | "Bronze"
        | "Silver"
        | "Gold"
        | "Platinum"
        | "Diamond"
        | "Legend"
      margin_type: "fixed" | "percent" | "mixed"
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
      app_role: ["admin", "manager", "sales", "accountant", "viewer"],
      base_currency: ["toman", "usd", "aed"],
      currency_code: ["toman", "usd", "aed"],
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
      league_tier: [
        "Bronze",
        "Silver",
        "Gold",
        "Platinum",
        "Diamond",
        "Legend",
      ],
      margin_type: ["fixed", "percent", "mixed"],
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
