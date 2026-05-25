import { formatDistanceToNow } from "date-fns";
import type { TransactionStatus } from "./database.types";

export function formatCurrency(amount: number): string {
  return `₵${amount.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatRelativeDate(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

const STATUS_LABELS: Record<TransactionStatus, string> = {
  created: "Created",
  seller_invited: "Seller Invited",
  accepted: "Accepted",
  rejected: "Rejected",
  funded: "Funded",
  in_delivery: "In Delivery",
  delivered: "Delivered",
  under_inspection: "Inspecting",
  released: "Released",
  disputed: "Disputed",
  refunded: "Refunded",
  partially_refunded: "Partial Refund",
  cancelled: "Cancelled",
  expired: "Expired",
  admin_review: "Under Review",
};

export function getStatusLabel(status: TransactionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_VARIANTS: Record<TransactionStatus, BadgeVariant> = {
  created: "secondary",
  seller_invited: "secondary",
  accepted: "secondary",
  rejected: "destructive",
  funded: "default",
  in_delivery: "default",
  delivered: "default",
  under_inspection: "secondary",
  released: "outline",
  disputed: "destructive",
  refunded: "outline",
  partially_refunded: "outline",
  cancelled: "destructive",
  expired: "destructive",
  admin_review: "destructive",
};

export function getStatusVariant(status: TransactionStatus): BadgeVariant {
  return STATUS_VARIANTS[status] ?? "secondary";
}

export function getSupabaseUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL!;
}
