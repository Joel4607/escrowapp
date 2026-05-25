import { useEffect, useState } from "react"
import { Link } from "react-router"
import {
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Users,
  ShieldAlert,
  Wallet,
  Clock,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { PageLoader, PageError } from "~/components/screen-states"
import { supabase } from "~/lib/supabase"
import { formatCurrency } from "~/lib/format"
import type { DashboardStats } from "~/lib/types"

type KPICardProps = {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  description?: string
  href?: string
  variant?: "default" | "success" | "warning" | "danger"
}

function KPICard({
  title,
  value,
  icon: Icon,
  description,
  href,
  variant = "default",
}: KPICardProps) {
  const iconColors = {
    default: "text-muted-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  }

  const content = (
    <Card className="transition-colors hover:bg-muted/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${iconColors[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link to={href}>{content}</Link>
  }
  return content
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [totalVolume, setTotalVolume] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch all counts in parallel
      const [
        totalTx,
        activeTx,
        disputedTx,
        releasedTx,
        refundedTx,
        totalUsersRes,
        highRiskRes,
        volumeRes,
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .in("status", ["funded", "in_delivery", "delivered", "under_inspection"]),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "disputed"),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "released"),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .in("status", ["refunded", "partially_refunded"]),
        supabase
          .from("users")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("fraud_flags")
          .select("id", { count: "exact", head: true })
          .eq("risk_level", "high")
          .eq("status", "active"),
        supabase
          .from("transactions")
          .select("price")
          .in("status", ["funded", "in_delivery", "delivered", "under_inspection", "released"]),
      ])

      setStats({
        totalTransactions: totalTx.count ?? 0,
        activeEscrows: activeTx.count ?? 0,
        disputedTransactions: disputedTx.count ?? 0,
        pendingReview: disputedTx.count ?? 0,
        releasedPayments: releasedTx.count ?? 0,
        refundedPayments: refundedTx.count ?? 0,
        totalUsers: totalUsersRes.count ?? 0,
        highRiskFlags: highRiskRes.count ?? 0,
      })

      const vol = (volumeRes.data ?? []).reduce(
        (sum, row) => sum + (row.price || 0),
        0
      )
      setTotalVolume(vol)
    } catch {
      setError("Failed to load dashboard stats")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  if (loading) return <PageLoader message="Loading dashboard..." />
  if (error) return <PageError message={error} onRetry={fetchStats} />
  if (!stats) return null

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your escrow platform activity
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Transactions"
          value={stats.totalTransactions}
          icon={ArrowLeftRight}
          href="/transactions"
        />
        <KPICard
          title="Active Escrows"
          value={stats.activeEscrows}
          icon={Clock}
          description="Funds currently locked"
          variant="warning"
          href="/transactions"
        />
        <KPICard
          title="Disputed"
          value={stats.disputedTransactions}
          icon={AlertTriangle}
          description="Awaiting admin review"
          variant="danger"
          href="/disputes"
        />
        <KPICard
          title="Released"
          value={stats.releasedPayments}
          icon={CheckCircle}
          variant="success"
          href="/transactions"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Refunded"
          value={stats.refundedPayments}
          icon={RefreshCw}
          variant="warning"
        />
        <KPICard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          href="/users"
        />
        <KPICard
          title="High Risk Flags"
          value={stats.highRiskFlags}
          icon={ShieldAlert}
          description="Active high-risk fraud flags"
          variant="danger"
          href="/fraud-flags"
        />
        <KPICard
          title="Total Volume"
          value={formatCurrency(totalVolume)}
          icon={Wallet}
          description="Value of funded+ transactions"
        />
      </div>
    </div>
  )
}
