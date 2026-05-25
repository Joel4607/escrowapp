import { useEffect, useState } from "react"
import { useParams, Link } from "react-router"
import { ArrowLeft, Eye, X, Image as ImageIcon } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { StatusBadge } from "~/components/status-badge"
import { PageLoader, PageError } from "~/components/screen-states"
import { supabase } from "~/lib/supabase"
import { formatCurrency, formatDate, formatDateTime } from "~/lib/format"
import type { Transaction, Evidence, AuditLog } from "~/lib/types"

type EvidenceWithUrl = Evidence & { signedUrl?: string | null }

export default function TransactionDetailPage() {
  const { id } = useParams()
  const [tx, setTx] = useState<Transaction | null>(null)
  const [evidence, setEvidence] = useState<EvidenceWithUrl[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [txRes, evRes, logsRes] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            "*, buyer:users!transactions_buyer_id_fkey(id, name, phone, email, trust_score, wallet_balance), seller:users!transactions_seller_id_fkey(id, name, phone, email, trust_score, wallet_balance)"
          )
          .eq("id", id)
          .single(),
        supabase
          .from("evidence")
          .select("*")
          .eq("transaction_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("audit_logs")
          .select("*")
          .eq("transaction_id", id)
          .order("created_at", { ascending: true }),
      ])

      if (txRes.error) throw txRes.error
      setTx(txRes.data as Transaction)
      setAuditLogs((logsRes.data as AuditLog[]) ?? [])

      // Sign evidence URLs
      const rawEvidence = (evRes.data as Evidence[]) ?? []
      const signed = await Promise.all(
        rawEvidence.map(async (e) => {
          if (!e.image_url) return e
          try {
            const { data: s } = await supabase.storage
              .from("evidence")
              .createSignedUrl(e.image_url, 3600)
            return { ...e, signedUrl: s?.signedUrl ?? null }
          } catch {
            return e
          }
        })
      )
      setEvidence(signed)
    } catch {
      setError("Failed to load transaction")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  if (loading) return <PageLoader message="Loading transaction..." />
  if (error) return <PageError message={error} onRetry={fetchData} />
  if (!tx) return <PageError message="Transaction not found" />

  const buyer = tx.buyer as any
  const seller = tx.seller as any

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/transactions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-mono">
              {tx.transaction_code}
            </h1>
            <StatusBadge status={tx.status} />
          </div>
          <p className="text-sm text-muted-foreground">{tx.item_name}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Transaction Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono font-medium">
                {formatCurrency(tx.price)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Item Condition</span>
              <span className="capitalize">{tx.item_condition}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span>{tx.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery Deadline</span>
              <span>{formatDate(tx.delivery_deadline)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inspection Period</span>
              <span>{tx.inspection_period}h</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Buyer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{buyer?.name ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-mono">{buyer?.phone ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trust Score</span>
              <span>{buyer?.trust_score ?? "-"}</span>
            </div>
            {buyer?.id && (
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <Link to={`/users/${buyer.id}`}>View profile</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Seller
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{seller?.name ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-mono">{seller?.phone ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trust Score</span>
              <span>{seller?.trust_score ?? "-"}</span>
            </div>
            {seller?.id && (
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <Link to={`/users/${seller.id}`}>View profile</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline Cards */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{formatDateTime(tx.created_at)}</span>
          </div>
          {tx.accepted_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accepted</span>
              <span>{formatDateTime(tx.accepted_at)}</span>
            </div>
          )}
          {tx.funded_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Funded</span>
              <span>{formatDateTime(tx.funded_at)}</span>
            </div>
          )}
          {tx.delivered_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivered</span>
              <span>{formatDateTime(tx.delivered_at)}</span>
            </div>
          )}
          {tx.released_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Released</span>
              <span>{formatDateTime(tx.released_at)}</span>
            </div>
          )}
          {tx.disputed_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Disputed</span>
              <span>{formatDateTime(tx.disputed_at)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence */}
      {evidence.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Evidence ({evidence.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evidence.map((e) => (
                <div
                  key={e.id}
                  className="rounded-md border overflow-hidden group"
                >
                  <div
                    className="relative aspect-video bg-muted flex items-center justify-center cursor-pointer"
                    onClick={() => e.signedUrl && setLightboxUrl(e.signedUrl)}
                  >
                    {e.signedUrl ? (
                      <img
                        src={e.signedUrl}
                        alt={e.evidence_type}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                    )}
                    {e.signedUrl && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={e.evidence_type} />
                      <span className="text-xs text-muted-foreground capitalize">
                        {e.user_role}
                      </span>
                    </div>
                    {e.notes && (
                      <p className="text-xs text-muted-foreground">{e.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Logs */}
      {auditLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{log.action}</p>
                    {log.description && (
                      <p className="text-muted-foreground">{log.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          <img
            src={lightboxUrl}
            alt="Evidence"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
