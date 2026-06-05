import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"
import { formatStatus } from "~/lib/format"

type StatusVariant = "default" | "success" | "warning" | "danger" | "info"

const STATUS_COLORS: Record<string, StatusVariant> = {
  // Transaction statuses
  created: "default",
  seller_invited: "info",
  accepted: "info",
  rejected: "danger",
  funded: "info",
  in_delivery: "warning",
  delivered: "info",
  under_inspection: "warning",
  released: "success",
  disputed: "danger",
  refunded: "warning",
  partially_refunded: "warning",
  cancelled: "default",
  expired: "default",
  admin_review: "danger",
  return_approved: "info",
  return_in_progress: "warning",
  return_delivered: "info",
  return_inspection: "warning",

  // Dispute statuses
  open: "danger",
  under_review: "warning",
  awaiting_evidence: "warning",
  resolved: "success",

  // User statuses
  active: "success",
  restricted: "warning",
  suspended: "danger",

  // Fraud flag statuses
  confirmed: "danger",
  dismissed: "default",

  // Admin decision statuses
  release_to_seller: "success",
  refund_buyer: "warning",
  partial_refund: "warning",
  return_required: "info",

  // Ledger types
  fund: "info",
  release: "success",
  refund: "warning",
  partial_refund_type: "warning",

  // Ledger statuses
  pending: "warning",
  locked: "info",
  completed: "success",
  failed: "danger",
}

const variantClasses: Record<StatusVariant, string> = {
  default: "bg-muted text-muted-foreground",
  success:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
}

type Props = {
  status: string | null | undefined
  className?: string
}

export function StatusBadge({ status, className }: Props) {
  if (!status) return <span className="text-xs text-muted-foreground">-</span>

  const variant = STATUS_COLORS[status] ?? "default"

  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wider",
        variantClasses[variant],
        className
      )}
    >
      {formatStatus(status)}
    </Badge>
  )
}
