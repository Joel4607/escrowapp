import { useEffect, useState } from "react"
import { Link } from "react-router"
import { Search } from "lucide-react"
import { Input } from "~/components/ui/input"
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
import { formatCurrency, formatDateTime } from "~/lib/format"

type LedgerRow = {
  id: string
  transaction_id: string
  from_user_id: string
  to_user_id: string | null
  amount: number
  type: string
  status: string
  created_at: string
  transaction?: { transaction_code: string; item_name: string } | null
  from_user?: { name: string | null; phone: string } | null
  to_user?: { name: string | null; phone: string } | null
}

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState("all")
  const [search, setSearch] = useState("")

  const fetchLedger = async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from("escrow_ledger")
        .select(
          "*, transaction:transactions!escrow_ledger_transaction_id_fkey(transaction_code, item_name), from_user:users!escrow_ledger_from_user_id_fkey(name, phone), to_user:users!escrow_ledger_to_user_id_fkey(name, phone)"
        )
        .order("created_at", { ascending: false })
        .limit(200)

      if (typeFilter !== "all") {
        query = query.eq("type", typeFilter)
      }

      const { data, error: err } = await query

      if (err) throw err
      setEntries((data as LedgerRow[]) ?? [])
    } catch {
      setError("Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLedger()
  }, [typeFilter])

  const filtered = search.trim()
    ? entries.filter(
        (e) =>
          e.transaction?.transaction_code
            ?.toLowerCase()
            .includes(search.toLowerCase()) ||
          e.transaction?.item_name
            ?.toLowerCase()
            .includes(search.toLowerCase()) ||
          e.from_user?.name?.toLowerCase().includes(search.toLowerCase()) ||
          e.to_user?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : entries

  if (loading) return <PageLoader message="Loading ledger..." />
  if (error) return <PageError message={error} onRetry={fetchLedger} />

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Wallet Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Track all money movements across the platform
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, item, user..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="fund">Fund</SelectItem>
            <SelectItem value="release">Release</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
            <SelectItem value="partial_refund">Partial Refund</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No ledger entries" description="No money movements have been recorded yet." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.transaction ? (
                      <Link
                        to={`/transactions/${entry.transaction_id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {entry.transaction.transaction_code}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.from_user?.name ?? entry.from_user?.phone ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.to_user?.name ?? entry.to_user?.phone ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {formatCurrency(entry.amount)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.type} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)}
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
