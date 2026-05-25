import { useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { StatusBadge } from "~/components/status-badge"
import { RiskBadge } from "~/components/risk-badge"
import { PageLoader, PageError, EmptyState } from "~/components/screen-states"
import { supabase } from "~/lib/supabase"
import { formatDate, formatStatus } from "~/lib/format"
import type { FraudFlag } from "~/lib/types"

export default function FraudFlagsPage() {
  const [flags, setFlags] = useState<FraudFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")

  const fetchFlags = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from("fraud_flags")
        .select("*")
        .order("created_at", { ascending: false })

      if (err) throw err
      setFlags((data as FraudFlag[]) ?? [])
    } catch {
      setError("Failed to load fraud flags")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFlags()
  }, [])

  const filtered =
    statusFilter === "all"
      ? flags
      : flags.filter((f) => f.status === statusFilter)

  if (loading) return <PageLoader message="Loading fraud flags..." />
  if (error) return <PageError message={error} onRetry={fetchFlags} />

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Fraud Flags</h1>
        <p className="text-sm text-muted-foreground">
          Review flagged suspicious activity
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No fraud flags" description="No suspicious activity flagged." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag Type</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="text-sm">
                    {formatStatus(flag.flag_type)}
                  </TableCell>
                  <TableCell>
                    <RiskBadge level={flag.risk_level} />
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate text-sm">
                    {flag.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={flag.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(flag.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
