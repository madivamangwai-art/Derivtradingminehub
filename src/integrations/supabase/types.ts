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
      deposits: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          id: string
          merchant_request_id: string | null
          metadata: Json | null
          mpesa_phone: string | null
          mpesa_receipt: string | null
          purpose: string | null
          status: Database["public"]["Enums"]["txn_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          metadata?: Json | null
          mpesa_phone?: string | null
          mpesa_receipt?: string | null
          purpose?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          metadata?: Json | null
          mpesa_phone?: string | null
          mpesa_receipt?: string | null
          purpose?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          daily_payout: number
          duration_days: number
          id: string
          name: string
          price: number
          referral_bonus: number
          sort_order: number
          tier: Database["public"]["Enums"]["package_tier"]
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          daily_payout: number
          duration_days: number
          id?: string
          name: string
          price: number
          referral_bonus?: number
          sort_order?: number
          tier: Database["public"]["Enums"]["package_tier"]
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          daily_payout?: number
          duration_days?: number
          id?: string
          name?: string
          price?: number
          referral_bonus?: number
          sort_order?: number
          tier?: Database["public"]["Enums"]["package_tier"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          referral_code: string
          referred_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          referral_code: string
          referred_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string
          referred_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      red_packet_claims: {
        Row: {
          created_at: string
          id: string
          packet_id: string
          tickets_awarded: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          packet_id: string
          tickets_awarded: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          packet_id?: string
          tickets_awarded?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "red_packet_claims_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "red_packets"
            referencedColumns: ["id"]
          },
        ]
      }
      red_packets: {
        Row: {
          claimed_count: number
          code: string
          created_at: string
          creator_id: string
          id: string
          max_claims: number
          status: string
          ticket_value: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          claimed_count?: number
          code: string
          created_at?: string
          creator_id: string
          id?: string
          max_claims: number
          status?: string
          ticket_value: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          claimed_count?: number
          code?: string
          created_at?: string
          creator_id?: string
          id?: string
          max_claims?: number
          status?: string
          ticket_value?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      referral_earnings: {
        Row: {
          amount: number
          created_at: string
          id: string
          package_id: string
          referred_user_id: string
          referrer_id: string
          user_package_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          package_id: string
          referred_user_id: string
          referrer_id: string
          user_package_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          package_id?: string
          referred_user_id?: string
          referrer_id?: string
          user_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_earnings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_user_package_id_fkey"
            columns: ["user_package_id"]
            isOneToOne: false
            referencedRelation: "user_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      spin_tickets: {
        Row: {
          created_at: string
          id: string
          prize_amount: number | null
          prize_label: string | null
          source: string
          used_at: string | null
          user_id: string
          value_kes: number
        }
        Insert: {
          created_at?: string
          id?: string
          prize_amount?: number | null
          prize_label?: string | null
          source?: string
          used_at?: string | null
          user_id: string
          value_kes: number
        }
        Update: {
          created_at?: string
          id?: string
          prize_amount?: number | null
          prize_label?: string | null
          source?: string
          used_at?: string | null
          user_id?: string
          value_kes?: number
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          sender: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          sender: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          sender?: string
          user_id?: string
        }
        Relationships: []
      }
      support_settings: {
        Row: {
          id: number
          telegram_url: string | null
          updated_at: string
          whatsapp_url: string | null
        }
        Insert: {
          id?: number
          telegram_url?: string | null
          updated_at?: string
          whatsapp_url?: string | null
        }
        Update: {
          id?: number
          telegram_url?: string | null
          updated_at?: string
          whatsapp_url?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          ref_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["txn_kind"]
          ref_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_packages: {
        Row: {
          expires_at: string
          id: string
          last_payout_at: string | null
          package_id: string
          purchased_at: string
          status: Database["public"]["Enums"]["pkg_status"]
          total_paid_out: number
          user_id: string
        }
        Insert: {
          expires_at: string
          id?: string
          last_payout_at?: string | null
          package_id: string
          purchased_at?: string
          status?: Database["public"]["Enums"]["pkg_status"]
          total_paid_out?: number
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          last_payout_at?: string | null
          package_id?: string
          purchased_at?: string
          status?: Database["public"]["Enums"]["pkg_status"]
          total_paid_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          total_deposited: number
          total_earned: number
          total_withdrawn: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          total_deposited?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          total_deposited?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          fee: number
          id: string
          mpesa_phone: string
          net_amount: number | null
          status: Database["public"]["Enums"]["txn_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          fee?: number
          id?: string
          mpesa_phone: string
          net_amount?: number | null
          status?: Database["public"]["Enums"]["txn_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          fee?: number
          id?: string
          mpesa_phone?: string
          net_amount?: number | null
          status?: Database["public"]["Enums"]["txn_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gen_referral_code:
        | { Args: never; Returns: string }
        | { Args: { _name?: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client"
      package_tier: "bronze" | "silver" | "gold" | "diamond" | "platinum"
      pkg_status: "active" | "completed" | "cancelled"
      txn_kind:
        | "deposit"
        | "withdrawal"
        | "payout"
        | "referral"
        | "purchase"
        | "adjustment"
        | "spin_ticket"
        | "spin_win"
        | "red_packet_create"
        | "admin_adjust"
      txn_status:
        | "pending"
        | "success"
        | "failed"
        | "approved"
        | "rejected"
        | "paid"
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
      app_role: ["admin", "client"],
      package_tier: ["bronze", "silver", "gold", "diamond", "platinum"],
      pkg_status: ["active", "completed", "cancelled"],
      txn_kind: [
        "deposit",
        "withdrawal",
        "payout",
        "referral",
        "purchase",
        "adjustment",
        "spin_ticket",
        "spin_win",
        "red_packet_create",
        "admin_adjust",
      ],
      txn_status: [
        "pending",
        "success",
        "failed",
        "approved",
        "rejected",
        "paid",
      ],
    },
  },
} as const
