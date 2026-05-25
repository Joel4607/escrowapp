import { useEffect, useState } from "react"
import { useParams, Link } from "react-router"
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileQuestion,
  Image as ImageIcon,
  Eye,
  X,
} from "lucide-react"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Textarea } from "~/components/ui/textarea"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { StatusBadge } from "~/components/status-badge"
import { PageLoader, PageError } from "~/components/screen-states"
import { supabase } from "~/lib/supabase"
import {
  formatCurrency,
  formatDateTime,
  formatStatus,
} from "~/lib/format"
import type { Dispute, Evidence, AuditLog } from "~/lib/types"

type FullDispute = Dispute & {
  transaction: {
    id: string
    transaction_code: string
    item_name: string
    price: number
    status: string
    buyer_id: string
    seller_id: string | null
  } | null
  opener: { id: string; name: string | null; phone: string } | null
}

type EvidenceWithUrl = Evidence & { signedUrl?: string | null }

type DecisionType =
  | "release_to_seller"
  | "refund_buyer"
  | "partial_refund"
  | "dismissed"
  | "request_evidence"

export default function DisputeDetailPage() {
  const { id } = useParams()
  const [dispute, setDispute] = useState<FullDispute | null>(null)
  const [evidence, setEvidence] = useState<EvidenceWithUrl[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Decision modal state
  const [decisionModal, setDecisionModal] = useState<DecisionType | null>(null)
  const [adminNotes, setAdminNotes] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const { data: disputeData, error: dErr } = await supabase
        .from("disputes")
        .select(
          "*, transaction:transactions(id, transaction_code, item_name, price, status, buyer_id, seller_id), opener:users!disputes_opened_by_fkey(id, name, phone)"
        )
        .eq("id", id)
        .single()

      if (dErr) throw dErr

      const d = disputeData as FullDispute
      setDispute(d)

      if (d.transaction_id) {
        const [evRes, logRes] = await Promise.all([
          supabase
            .from("evidence")
            .select("*")
            .eq("transaction_id", d.transaction_id)
            .order("created_at", { ascending: true }),
          supabase
            .from("audit_logs")
            .select("*")
            .eq("transaction_id", d.transaction_id)
            .order("created_at", { ascending: true }),
        ])

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
        setAuditLogs((logRes.data as AuditLog[]) ?? [])
      }
    } catch {
      setError("Failed to load dispute")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const handleDecision = async () => {
    if (!decisionModal || !id) return
    setSubmitting(true)
    setActionError(null)

    try {
      if (decisionModal === "request_evidence") {
        const { error: err } = await supabase.rpc("admin_request_evidence", {
          p_dispute_id: id,
          p_admin_notes: adminNotes || null,
        })
        if (err) throw err
      } else {
        const params: Record<string, unknown> = {
          p_dispute_id: id,
          p_decision: decisionModal,
          p_admin_notes: adminNotes || null,
        }
        if (decisionModal === "partial_refund") {
          const amount = parseFloat(refundAmount)
          if (isNaN(amount) || amount <= 0) {
            setActionError("Enter a valid refund amount")
            setSubmitting(false)
            return
          }
          params.p_refund_amount = amount
        }
        const { error: err } = await supabase.rpc(
          "admin_resolve_dispute",
          params
        )
        if (err) throw err
      }

      setDecisionModal(null)
      setAdminNotes("")
      setRefundAmount("")
      await fetchData()
    } catch (e: any) {
      setActionError(e?.message ?? "Failed to execute decision")
    } finally {
      setSubmitting(false)
    }
  }

  const openDecision = (type: DecisionType) => {
    setDecisionModal(type)
    setAdminNotes("")
    setRefundAmount("")
    setActionError(null)
  }

  if (loading) return <PageLoader message="Loading dispute..." />
  if (error) return <PageError message={error} onRetry={fetchData} />
  if (!dispute) return <PageError message="Dispute not found" />

  const isOpen = dispute.status !== "resolved"

  const decisionLabels: Record<DecisionType, { label: string; desc: string }> = {
    release_to_seller: {
      label: "Release to Seller",
      desc: "Release all escrowed funds to the seller. Use when seller evidence is strong and buyer claim is weak.",
    },
    refund_buyer: {
      label: "Refund Buyer",
      desc: "Refund all escrowed funds to the buyer. Use when buyer evidence is strong (fake product, wrong item, etc).",
    },
    partial_refund: {
      label: "Partial Refund",
      desc: "Split the escrowed funds between buyer and seller. Use when both parties share responsibility.",
    },
    dismissed: {
      label: "Dismiss Dispute",
      desc: "Dismiss the dispute and return the transaction to inspection. Funds stay locked.",
    },
    request_evidence: {
      label: "Request More Evidence",
      desc: "Ask buyer or seller for additional evidence before making a decision.",
    },
  }

  // Split evidence by role for side-by-side view
  const buyerEvidence = evidence.filter((e) => e.user_role === "buyer")
  const sellerEvidence = evidence.filter((e) => e.user_role === "seller")

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/disputes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Dispute</h1>
            <StatusBadge status={dispute.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {dispute.transaction?.transaction_code} &middot;{" "}
            {dispute.transaction?.item_name}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Dispute Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Dispute Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reason</span>
              <span className="font-medium">{dispute.reason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opened By</span>
              <span>
                {dispute.opener?.name ?? dispute.opener?.phone ?? "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono font-medium">
                {dispute.transaction
                  ? formatCurrency(dispute.transaction.price)
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDateTime(dispute.created_at)}</span>
            </div>
            {dispute.resolved_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolved</span>
                <span>{formatDateTime(dispute.resolved_at)}</span>
              </div>
            )}
            {dispute.admin_decision && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Decision</span>
                <StatusBadge status={dispute.admin_decision} />
              </div>
            )}
            {dispute.description && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-xs mb-1">
                  Description
                </p>
                <p>{dispute.description}</p>
              </div>
            )}
            {dispute.admin_notes && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-xs mb-1">
                  Admin Notes
                </p>
                <p>{dispute.admin_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction link */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Related Transaction
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {dispute.transaction && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span className="font-mono">
                    {dispute.transaction.transaction_code}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Item</span>
                  <span>{dispute.transaction.item_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={dispute.transaction.status} />
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  asChild
                >
                  <Link to={`/transactions/${dispute.transaction.id}`}>
                    View full transaction →
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Evidence Side-by-Side */}
      {evidence.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Evidence Comparison ({evidence.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Buyer Evidence */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Buyer Evidence ({buyerEvidence.length})
                </h4>
                {buyerEvidence.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No buyer evidence submitted
                  </p>
                ) : (
                  <div className="space-y-3">
                    {buyerEvidence.map((e) => (
                      <EvidenceCard
                        key={e.id}
                        evidence={e}
                        onView={() =>
                          e.signedUrl && setLightboxUrl(e.signedUrl)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Seller Evidence */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Seller Evidence ({sellerEvidence.length})
                </h4>
                {sellerEvidence.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No seller evidence submitted
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sellerEvidence.map((e) => (
                      <EvidenceCard
                        key={e.id}
                        evidence={e}
                        onView={() =>
                          e.signedUrl && setLightboxUrl(e.signedUrl)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Timeline */}
      {auditLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Audit Timeline
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

      {/* Admin Decision Panel */}
      {isOpen && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Admin Decision Panel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Review the evidence and timeline above, then choose an action.
              {dispute.transaction && (
                <span className="font-medium">
                  {" "}
                  Escrowed amount:{" "}
                  {formatCurrency(dispute.transaction.price)}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => openDecision("release_to_seller")}
              >
                <CheckCircle className="mr-1.5 h-4 w-4" />
                Release to Seller
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDecision("refund_buyer")}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Refund Buyer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDecision("partial_refund")}
              >
                Partial Refund
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDecision("request_evidence")}
              >
                <FileQuestion className="mr-1.5 h-4 w-4" />
                Request Evidence
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => openDecision("dismissed")}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decision Confirmation Dialog */}
      <Dialog
        open={decisionModal !== null}
        onOpenChange={(open) => !open && setDecisionModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionModal && decisionLabels[decisionModal].label}
            </DialogTitle>
            <DialogDescription>
              {decisionModal && decisionLabels[decisionModal].desc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {decisionModal === "partial_refund" && dispute?.transaction && (
              <div className="space-y-2">
                <Label htmlFor="refund-amount">
                  Refund amount to buyer (max{" "}
                  {formatCurrency(dispute.transaction.price)})
                </Label>
                <Input
                  id="refund-amount"
                  type="number"
                  placeholder="e.g. 500"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  min={1}
                  max={dispute.transaction.price - 1}
                />
                {refundAmount && !isNaN(parseFloat(refundAmount)) && (
                  <p className="text-xs text-muted-foreground">
                    Buyer gets:{" "}
                    {formatCurrency(parseFloat(refundAmount))} | Seller
                    gets:{" "}
                    {formatCurrency(
                      dispute.transaction.price - parseFloat(refundAmount)
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="admin-notes">Admin Notes (optional)</Label>
              <Textarea
                id="admin-notes"
                placeholder="Reason for this decision..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </div>

            {actionError && (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecisionModal(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleDecision} disabled={submitting}>
              {submitting ? "Processing..." : "Confirm Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence Lightbox */}
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

/** Evidence card with thumbnail and info */
function EvidenceCard({
  evidence,
  onView,
}: {
  evidence: EvidenceWithUrl
  onView: () => void
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-muted flex items-center justify-center cursor-pointer group"
        onClick={onView}
      >
        {evidence.signedUrl ? (
          <img
            src={evidence.signedUrl}
            alt={evidence.evidence_type}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
        )}
        {evidence.signedUrl && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between">
          <StatusBadge status={evidence.evidence_type} />
        </div>
        {evidence.notes && (
          <p className="text-xs text-muted-foreground">{evidence.notes}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatDateTime(evidence.created_at)}
        </p>
      </div>
    </div>
  )
}
