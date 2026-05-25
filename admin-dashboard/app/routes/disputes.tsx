import { useEffect, useState, useMemo } from "react"
import { Link } from "react-router"
import { Search, Eye } from "lucide-react"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
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
import { PageLoader, PageError, EmptyState } from "~/components/screen-states"
import { supabase } from "~/lib/supabase"
import { formatCurrency, formatDate, formatStatus } from "~/lib/format"
import type { Dispute } from "~/lib/types"

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under Review" },
  { value: "awaiting_evidence", label: "Awaiting Evidence" },
  { value: "resolved", label: "Resolved" },
]

type DisputeWithJoins = Dispute & {
  transaction: {
    id: string
    transaction_code: string
    item_name: string
    price: number
  } | null
  opener: { id: string; name: string | null; phone: string } | null
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<DisputeWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const fetchDisputes = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from("disputes")
        .select(
          "*, transaction:transactions(id, transaction_code, item_name, price), opener:users!disputes_opened_by_fkey(id, name, phone)"
        )
        .order("created_at", { ascending: false })

      if (err) throw err
      setDisputes((data as DisputeWithJoins[]) ?? [])
    } catch {
      setError("Failed to load disputes")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDisputes()
  }, [])

  const filtered = useMemo(() => {
    let result = disputes

    if (statusFilter !== "all") {
      result = result.filter((d) => d.status === statusFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (d) =>
          d.reason.toLowerCase().includes(q) ||
          d.transaction?.transaction_code?.toLowerCase()?.includes(q) ||
          d.transaction?.item_name?.toLowerCase()?.includes(q) ||
          d.opener?.name?.toLowerCase()?.includes(q)
      )
    }

    return result
  }, [disputes, statusFilter, search])

  if (loading) return <PageLoader message="Loading disputes..." />
  if (error) return <PageError message={error} onRetry={fetchDisputes} />

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Disputes</h1>
        <p className="text-sm text-muted-foreground">
          Review and resolve transaction disputes
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by reason, code, or user..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No disputes found"
          description={
            search || statusFilter !== "all"
              ? "Try changing your filters."
              : "No disputes have been opened yet."
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Opened By</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">
                    {d.transaction?.transaction_code ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.opener?.name ?? d.opener?.phone ?? "-"}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm">
                    {d.reason}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {d.transaction
                      ? formatCurrency(d.transaction.price)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.admin_decision
                      ? formatStatus(d.admin_decision)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(d.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link to={`/disputes/${d.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
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
