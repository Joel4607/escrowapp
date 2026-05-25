import { useEffect, useState, useMemo } from "react"
import { Link } from "react-router"
import { Search, Image as ImageIcon, Eye, X } from "lucide-react"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
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
import { formatDateTime } from "~/lib/format"
import type { Evidence } from "~/lib/types"

type EvidenceWithMeta = Evidence & {
  user?: { id: string; name: string | null; phone: string } | null
  transaction?: { id: string; transaction_code: string; item_name: string } | null
  signedUrl?: string | null
}

export default function EvidencePage() {
  const [evidence, setEvidence] = useState<EvidenceWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [roleFilter, setRoleFilter] = useState("all")
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const fetchEvidence = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from("evidence")
        .select(
          "*, user:users!evidence_uploaded_by_fkey(id, name, phone), transaction:transactions!evidence_transaction_id_fkey(id, transaction_code, item_name)"
        )
        .order("created_at", { ascending: false })

      if (err) throw err
      const items = (data as EvidenceWithMeta[]) ?? []

      // Generate signed URLs for all evidence images
      const withUrls = await Promise.all(
        items.map(async (item) => {
          if (!item.image_url) return item
          try {
            const { data: signed } = await supabase.storage
              .from("evidence")
              .createSignedUrl(item.image_url, 3600)
            return { ...item, signedUrl: signed?.signedUrl ?? null }
          } catch {
            return item
          }
        })
      )

      setEvidence(withUrls)
    } catch {
      setError("Failed to load evidence")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvidence()
  }, [])

  const filtered = useMemo(() => {
    let result = evidence
    if (typeFilter !== "all") {
      result = result.filter((e) => e.evidence_type === typeFilter)
    }
    if (roleFilter !== "all") {
      result = result.filter((e) => e.user_role === roleFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.notes?.toLowerCase().includes(q) ||
          e.evidence_type.toLowerCase().includes(q) ||
          e.transaction?.transaction_code?.toLowerCase().includes(q) ||
          e.transaction?.item_name?.toLowerCase().includes(q) ||
          e.user?.name?.toLowerCase().includes(q)
      )
    }
    return result
  }, [evidence, typeFilter, roleFilter, search])

  if (loading) return <PageLoader message="Loading evidence..." />
  if (error) return <PageError message={error} onRetry={fetchEvidence} />

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Evidence</h1>
        <p className="text-sm text-muted-foreground">
          Browse all uploaded evidence across transactions
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by notes, type, code..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="item_photo">Item Photo</SelectItem>
            <SelectItem value="pre_delivery">Pre Delivery</SelectItem>
            <SelectItem value="received_item">Received Item</SelectItem>
            <SelectItem value="dispute_evidence">Dispute Evidence</SelectItem>
            <SelectItem value="delivery_proof">Delivery Proof</SelectItem>
            <SelectItem value="unboxing">Unboxing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="buyer">Buyer</SelectItem>
            <SelectItem value="seller">Seller</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No evidence found"
          description="No evidence has been uploaded yet."
          icon={ImageIcon}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border bg-card overflow-hidden group"
            >
              {/* Image */}
              <div
                className="relative aspect-square bg-muted flex items-center justify-center cursor-pointer"
                onClick={() => e.signedUrl && setLightboxUrl(e.signedUrl)}
              >
                {e.signedUrl ? (
                  <img
                    src={e.signedUrl}
                    alt={e.evidence_type}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                )}
                {e.signedUrl && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Eye className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <StatusBadge status={e.evidence_type} />
                  <span className="text-xs font-medium capitalize px-1.5 py-0.5 rounded bg-muted">
                    {e.user_role}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium text-foreground">
                      {e.user?.name ?? e.user?.phone ?? "-"}
                    </span>
                  </p>
                  {e.transaction && (
                    <p>
                      <Link
                        to={`/transactions/${e.transaction.id}`}
                        className="text-primary hover:underline font-mono"
                      >
                        {e.transaction.transaction_code}
                      </Link>
                      {" — "}
                      {e.transaction.item_name}
                    </p>
                  )}
                  {e.notes && <p className="italic">{e.notes}</p>}
                  <p>{formatDateTime(e.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
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
