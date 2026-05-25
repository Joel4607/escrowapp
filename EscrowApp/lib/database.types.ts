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
          created_at: string
          description: string | null
          device_info: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          transaction_id: string | null
          user_id: string
          user_role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          transaction_id?: string | null
          user_id: string
          user_role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          transaction_id?: string | null
          user_id?: string
          user_role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tokens: {
        Row: {
          buyer_id: string
          created_at: string
          expires_at: string
          id: string
          is_used: boolean
          seller_id: string
          token_hash: string
          transaction_id: string
          used_at: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean
          seller_id: string
          token_hash: string
          transaction_id: string
          used_at?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          seller_id?: string
          token_hash?: string
          transaction_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tokens_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tokens_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tokens_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          admin_decision: string | null
          admin_notes: string | null
          created_at: string
          description: string | null
          id: string
          opened_by: string
          reason: string
          resolution_type: Database["public"]["Enums"]["resolution_type"] | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          transaction_id: string
        }
        Insert: {
          admin_decision?: string | null
          admin_notes?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opened_by: string
          reason: string
          resolution_type?:
            | Database["public"]["Enums"]["resolution_type"]
            | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          transaction_id: string
        }
        Update: {
          admin_decision?: string | null
          admin_notes?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opened_by?: string
          reason?: string
          resolution_type?:
            | Database["public"]["Enums"]["resolution_type"]
            | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_ledger: {
        Row: {
          amount: number
          created_at: string
          from_user_id: string
          id: string
          status: Database["public"]["Enums"]["ledger_status"]
          to_user_id: string | null
          transaction_id: string
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          from_user_id: string
          id?: string
          status?: Database["public"]["Enums"]["ledger_status"]
          to_user_id?: string | null
          transaction_id: string
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          from_user_id?: string
          id?: string
          status?: Database["public"]["Enums"]["ledger_status"]
          to_user_id?: string | null
          transaction_id?: string
          type?: Database["public"]["Enums"]["ledger_type"]
        }
        Relationships: [
          {
            foreignKeyName: "escrow_ledger_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_ledger_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          created_at: string
          evidence_type: string
          id: string
          image_hash: string | null
          image_url: string
          location: string | null
          metadata: Json | null
          notes: string | null
          timestamp: string
          transaction_id: string
          uploaded_by: string
          user_role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          evidence_type: string
          id?: string
          image_hash?: string | null
          image_url: string
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          timestamp?: string
          transaction_id: string
          uploaded_by: string
          user_role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          evidence_type?: string
          id?: string
          image_hash?: string | null
          image_url?: string
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          timestamp?: string
          transaction_id?: string
          uploaded_by?: string
          user_role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "evidence_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_flags: {
        Row: {
          created_at: string
          flag_type: string
          id: string
          reason: string
          risk_level: Database["public"]["Enums"]["fraud_risk_level"]
          status: Database["public"]["Enums"]["fraud_flag_status"]
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          flag_type: string
          id?: string
          reason: string
          risk_level: Database["public"]["Enums"]["fraud_risk_level"]
          status?: Database["public"]["Enums"]["fraud_flag_status"]
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          flag_type?: string
          id?: string
          reason?: string
          risk_level?: Database["public"]["Enums"]["fraud_risk_level"]
          status?: Database["public"]["Enums"]["fraud_flag_status"]
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_flags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_challenges: {
        Row: {
          attempt_count: number
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_hash: string
          purpose: Database["public"]["Enums"]["otp_purpose"]
          transaction_invite_id: string
        }
        Insert: {
          attempt_count?: number
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_hash: string
          purpose?: Database["public"]["Enums"]["otp_purpose"]
          transaction_invite_id: string
        }
        Update: {
          attempt_count?: number
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          purpose?: Database["public"]["Enums"]["otp_purpose"]
          transaction_invite_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "otp_challenges_transaction_invite_id_fkey"
            columns: ["transaction_invite_id"]
            isOneToOne: false
            referencedRelation: "transaction_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rated_by: string
          rated_user: string
          score: number
          transaction_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rated_by: string
          rated_user: string
          score: number
          transaction_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rated_by?: string
          rated_user?: string
          score?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_rated_by_fkey"
            columns: ["rated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rated_user_fkey"
            columns: ["rated_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_archives: {
        Row: {
          archived_at: string
          id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string
          id?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          archived_at?: string
          id?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_archives_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_invites: {
        Row: {
          attempt_count: number
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          recipient_email: string
          revoked_at: string | null
          role: string
          status: Database["public"]["Enums"]["invite_status"]
          token_hash: string
          transaction_id: string
          verified_at: string | null
          viewed_at: string | null
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          recipient_email: string
          revoked_at?: string | null
          role?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash: string
          transaction_id: string
          verified_at?: string | null
          viewed_at?: string | null
        }
        Update: {
          attempt_count?: number
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          recipient_email?: string
          revoked_at?: string | null
          role?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash?: string
          transaction_id?: string
          verified_at?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_invites_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          accepted_at: string | null
          buyer_id: string
          created_at: string
          delivered_at: string | null
          delivery_deadline: string
          disputed_at: string | null
          funded_at: string | null
          id: string
          inspection_period: number
          item_category: string | null
          item_condition: string | null
          item_description: string | null
          item_image_url: string | null
          item_name: string
          price: number
          quantity: number
          released_at: string | null
          resolved_at: string | null
          seller_contact: string
          seller_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          terms_accepted_by_buyer: boolean
          terms_accepted_by_seller: boolean
          transaction_code: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          buyer_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_deadline: string
          disputed_at?: string | null
          funded_at?: string | null
          id?: string
          inspection_period?: number
          item_category?: string | null
          item_condition?: string | null
          item_description?: string | null
          item_image_url?: string | null
          item_name: string
          price: number
          quantity?: number
          released_at?: string | null
          resolved_at?: string | null
          seller_contact: string
          seller_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          terms_accepted_by_buyer?: boolean
          terms_accepted_by_seller?: boolean
          transaction_code?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          buyer_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_deadline?: string
          disputed_at?: string | null
          funded_at?: string | null
          id?: string
          inspection_period?: number
          item_category?: string | null
          item_condition?: string | null
          item_description?: string | null
          item_image_url?: string | null
          item_name?: string
          price?: number
          quantity?: number
          released_at?: string | null
          resolved_at?: string | null
          seller_contact?: string
          seller_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          terms_accepted_by_buyer?: boolean
          terms_accepted_by_seller?: boolean
          transaction_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_verified: boolean
          locked_balance: number
          name: string | null
          phone: string | null
          pin_hash: string | null
          role: Database["public"]["Enums"]["user_role"]
          trust_score: number
          updated_at: string
          wallet_balance: number
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_verified?: boolean
          locked_balance?: number
          name?: string | null
          phone?: string | null
          pin_hash?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          trust_score?: number
          updated_at?: string
          wallet_balance?: number
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_verified?: boolean
          locked_balance?: number
          name?: string | null
          phone?: string | null
          pin_hash?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          trust_score?: number
          updated_at?: string
          wallet_balance?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_transaction: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      add_wallet_funds: { Args: { p_amount: number }; Returns: undefined }
      cancel_escrow: { Args: { p_transaction_id: string }; Returns: undefined }
      confirm_delivery: {
        Args: { p_token: string; p_transaction_id: string }
        Returns: undefined
      }
      delete_transaction: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      fund_escrow: { Args: { p_transaction_id: string }; Returns: undefined }
      generate_delivery_token: {
        Args: { p_transaction_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      raise_dispute: {
        Args: {
          p_description?: string
          p_reason: string
          p_transaction_id: string
        }
        Returns: undefined
      }
      reject_transaction: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      release_escrow: { Args: { p_transaction_id: string }; Returns: undefined }
    }
    Enums: {
      dispute_status: "open" | "under_review" | "resolved"
      fraud_flag_status: "active" | "dismissed" | "confirmed"
      fraud_risk_level: "low" | "medium" | "high"
      invite_status:
        | "pending"
        | "viewed"
        | "verified"
        | "accepted"
        | "rejected"
        | "revoked"
        | "expired"
      ledger_status: "pending" | "locked" | "completed" | "failed"
      ledger_type: "fund" | "release" | "refund" | "partial_refund"
      otp_purpose: "seller_verify"
      resolution_type:
        | "release"
        | "refund"
        | "partial_refund"
        | "return_required"
      transaction_status:
        | "created"
        | "seller_invited"
        | "accepted"
        | "rejected"
        | "funded"
        | "in_delivery"
        | "delivered"
        | "under_inspection"
        | "released"
        | "disputed"
        | "refunded"
        | "partially_refunded"
        | "cancelled"
        | "expired"
        | "admin_review"
      user_role: "buyer" | "seller" | "admin"
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
      dispute_status: ["open", "under_review", "resolved"],
      fraud_flag_status: ["active", "dismissed", "confirmed"],
      fraud_risk_level: ["low", "medium", "high"],
      invite_status: [
        "pending",
        "viewed",
        "verified",
        "accepted",
        "rejected",
        "revoked",
        "expired",
      ],
      ledger_status: ["pending", "locked", "completed", "failed"],
      ledger_type: ["fund", "release", "refund", "partial_refund"],
      otp_purpose: ["seller_verify"],
      resolution_type: [
        "release",
        "refund",
        "partial_refund",
        "return_required",
      ],
      transaction_status: [
        "created",
        "seller_invited",
        "accepted",
        "rejected",
        "funded",
        "in_delivery",
        "delivered",
        "under_inspection",
        "released",
        "disputed",
        "refunded",
        "partially_refunded",
        "cancelled",
        "expired",
        "admin_review",
      ],
      user_role: ["buyer", "seller", "admin"],
    },
  },
} as const

export type TransactionStatus = Database["public"]["Enums"]["transaction_status"];
export type UserRole = Database["public"]["Enums"]["user_role"];
export type LedgerType = Database["public"]["Enums"]["ledger_type"];
export type LedgerStatus = Database["public"]["Enums"]["ledger_status"];
export type DisputeStatus = Database["public"]["Enums"]["dispute_status"];
export type ResolutionType = Database["public"]["Enums"]["resolution_type"];
export type FraudRiskLevel = Database["public"]["Enums"]["fraud_risk_level"];
export type FraudFlagStatus = Database["public"]["Enums"]["fraud_flag_status"];
export type InviteStatus = Database["public"]["Enums"]["invite_status"];
export type OtpPurpose = Database["public"]["Enums"]["otp_purpose"];
