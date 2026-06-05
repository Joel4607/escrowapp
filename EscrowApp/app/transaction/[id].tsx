import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScreenLoader, ScreenError } from "@/components/screen-state";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { useUserProfile } from "@/features/user/use-user-profile";
import { useTransaction } from "@/features/transactions/use-transaction";
import { useReturnTransaction } from "@/features/returns/use-return-transaction";
import { useEvidence } from "@/features/evidence/use-evidence";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import { EvidenceUploadButton } from "@/features/evidence/components/evidence-upload-button";
import { EvidenceGallery } from "@/features/evidence/components/evidence-gallery";
import {
  canArchiveTransactionForUser,
  canDeleteTransactionForUser,
} from "@/features/transactions/use-transactions";
import { supabase } from "@/lib/supabase";
import {
  formatCurrency,
  formatRelativeDate,
  getStatusLabel,
} from "@/lib/format";
import type {
  Database,
  TransactionStatus,
} from "@/lib/database.types";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Share,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

// Happy-path status order for timeline display
const TIMELINE_STATUSES: TransactionStatus[] = [
  "created",
  "seller_invited",
  "accepted",
  "funded",
  "in_delivery",
  "delivered",
  "under_inspection",
  "released",
];

// Map statuses to their timestamp fields
const STATUS_TIMESTAMPS: Partial<Record<TransactionStatus, keyof Transaction>> = {
  created: "created_at",
  accepted: "accepted_at",
  funded: "funded_at",
  delivered: "delivered_at",
  released: "released_at",
  disputed: "disputed_at",
};

function StatusTimeline({ transaction }: { transaction: Transaction }) {
  const currentIndex = TIMELINE_STATUSES.indexOf(transaction.status);
  const isTerminal = ["rejected", "disputed", "refunded", "partially_refunded", "cancelled", "expired", "admin_review"].includes(transaction.status);

  const statuses = isTerminal
    ? [...TIMELINE_STATUSES, transaction.status]
    : TIMELINE_STATUSES;

  return (
    <View className="gap-0">
      {statuses.map((status, index) => {
        const tsKey = STATUS_TIMESTAMPS[status];
        const timestamp = tsKey ? (transaction[tsKey] as string | null) : null;
        const isDone =
          isTerminal
            ? index <= statuses.length - 1
            : index <= currentIndex;
        const isCurrent =
          isTerminal
            ? index === statuses.length - 1
            : index === currentIndex;

        return (
          <View key={status} className="flex-row gap-3">
            {/* Dot + line */}
            <View className="items-center" style={{ width: 20 }}>
              <View
                className={`h-4 w-4 rounded-full mt-1 ${
                  isCurrent
                    ? "bg-primary"
                    : isDone
                    ? "bg-primary/40"
                    : "bg-secondary"
                }`}
              />
              {index < statuses.length - 1 && (
                <View
                  className={`w-0.5 flex-1 min-h-6 ${
                    isDone ? "bg-primary/30" : "bg-border"
                  }`}
                />
              )}
            </View>

            {/* Label + timestamp */}
            <View className="flex-1 pb-4">
              <Text
                className={`font-medium text-sm ${
                  isCurrent
                    ? "text-foreground"
                    : isDone
                    ? "text-foreground/70"
                    : "text-muted-foreground"
                }`}
              >
                {getStatusLabel(status)}
              </Text>
              {timestamp && (
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {formatRelativeDate(timestamp)}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="text-foreground text-base font-semibold">{title}</Text>
      <Card className="py-4 px-4 gap-3">{children}</Card>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-muted-foreground text-sm flex-1">{label}</Text>
      <Text className="text-foreground text-sm font-medium text-right flex-1">
        {value}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────────────
// Action panel sub-components
// ──────────────────────────────────────────────

async function createInviteLink(transactionId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-invite`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ transaction_id: transactionId }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create invite");
  }

  return data.invite_url;
}

async function sendReleaseEmail(
  transactionId: string,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-release-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ transaction_id: transactionId }),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error: data.error || data.details || "Release email could not be sent",
    };
  }

  return { ok: true };
}

function shareInviteLink(inviteUrl: string) {
  Share.share({
    message: `You've been invited to an escrow transaction on EscrowApp. Review and accept here: ${inviteUrl}`,
  });
}

function InviteSellerPanel({
  transaction,
  onRefetch,
  inviteUrl,
  onInviteUrlGenerated,
}: {
  transaction: Transaction;
  onRefetch: () => void;
  inviteUrl: string | null;
  onInviteUrlGenerated: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const url = await createInviteLink(transaction.id);
      onInviteUrlGenerated(url);
      onRefetch();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = () => {
    if (inviteUrl) {
      shareInviteLink(inviteUrl);
    }
  };

  const handleShareCode = () => {
    Share.share({ message: transaction.transaction_code });
  };

  return (
    <View className="gap-3">
      {inviteUrl ? (
        <>
          <View className="bg-primary/10 rounded-xl p-4">
            <Text className="text-primary text-sm font-semibold mb-1">
              Invite Link Ready
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={2}>
              {inviteUrl}
            </Text>
          </View>
          <Button onPress={handleShareLink}>
            <Text className="text-primary-foreground font-semibold">
              Share Invite Link
            </Text>
          </Button>
        </>
      ) : (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Generate a secure link so the seller can accept from their browser — no app needed.
          </Text>
          <Button onPress={handleGenerateLink} disabled={loading}>
            <Text className="text-primary-foreground font-semibold">
              {loading ? "Generating..." : "Generate Invite Link"}
            </Text>
          </Button>
        </>
      )}

      {/* Fallback: share transaction code for mobile-to-mobile */}
      <View className="bg-secondary rounded-xl p-4 mt-1">
        <Text className="text-muted-foreground text-sm mb-1">
          Transaction Code (for app users)
        </Text>
        <Text className="text-foreground text-xl font-bold tracking-widest">
          {transaction.transaction_code}
        </Text>
      </View>
      <Button variant="outline" onPress={handleShareCode}>
        <Text className="text-foreground font-medium">Share Code</Text>
      </Button>
    </View>
  );
}

function AwaitingSellerPanel({
  transaction,
  inviteUrl,
  onInviteUrlGenerated,
}: {
  transaction: Transaction;
  inviteUrl: string | null;
  onInviteUrlGenerated: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const url = await createInviteLink(transaction.id);
      onInviteUrlGenerated(url);
      shareInviteLink(url);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = () => {
    if (inviteUrl) {
      shareInviteLink(inviteUrl);
    }
  };

  const handleShareCode = () => {
    Share.share({ message: transaction.transaction_code });
  };

  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-sm text-center">
        Waiting for the seller to accept the transaction via the invite link or app.
      </Text>

      {inviteUrl ? (
        <>
          <View className="bg-primary/10 rounded-xl p-4">
            <Text className="text-primary text-sm font-semibold mb-1">
              Invite Link Ready
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={2}>
              {inviteUrl}
            </Text>
          </View>
          <Button onPress={handleShareLink}>
            <Text className="text-primary-foreground font-semibold">
              Share Invite Link
            </Text>
          </Button>
        </>
      ) : (
        <Button onPress={handleGenerateLink} disabled={loading}>
          <Text className="text-primary-foreground font-semibold">
            {loading ? "Generating..." : "Generate New Invite Link"}
          </Text>
        </Button>
      )}

      <View className="bg-secondary rounded-xl p-4 mt-1">
        <Text className="text-muted-foreground text-sm mb-1">
          Transaction Code (for app users)
        </Text>
        <Text className="text-foreground text-xl font-bold tracking-widest">
          {transaction.transaction_code}
        </Text>
      </View>
      <Button variant="outline" onPress={handleShareCode}>
        <Text className="text-foreground font-medium">Share Code</Text>
      </Button>
    </View>
  );
}

function SellerRespondPanel({
  transaction,
  onRefetch,
}: {
  transaction: Transaction;
  onRefetch: () => void;
}) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sellerLocation, setSellerLocation] = useState("");
  const [returnConditions, setReturnConditions] = useState("");

  const handleAccept = async () => {
    if (!session?.user) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("accept_transaction", {
        p_transaction_id: transaction.id,
        p_seller_location: sellerLocation.trim() || undefined,
        p_return_conditions: returnConditions.trim() || undefined,
      });
      if (error) Alert.alert("Error", error.message);
      else onRefetch();
    } finally {
      setLoading(false);
    }
  };

  const handleReject = () => {
    Alert.alert(
      "Reject Transaction",
      "Are you sure you want to reject this transaction?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.rpc("reject_transaction", {
                p_transaction_id: transaction.id,
              });
              if (error) Alert.alert("Error", error.message);
              else onRefetch();
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="gap-3">
      <Text className="text-foreground font-semibold text-center">
        {"You've been invited as the seller"}
      </Text>
      <Text className="text-muted-foreground text-sm text-center">
        Review the transaction details above, then accept or reject.
      </Text>
      <View className="gap-2">
        <Text className="text-foreground text-sm font-medium">Your Location (City/Area)</Text>
        <Input
          className="h-12 rounded-xl"
          placeholder="e.g. Lagos, Lekki"
          value={sellerLocation}
          onChangeText={setSellerLocation}
        />
      </View>
      <View className="gap-2">
        <Text className="text-foreground text-sm font-medium">Return Conditions (Optional)</Text>
        <Input
          className="h-20 rounded-xl"
          placeholder="e.g. Must include original box, charger, and accessories"
          multiline
          textAlignVertical="top"
          value={returnConditions}
          onChangeText={setReturnConditions}
        />
      </View>
      <Button onPress={handleAccept} disabled={loading}>
        <Text className="text-primary-foreground font-semibold">
          {loading ? "Processing..." : "Accept Transaction"}
        </Text>
      </Button>
      <Button variant="outline" onPress={handleReject} disabled={loading}>
        <Text className="text-destructive font-semibold">Reject</Text>
      </Button>
    </View>
  );
}

function FundEscrowPanel({
  transaction,
  onRefetch,
}: {
  transaction: Transaction;
  onRefetch: () => void;
}) {
  const { session } = useAuth();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const [loading, setLoading] = useState(false);

  const hasFunds = (profile?.wallet_balance ?? 0) >= transaction.price;
  const afterLock = (profile?.wallet_balance ?? 0) - transaction.price;
  const router = useRouter();

  const handleFund = () => {
    Alert.alert(
      "Lock funds in escrow",
      `${formatCurrency(transaction.price)} will be locked until the transaction completes. Remaining balance: ${formatCurrency(afterLock)}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Lock Funds",
          onPress: async () => {
            if (!session?.user || !profile) return;
            setLoading(true);

            try {
              const { error } = await supabase.rpc("fund_escrow", {
                p_transaction_id: transaction.id,
              });

              if (error) {
                Alert.alert("Error", error.message);
                return;
              }

              await refetchProfile();
              onRefetch();
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  if (!hasFunds) {
    return (
      <View className="gap-3">
        <Text className="text-muted-foreground text-sm text-center">
          Insufficient balance. You need {formatCurrency(transaction.price)} but
          have {formatCurrency(profile?.wallet_balance ?? 0)}.
        </Text>
        <Button onPress={() => router.push("/(tabs)/wallet")}>
          <Text className="text-primary-foreground font-semibold">
            Add Money to Wallet
          </Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="bg-secondary rounded-xl p-4 gap-2">
        <DetailRow label="Amount to lock" value={formatCurrency(transaction.price)} />
        <DetailRow label="Balance after" value={formatCurrency(afterLock)} />
      </View>
      <Button onPress={handleFund} disabled={loading}>
        <Text className="text-primary-foreground font-semibold">
          {loading ? "Processing..." : "Lock Funds in Escrow"}
        </Text>
      </Button>
    </View>
  );
}

function AwaitingFundingPanel() {
  return (
    <Text className="text-muted-foreground text-sm text-center">
      Waiting for the buyer to lock funds in escrow.
    </Text>
  );
}

function GenerateTokenPanel({
  transaction,
  onRefetch,
}: {
  transaction: Transaction;
  onRefetch: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!transaction.seller_id) {
      Alert.alert("Error", "No seller assigned to this transaction.");
      return;
    }
    setLoading(true);
    try {
      const { data: token, error } = await supabase.rpc("generate_delivery_token", {
        p_transaction_id: transaction.id,
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      onRefetch();
      router.push({ pathname: "/transaction/token-qr", params: { token } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-sm text-center">
        Generate a delivery token to give to the buyer when you hand over the
        item.
      </Text>
      <Button onPress={handleGenerate} disabled={loading}>
        <Text className="text-primary-foreground font-semibold">
          {loading ? "Generating..." : "Generate Delivery Token"}
        </Text>
      </Button>
    </View>
  );
}

function AwaitingDeliveryPanel({
  transaction,
  onRefetch,
}: {
  transaction: Transaction;
  onRefetch: () => void;
}) {
  const { refetch: refetchProfile } = useUserProfile();
  const [loading, setLoading] = useState(false);

  const handleCancel = () => {
    Alert.alert(
      "Cancel Transaction",
      `Cancel and refund ${formatCurrency(transaction.price)} back to your wallet? This cannot be undone.`,
      [
        { text: "Keep Waiting", style: "cancel" },
        {
          text: "Cancel & Refund",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.rpc("cancel_escrow", {
                p_transaction_id: transaction.id,
              });
              if (error) {
                Alert.alert("Error", error.message);
                return;
              }
              await refetchProfile();
              onRefetch();
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-sm text-center">
        Funds are locked. Waiting for the seller to hand over the item.
      </Text>
      <Button variant="outline" onPress={handleCancel} disabled={loading}>
        <Text className="text-destructive font-semibold">
          {loading ? "Processing..." : "Cancel & Refund"}
        </Text>
      </Button>
    </View>
  );
}

function ScanTokenPanel({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-sm text-center">
        Ask the seller for the delivery token when you receive the item, then
        enter it here to confirm delivery.
      </Text>
      <Button
        onPress={() =>
          router.push({ pathname: "/transaction/scan-token", params: { id: transaction.id } })
        }
      >
        <Text className="text-primary-foreground font-semibold">
          Enter Delivery Token
        </Text>
      </Button>
    </View>
  );
}

function AwaitingPickupPanel() {
  return (
    <Text className="text-muted-foreground text-sm text-center">
      Delivery token generated. Waiting for the buyer to confirm receipt.
    </Text>
  );
}

function InspectionPanel({
  transaction,
  onRefetch,
}: {
  transaction: Transaction;
  onRefetch: () => void;
}) {
  const { session } = useAuth();
  const { refetch: refetchProfile } = useUserProfile();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // inspection_period stored in hours in DB
  const inspectionDeadline =
    transaction.delivered_at
      ? new Date(
          new Date(transaction.delivered_at).getTime() +
            transaction.inspection_period * 60 * 60 * 1000,
        ).toLocaleDateString()
      : "—";

  const handleRelease = () => {
    if (!transaction.seller_id) {
      Alert.alert("Error", "No seller assigned to this transaction.");
      return;
    }
    Alert.alert(
      "Release funds",
      `Release ${formatCurrency(transaction.price)} to the seller? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Release",
          onPress: async () => {
            if (!session?.user) return;
            setLoading(true);
            try {
              const { error } = await supabase.rpc("release_escrow", {
                p_transaction_id: transaction.id,
              });
              if (error) {
                Alert.alert("Error", error.message);
                return;
              }

              await refetchProfile();

              const emailResult = await sendReleaseEmail(
                transaction.id,
                session.access_token,
              );
              onRefetch();

              if (!emailResult.ok) {
                Alert.alert(
                  "Funds Released",
                  `Funds were released, but the seller email was not sent: ${emailResult.error}`,
                );
              } else {
                Alert.alert(
                  "Funds Released",
                  "The seller has been credited and the confirmation email was sent.",
                );
              }
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="gap-3">
      <View className="bg-secondary rounded-xl p-4 gap-2">
        <DetailRow label="Item received" value={transaction.delivered_at ? formatRelativeDate(transaction.delivered_at) : "—"} />
        <DetailRow label="Inspect by" value={inspectionDeadline} />
      </View>
      <Text className="text-muted-foreground text-sm text-center">
        Inspect the item and release funds when satisfied.
      </Text>
      <Button onPress={handleRelease} disabled={loading}>
        <Text className="text-primary-foreground font-semibold">
          {loading ? "Processing..." : `Release ${formatCurrency(transaction.price)} to Seller`}
        </Text>
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          router.push({ pathname: "/transaction/dispute", params: { id: transaction.id } })
        }
        disabled={loading}
      >
        <Text className="text-destructive font-semibold">Raise Dispute</Text>
      </Button>
    </View>
  );
}

function AwaitingInspectionPanel() {
  return (
    <Text className="text-muted-foreground text-sm text-center">
      Buyer is inspecting the item. Funds will be released soon.
    </Text>
  );
}

function DisputedPanel({ transaction }: { transaction: Transaction }) {
  const [dispute, setDispute] = useState<{
    reason: string;
    description: string | null;
    status: string;
    created_at: string;
  } | null>(null);

  useEffect(() => {
    supabase
      .from("disputes")
      .select("reason, description, status, created_at")
      .eq("transaction_id", transaction.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setDispute(data);
      });
  }, [transaction.id]);

  return (
    <View className="gap-3">
      <View className="bg-destructive/10 rounded-xl p-4 items-center gap-2">
        <Text className="text-destructive text-lg font-bold">
          Dispute Raised
        </Text>
        <Text className="text-muted-foreground text-sm text-center">
          This transaction is under dispute. Funds remain locked until an admin resolves it.
        </Text>
      </View>
      {dispute && (
        <View className="bg-secondary rounded-xl p-4 gap-2">
          <DetailRow label="Reason" value={dispute.reason} />
          {dispute.description && (
            <View>
              <Text className="text-muted-foreground text-sm">Details</Text>
              <Text className="text-foreground text-sm mt-1">
                {dispute.description}
              </Text>
            </View>
          )}
          <DetailRow label="Status" value={dispute.status === "open" ? "Open — Awaiting Review" : dispute.status === "under_review" ? "Under Review" : "Resolved"} />
          <DetailRow label="Filed" value={formatRelativeDate(dispute.created_at)} />
        </View>
      )}
    </View>
  );
}

function CompletedPanel({ transaction }: { transaction: Transaction }) {
  const isPositive = ["released", "refunded", "partially_refunded"].includes(
    transaction.status,
  );
  return (
    <View className="bg-secondary rounded-xl p-4 items-center gap-2">
      <Text className="text-foreground text-lg font-bold">
        {isPositive ? "Transaction Complete" : getStatusLabel(transaction.status)}
      </Text>
      <Text className="text-muted-foreground text-sm text-center">
        {transaction.status === "released"
          ? "Funds have been released to the seller."
          : transaction.status === "refunded"
          ? "Funds have been refunded to the buyer."
          : "This transaction has ended."}
      </Text>
    </View>
  );
}

function ReturnApprovedPanel({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <View className="gap-3">
      {isBuyer ? (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Admin has approved a return. Package the item and ship it back to the seller.
          </Text>
          <Button
            onPress={() =>
              router.push({ pathname: "/transaction/return-shipment", params: { id: transaction.id } })
            }
          >
            <Text className="text-primary-foreground font-semibold">
              Start Return Process
            </Text>
          </Button>
        </>
      ) : (
        <Text className="text-muted-foreground text-sm text-center">
          A return has been approved. Waiting for the buyer to ship the item back.
        </Text>
      )}
    </View>
  );
}

function ReturnInProgressPanel({ transaction }: { transaction: Transaction }) {
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <Text className="text-muted-foreground text-sm text-center">
      {isBuyer
        ? "Item shipped. Waiting for the seller to confirm receipt."
        : "The buyer has shipped the return. You will need to enter the return delivery token when you receive it."}
    </Text>
  );
}

function ReturnDeliveredPanel({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <View className="gap-3">
      {isBuyer ? (
        <Text className="text-muted-foreground text-sm text-center">
          Seller has received the return. Waiting for inspection.
        </Text>
      ) : (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Inspect the returned item and approve or raise a counter-dispute.
          </Text>
          <Button
            onPress={() =>
              router.push({ pathname: "/transaction/return-inspection", params: { id: transaction.id } })
            }
          >
            <Text className="text-primary-foreground font-semibold">
              Inspect Return
            </Text>
          </Button>
        </>
      )}
    </View>
  );
}

function ReturnInspectionPanel({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const { session } = useAuth();
  const isBuyer = transaction.buyer_id === session?.user?.id;

  return (
    <View className="gap-3">
      {isBuyer ? (
        <Text className="text-muted-foreground text-sm text-center">
          Seller is inspecting the returned item. You will be notified of the outcome.
        </Text>
      ) : (
        <>
          <Text className="text-muted-foreground text-sm text-center">
            Complete your inspection and make a decision.
          </Text>
          <Button
            onPress={() =>
              router.push({ pathname: "/transaction/return-inspection", params: { id: transaction.id } })
            }
          >
            <Text className="text-primary-foreground font-semibold">
              Continue Inspection
            </Text>
          </Button>
        </>
      )}
    </View>
  );
}

function ActionPanel({
  transaction,
  onRefetch,
}: {
  transaction: Transaction;
  onRefetch: () => void;
}) {
  const { session } = useAuth();
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const isBuyer = transaction.buyer_id === session?.user?.id;

  switch (transaction.status) {
    case "created":
      return isBuyer ? (
        <InviteSellerPanel
          transaction={transaction}
          onRefetch={onRefetch}
          inviteUrl={latestInviteUrl}
          onInviteUrlGenerated={setLatestInviteUrl}
        />
      ) : (
        <SellerRespondPanel transaction={transaction} onRefetch={onRefetch} />
      );

    case "seller_invited":
      return isBuyer ? (
        <AwaitingSellerPanel
          transaction={transaction}
          inviteUrl={latestInviteUrl}
          onInviteUrlGenerated={setLatestInviteUrl}
        />
      ) : (
        <SellerRespondPanel transaction={transaction} onRefetch={onRefetch} />
      );

    case "accepted":
      return isBuyer ? (
        <FundEscrowPanel transaction={transaction} onRefetch={onRefetch} />
      ) : (
        <AwaitingFundingPanel />
      );

    case "funded":
      return isBuyer ? (
        <AwaitingDeliveryPanel transaction={transaction} onRefetch={onRefetch} />
      ) : (
        <GenerateTokenPanel transaction={transaction} onRefetch={onRefetch} />
      );

    case "in_delivery":
      return isBuyer ? (
        <ScanTokenPanel transaction={transaction} />
      ) : (
        <AwaitingPickupPanel />
      );

    case "delivered":
    case "under_inspection":
      return isBuyer ? (
        <InspectionPanel transaction={transaction} onRefetch={onRefetch} />
      ) : (
        <AwaitingInspectionPanel />
      );

    case "disputed":
    case "admin_review":
      return <DisputedPanel transaction={transaction} />;

    case "released":
    case "refunded":
    case "partially_refunded":
    case "rejected":
    case "cancelled":
    case "expired":
      return <CompletedPanel transaction={transaction} />;

    case "return_approved":
      return <ReturnApprovedPanel transaction={transaction} />;

    case "return_in_progress":
      return <ReturnInProgressPanel transaction={transaction} />;

    case "return_delivered":
      return <ReturnDeliveredPanel transaction={transaction} />;

    case "return_inspection":
      return <ReturnInspectionPanel transaction={transaction} />;

    default:
      return null;
  }
}

// ──────────────────────────────────────────────
// Evidence section
// ──────────────────────────────────────────────

function EvidenceSection({
  transaction,
  evidence,
  evidenceLoading,
  uploading,
  onImageSelected,
  onDeleteEvidence,
  currentUserId,
}: {
  transaction: Transaction;
  evidence: Database["public"]["Tables"]["evidence"]["Row"][];
  evidenceLoading: boolean;
  uploading: boolean;
  onImageSelected: (uri: string, type: EvidenceType) => void;
  onDeleteEvidence: (evidenceId: string, imagePath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  currentUserId?: string;
}) {
  const isBuyer = transaction.buyer_id === currentUserId;
  const isSeller = transaction.seller_id === currentUserId;

  // Determine if the current user can upload, and what type
  let canUpload = false;
  let uploadType: EvidenceType = "item_photo";
  let uploadLabel = "Add Photo";

  if (isSeller && ["accepted", "funded", "in_delivery"].includes(transaction.status)) {
    canUpload = true;
    uploadType = "pre_delivery";
    uploadLabel = "Add Pre-Delivery Photo";
  } else if (
    isBuyer &&
    ["delivered", "under_inspection"].includes(transaction.status)
  ) {
    canUpload = true;
    uploadType = "received_item";
    uploadLabel = "Add Received Item Photo";
  } else if (
    (isBuyer || isSeller) &&
    ["disputed", "admin_review"].includes(transaction.status)
  ) {
    canUpload = true;
    uploadType = "dispute_evidence";
    uploadLabel = "Add Dispute Evidence";
  }

  // Don't show section before seller accepts (buyer has nothing to upload yet)
  if (
    ["created", "seller_invited"].includes(transaction.status) &&
    evidence.length === 0
  ) {
    return null;
  }

  return (
    <SectionCard title="Evidence">
      <EvidenceGallery
        evidence={evidence}
        isLoading={evidenceLoading}
        currentUserId={currentUserId}
        onDelete={onDeleteEvidence}
      />
      {canUpload && (
        <View className="mt-2">
          <EvidenceUploadButton
            onImageSelected={onImageSelected}
            evidenceType={uploadType}
            label={uploadLabel}
            uploading={uploading}
          />
        </View>
      )}
    </SectionCard>
  );
}

// ──────────────────────────────────────────────
// Main screen
// ──────────────────────────────────────────────

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { session } = useAuth();
  const { transaction, isLoading, error, refetch } = useTransaction(id);
  const {
    evidence,
    isLoading: evidenceLoading,
    uploadEvidence,
    deleteEvidence,
  } = useEvidence(id);
  const [uploading, setUploading] = useState(false);

  const handleImageSelected = async (uri: string, type: EvidenceType) => {
    setUploading(true);
    const result = await uploadEvidence({ imageUri: uri, evidenceType: type });
    setUploading(false);
    if (!result.ok) {
      Alert.alert("Upload Failed", result.error);
    }
  };

  const handleDeleteTransaction = () => {
    if (!transaction) return;

    if (!canDeleteTransactionForUser(transaction, session?.user.id)) {
      Alert.alert(
        "Cannot Delete",
        transaction.buyer_id !== session?.user.id
          ? "Only the buyer who created this transaction can delete it."
          : "Transactions with active locked funds cannot be deleted.",
      );
      return;
    }

    Alert.alert(
      "Delete Transaction",
      `Delete "${transaction.item_name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error: delErr } = await supabase.rpc("delete_transaction", {
              p_transaction_id: transaction.id,
            });
            if (delErr) {
              Alert.alert("Error", delErr.message);
            } else {
              router.back();
            }
          },
        },
      ],
    );
  };

  const handleArchiveTransaction = () => {
    if (!transaction) return;

    if (!canArchiveTransactionForUser(transaction, session?.user.id)) {
      Alert.alert(
        "Cannot Hide",
        "Only sellers can hide settled transactions from their own list.",
      );
      return;
    }

    Alert.alert(
      "Hide Transaction",
      `Hide "${transaction.item_name}" from your transaction list? The buyer will still keep their record.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: async () => {
            if (!session?.user.id) return;
            const { error: archiveError } = await supabase
              .from("transaction_archives")
              .upsert(
                {
                  transaction_id: transaction.id,
                  user_id: session.user.id,
                },
                { onConflict: "transaction_id,user_id" },
              );

            if (archiveError) {
              Alert.alert("Error", archiveError.message);
            } else {
              router.back();
            }
          },
        },
      ],
    );
  };

  // Update header title with transaction code once loaded
  useEffect(() => {
    if (transaction?.transaction_code) {
      navigation.setOptions({ title: transaction.transaction_code });
    }
  }, [transaction?.transaction_code, navigation]);

  if (isLoading) {
    return <ScreenLoader message="Loading transaction..." />;
  }

  if (error || !transaction) {
    return (
      <ScreenError
        message={error ?? "Transaction not found."}
        onRetry={refetch}
      />
    );
  }

  return (
    <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-10 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Status timeline */}
        <SectionCard title="Progress">
          <StatusTimeline transaction={transaction} />
        </SectionCard>

        {/* Item details */}
        <SectionCard title="Item Details">
          <DetailRow label="Item" value={transaction.item_name} />
          {transaction.item_condition && (
            <DetailRow
              label="Condition"
              value={
                transaction.item_condition.charAt(0).toUpperCase() +
                transaction.item_condition.slice(1)
              }
            />
          )}
          <DetailRow label="Price" value={formatCurrency(transaction.price)} />
          {transaction.item_description ? (
            <View>
              <Text className="text-muted-foreground text-sm">Description</Text>
              <Text className="text-foreground text-sm mt-1">
                {transaction.item_description}
              </Text>
            </View>
          ) : null}
        </SectionCard>

        {/* Transaction details */}
        <SectionCard title="Transaction Details">
          <DetailRow label="Code" value={transaction.transaction_code} />
          <DetailRow label="Seller contact" value={transaction.seller_contact} />
          <DetailRow
            label="Delivery by"
            value={new Date(transaction.delivery_deadline).toLocaleDateString()}
          />
          <DetailRow
            label="Inspection period"
            value={`${transaction.inspection_period / 24} day(s)`}
          />
          <DetailRow
            label="Created"
            value={formatRelativeDate(transaction.created_at)}
          />
        </SectionCard>

        {/* Evidence */}
        <EvidenceSection
          transaction={transaction}
          evidence={evidence}
          evidenceLoading={evidenceLoading}
          uploading={uploading}
          onImageSelected={handleImageSelected}
          onDeleteEvidence={deleteEvidence}
          currentUserId={session?.user?.id}
        />

        {/* Action panel */}
        <SectionCard title="Actions">
          <ActionPanel transaction={transaction} onRefetch={refetch} />
        </SectionCard>

        {/* Delete button — only for pre-funded transactions */}
        {canDeleteTransactionForUser(transaction, session?.user.id) && (
          <Button variant="outline" onPress={handleDeleteTransaction}>
            <Text className="text-destructive font-semibold">Delete Transaction</Text>
          </Button>
        )}

        {canArchiveTransactionForUser(transaction, session?.user.id) && (
          <Button variant="outline" onPress={handleArchiveTransaction}>
            <Text className="text-destructive font-semibold">Hide Transaction</Text>
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
