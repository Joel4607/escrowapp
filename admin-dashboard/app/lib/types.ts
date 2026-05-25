// ============================================
// Core types matching Supabase database schema
// ============================================

export type UserStatus = "active" | "restricted" | "suspended"

export type TransactionStatus =
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

export type DisputeStatus =
  | "open"
  | "under_review"
  | "awaiting_evidence"
  | "resolved"

export type DisputeReason =
  | "Fake product"
  | "Wrong item"
  | "Damaged product"
  | "Empty package"
  | "Item not delivered"
  | "Seller changed terms"
  | "Delivery delay"
  | "Buyer refusing to release payment"
  | "Other"

export type AdminDecision =
  | "release_to_seller"
  | "refund_buyer"
  | "partial_refund"
  | "return_required"
  | "dismissed"

export type ResolutionType =
  | "full_release"
  | "full_refund"
  | "partial_refund"
  | "mutual_agreement"
  | "admin_decision"

export type EvidenceType =
  | "item_photo"
  | "pre_delivery"
  | "received_item"
  | "dispute_evidence"
  | "delivery_proof"
  | "unboxing"

export type LedgerType = "fund" | "release" | "refund" | "partial_refund"
export type LedgerStatus = "pending" | "locked" | "completed" | "failed"

export type FraudFlagType =
  | "too_many_disputes"
  | "high_value_new_user"
  | "serial_number_mismatch"
  | "image_mismatch"
  | "qr_location_mismatch"
  | "buyer_release_delay"
  | "seller_late_delivery"
  | "multiple_accounts"
  | "suspicious_activity"

export type RiskLevel = "low" | "medium" | "high"
export type FraudFlagStatus = "active" | "dismissed" | "confirmed"

// ============================================
// Database row types
// ============================================

export type User = {
  id: string
  phone: string
  name: string | null
  email: string | null
  role: "buyer" | "seller" | "admin"
  is_verified: boolean
  trust_score: number
  wallet_balance: number
  locked_balance: number
  status?: UserStatus
  created_at: string
  updated_at: string
}

export type Transaction = {
  id: string
  transaction_code: string
  buyer_id: string
  seller_id: string | null
  seller_contact: string
  item_name: string
  item_description: string | null
  item_condition: "new" | "used" | "refurbished"
  item_category: string | null
  quantity: number
  price: number
  delivery_deadline: string
  inspection_period: number
  status: TransactionStatus
  funded_at: string | null
  accepted_at: string | null
  delivered_at: string | null
  released_at: string | null
  disputed_at: string | null
  created_at: string
  updated_at: string
  // Joined fields
  buyer?: User
  seller?: User
}

export type Dispute = {
  id: string
  transaction_id: string
  opened_by: string
  reason: string
  description: string | null
  status: DisputeStatus
  admin_decision: AdminDecision | null
  resolution_type: ResolutionType | null
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  // Joined fields
  transaction?: Transaction
  opener?: User
}

export type Evidence = {
  id: string
  transaction_id: string
  uploaded_by: string
  user_role: "buyer" | "seller" | "admin"
  evidence_type: string
  image_url: string
  image_hash: string | null
  notes: string | null
  timestamp: string
  location: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  // Runtime
  signedUrl?: string | null
}

export type AuditLog = {
  id: string
  transaction_id: string | null
  user_id: string | null
  user_role: "buyer" | "seller" | "admin" | null
  action: string
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type LedgerEntry = {
  id: string
  transaction_id: string
  from_user_id: string
  to_user_id: string | null
  amount: number
  type: LedgerType
  status: LedgerStatus
  created_at: string
}

export type FraudFlag = {
  id: string
  transaction_id: string | null
  user_id: string | null
  flag_type: FraudFlagType
  risk_level: RiskLevel
  reason: string
  status: FraudFlagStatus
  created_at: string
}

export type DeliveryToken = {
  id: string
  transaction_id: string
  seller_id: string
  buyer_id: string
  token_hash: string
  is_used: boolean
  used_at: string | null
  expires_at: string
  created_at: string
}

// ============================================
// Dashboard stats
// ============================================

export type DashboardStats = {
  totalTransactions: number
  activeEscrows: number
  disputedTransactions: number
  pendingReview: number
  releasedPayments: number
  refundedPayments: number
  totalUsers: number
  highRiskFlags: number
}
