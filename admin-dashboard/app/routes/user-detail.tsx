import { useEffect, useState } from "react"
import { useParams, Link } from "react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { StatusBadge } from "~/components/status-badge"
import { PageLoader, PageError } from "~/components/screen-states"
import { supabase } from "~/lib/supabase"
import { formatCurrency, formatDate } from "~/lib/format"
import type { User, Transaction } from "~/lib/types"

export default function UserDetailPage() {
  const { id } = useParams()
  const [user, setUser] = useState<User | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [userRes, txRes] = await Promise.all([
        supabase.from("users").select("*").eq("id", id).single(),
        supabase
          .from("transactions")
          .select("*")
          .or(`buyer_id.eq.${id},seller_id.eq.${id}`)
          .order("created_at", { ascending: false })
          .limit(50),
      ])

      if (userRes.error) throw userRes.error
      setUser(userRes.data as User)
      setTransactions((txRes.data as Transaction[]) ?? [])
    } catch {
      setError("Failed to load user")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  if (loading) return <PageLoader message="Loading user..." />
  if (error) return <PageError message={error} onRetry={fetchData} />
  if (!user) return <PageError message="User not found" />

  const disputeCount = transactions.filter(
    (t) => t.status === "disputed"
  ).length
  const completedCount = transactions.filter(
    (t) => t.status === "released"
  ).length

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{user.name ?? "Unnamed User"}</h1>
            <StatusBadge status={user.status} />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            {user.phone}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Trust Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{user.trust_score}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Wallet Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(user.wallet_balance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Locked Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(user.locked_balance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{transactions.length}</p>
            <p className="text-xs text-muted-foreground">
              {completedCount} completed, {disputeCount} disputed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Profile details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-mono">{user.phone}</span>
          </div>
          {user.email && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{user.email}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Verified</span>
            <span>{user.is_verified ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Joined</span>
            <span>{formatDate(user.created_at)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transactions.slice(0, 10).map((tx) => (
                <Link
                  key={tx.id}
                  to={`/transactions/${tx.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {tx.transaction_code}
                    </span>
                    <span className="text-muted-foreground">{tx.item_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">
                      {formatCurrency(tx.price)}
                    </span>
                    <StatusBadge status={tx.status} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
