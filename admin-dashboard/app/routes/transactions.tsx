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
import { formatCurrency, formatDate } from "~/lib/format"
import type { Transaction } from "~/lib/types"

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active (Funded/Delivery/Inspection)" },
  { value: "disputed", label: "Disputed" },
  { value: "released", label: "Released" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled/Expired" },
]

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const fetchTransactions = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from("transactions")
        .select(
          "*, buyer:users!transactions_buyer_id_fkey(id, name, phone), seller:users!transactions_seller_id_fkey(id, name, phone)"
        )
        .order("created_at", { ascending: false })
        .limit(200)

      if (err) throw err
      setTransactions((data as Transaction[]) ?? [])
    } catch {
      setError("Failed to load transactions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [])

  const filtered = useMemo(() => {
    let result = transactions

    // Status filter
    if (statusFilter !== "all") {
      const statusMap: Record<string, string[]> = {
        active: ["funded", "in_delivery", "delivered", "under_inspection"],
        disputed: ["disputed"],
        released: ["released"],
        refunded: ["refunded", "partially_refunded"],
        cancelled: ["cancelled", "expired", "rejected"],
      }
      const statuses = statusMap[statusFilter] ?? []
      result = result.filter((t) => statuses.includes(t.status))
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.transaction_code.toLowerCase().includes(q) ||
          t.item_name.toLowerCase().includes(q) ||
          (t.buyer as any)?.name?.toLowerCase()?.includes(q) ||
          (t.seller as any)?.name?.toLowerCase()?.includes(q)
      )
    }

    return result
  }, [transactions, statusFilter, search])

  if (loading) return <PageLoader message="Loading transactions..." />
  if (error) return <PageError message={error} onRetry={fetchTransactions} />

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          View and manage all escrow transactions
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, item, or user..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]">
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
          title="No transactions found"
          description={
            search || statusFilter !== "all"
              ? "Try changing your filters."
              : "No transactions have been created yet."
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-xs">
                    {tx.transaction_code}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {tx.item_name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(tx.buyer as any)?.name ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(tx.seller as any)?.name ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(tx.price)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={tx.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(tx.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link to={`/transactions/${tx.id}`}>
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
