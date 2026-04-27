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
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
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
      currency_rates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          effective_at: string
          id: string
          is_active: boolean
          rate_to_toman: number
          source_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          effective_at?: string
          id?: string
          is_active?: boolean
          rate_to_toman: number
          source_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_at?: string
          id?: string
          is_active?: boolean
          rate_to_toman?: number
          source_name?: string | null
          updated_at?: string
        }
        Relationships: []
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
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
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
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number
          due_date: string | null
          id: string
          issue_date: string
          notes: string | null
          number: string | null
          sale_price_type_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string | null
          sale_price_type_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string | null
          sale_price_type_id?: string | null
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
          shipping_cost_rule_id: string | null
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
          shipping_cost_rule_id?: string | null
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
          shipping_cost_rule_id?: string | null
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
          {
            foreignKeyName: "pricing_rules_shipping_cost_rule_id_fkey"
            columns: ["shipping_cost_rule_id"]
            isOneToOne: false
            referencedRelation: "shipping_cost_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["product_attribute_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          type: Database["public"]["Enums"]["product_attribute_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["product_attribute_type"]
          updated_at?: string
        }
        Relationships: []
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
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
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
          base_currency: Database["public"]["Enums"]["base_currency"]
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
          base_currency?: Database["public"]["Enums"]["base_currency"]
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
          base_currency?: Database["public"]["Enums"]["base_currency"]
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
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
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
      settlement_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_cost_rules: {
        Row: {
          category_id: string | null
          cost_type: Database["public"]["Enums"]["shipping_cost_type"]
          cost_value: number
          created_at: string
          id: string
          is_active: boolean
          max_purchase_price: number | null
          min_purchase_price: number | null
          priority: number
          product_type: Database["public"]["Enums"]["product_type"] | null
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          cost_type: Database["public"]["Enums"]["shipping_cost_type"]
          cost_value: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_purchase_price?: number | null
          min_purchase_price?: number | null
          priority?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          cost_type?: Database["public"]["Enums"]["shipping_cost_type"]
          cost_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_purchase_price?: number | null
          min_purchase_price?: number | null
          priority?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          title?: string
          updated_at?: string
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
    }
    Views: {
      publish_recipients_view: {
        Row: {
          full_name: string | null
          id: string | null
          roles: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
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
      calculate_credit_score: {
        Args: { _customer_id: string }
        Returns: {
          credit_limit: number
          params: Json
          score: number
        }[]
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
      create_bot_api_key: {
        Args: { p_expires_at?: string; p_name: string }
        Returns: {
          id: string
          key_prefix: string
          raw_key: string
        }[]
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
      delete_bot_api_key_table_access: {
        Args: { p_key_id: string; p_table_id: string }
        Returns: undefined
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
      get_product_sale_price: {
        Args: { _product_id: string; _sale_price_type_id?: string }
        Returns: number
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_dynamic_table_rows: {
        Args: { p_rows: Json; p_session_id?: string; p_table_id: string }
        Returns: Json
      }
      kd_role_can_view: {
        Args: { _access_level: string; _uid: string }
        Returns: boolean
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
      next_product_sku: { Args: { _year: number }; Returns: string }
      next_sales_quote_number: { Args: { _year: number }; Returns: string }
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
      margin_type: "fixed" | "percent" | "mixed"
      product_attribute_type:
        | "brand"
        | "category"
        | "color"
        | "capacity"
        | "model"
      product_status: "active" | "inactive" | "discontinued"
      product_type: "iranian" | "foreign"
      sales_quote_item_source: "product_price" | "quick_price" | "manual"
      sales_quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "canceled"
      shipping_cost_type: "fixed" | "percent"
      stock_alert_priority: "low" | "normal" | "high"
      stock_alert_status: "open" | "contacted" | "closed" | "canceled"
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
      sales_quote_item_source: ["product_price", "quick_price", "manual"],
      sales_quote_status: ["draft", "sent", "accepted", "rejected", "canceled"],
      shipping_cost_type: ["fixed", "percent"],
      stock_alert_priority: ["low", "normal", "high"],
      stock_alert_status: ["open", "contacted", "closed", "canceled"],
      stock_status: ["available", "unavailable", "limited", "unknown"],
    },
  },
} as const
