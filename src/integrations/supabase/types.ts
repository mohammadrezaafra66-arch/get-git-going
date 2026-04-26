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
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tax_id?: string | null
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
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
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
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
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
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
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
      products: {
        Row: {
          base_currency: Database["public"]["Enums"]["base_currency"]
          brand_id: string | null
          category: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
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
          category?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
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
          category?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
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
          id: string
          notes: string | null
          number: string | null
          status: string
          supplier_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
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
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          trust_level: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          trust_level?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          trust_level?: string | null
          updated_at?: string
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
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
      revoke_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "sales" | "accountant" | "viewer"
      base_currency: "toman" | "usd" | "aed"
      currency_code: "toman" | "usd" | "aed"
      margin_type: "fixed" | "percent" | "mixed"
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
      margin_type: ["fixed", "percent", "mixed"],
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
