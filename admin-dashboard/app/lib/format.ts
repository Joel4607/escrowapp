/**
 * Format a number as currency with ₵ symbol
 */
export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
  return `₵${formatted}`
}

/**
 * Format a date string to a readable format
 */
export function formatDate(date: string | null): string {
  if (!date) return "-"
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
}

/**
 * Format a date string to include time
 */
export function formatDateTime(date: string | null): string {
  if (!date) return "-"
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

/**
 * Format a relative date (e.g. "2 hours ago")
 */
export function formatRelativeDate(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(date)
}

/**
 * Pretty-print a transaction status
 */
export function formatStatus(status: string | null | undefined): string {
  if (!status) return "-"
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
