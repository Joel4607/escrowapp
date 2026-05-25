import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type InviteState = "loading" | "preview" | "email_entry" | "otp_sent" | "verified" | "accepted" | "rejected" | "tracking" | "error";

type PreviewData = {
  invite_id: string;
  invite_status: string;
  is_verified: boolean;
  transaction_id: string;
  transaction_code: string;
  item_name: string;
  price: number;
  buyer_name: string;
  expires_at: string;
  item_description?: string | null;
  item_condition?: string | null;
  delivery_deadline?: string;
  inspection_period?: number;
  transaction_status?: string;
};

type TransactionData = {
  id: string;
  transaction_code: string;
  item_name: string;
  item_description?: string | null;
  item_condition?: string | null;
  price: number;
  status: string;
  delivery_deadline: string;
  inspection_period: number;
  funded_at?: string | null;
  accepted_at?: string | null;
  delivered_at?: string | null;
  released_at?: string | null;
  buyer_name: string;
  delivery_token?: string | null;
  delivery_token_expires_at?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  seller_invited: "Seller Invited",
  accepted: "Accepted",
  rejected: "Rejected",
  funded: "Funded",
  in_delivery: "In Delivery",
  delivered: "Delivered",
  under_inspection: "Inspecting",
  released: "Released",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const STATUS_ORDER = [
  "accepted",
  "funded",
  "in_delivery",
  "delivered",
  "under_inspection",
  "released",
];

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <Text className="text-muted-foreground text-sm flex-1">{label}</Text>
      <Text className="text-foreground text-sm font-medium text-right flex-1">
        {value}
      </Text>
    </View>
  );
}

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);

  return (
    <View className="gap-1">
      {STATUS_ORDER.map((status, index) => {
        const isCompleted = currentIndex >= index;
        const isCurrent = currentStatus === status;

        return (
          <View key={status} className="flex-row items-center gap-3 py-2">
            <View
              className={`w-3 h-3 rounded-full ${
                isCompleted ? "bg-primary" : "bg-muted"
              } ${isCurrent ? "border-2 border-primary" : ""}`}
            />
            {index < STATUS_ORDER.length - 1 && (
              <View
                className={`absolute left-1.5 top-8 w-0.5 h-4 ${
                  currentIndex > index ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
            <Text
              className={`text-sm ${
                isCompleted ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
            >
              {STATUS_LABELS[status] || status}
            </Text>
            {isCurrent && (
              <View className="bg-primary/20 rounded-full px-2 py-0.5 ml-auto">
                <Text className="text-primary text-xs font-medium">Current</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function InviteScreen() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();

  const [state, setState] = useState<InviteState>("loading");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [transaction, setTransaction] = useState<TransactionData | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Step 1: Exchange token for preview
  useEffect(() => {
    if (!id || !token) {
      setError("Invalid invite link");
      setState("error");
      return;
    }

    async function exchangeToken() {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite_id: id, token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Invalid or expired invite");
          setState("error");
          return;
        }

        setPreview(data);

        // If invite was already accepted, go straight to tracking
        if (data.invite_status === "accepted") {
          setState("tracking");
          return;
        }

        setState(data.is_verified ? "verified" : "preview");
      } catch {
        setError("Failed to load invite. Please try again.");
        setState("error");
      }
    }

    exchangeToken();
  }, [id, token]);

  // Poll transaction status when in tracking mode
  const fetchStatus = useCallback(async () => {
    if (!id || !token) return;

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token, action: "get_status" }),
      });

      const data = await response.json();
      if (response.ok && data.transaction) {
        setTransaction(data.transaction);
      }
    } catch {
      // Silently fail on poll
    }
  }, [id, token]);

  useEffect(() => {
    if (state !== "tracking" && state !== "accepted") return;

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);

    // Pause polling when tab hidden, resume when visible
    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchStatus();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [state, fetchStatus]);

  // Step 2: Send OTP
  const handleSendOtp = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, email: email.trim(), token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send verification code");
        return;
      }

      setState("otp_sent");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify OTP
  const handleVerifyOtp = async () => {
    if (!otp.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token, otp: otp.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid code");
        return;
      }

      if (data.transaction) {
        setPreview((prev) => prev ? {
          ...prev,
          is_verified: true,
          item_description: data.transaction.item_description,
          item_condition: data.transaction.item_condition,
          delivery_deadline: data.transaction.delivery_deadline,
          inspection_period: data.transaction.inspection_period,
          transaction_status: data.transaction.status,
        } : prev);
      }

      setState("verified");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Accept
  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to accept");
        return;
      }

      setState("tracking");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Reject
  const handleReject = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/reject-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reject");
        return;
      }

      setState("rejected");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Seller actions (mark shipped / delivered)
  const handleSellerAction = async (action: string) => {
    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: id, token, action }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Action failed");
        return;
      }

      if (data.delivery_token) {
        setTransaction((current) =>
          current
            ? {
                ...current,
                status: data.new_status || current.status,
                delivery_token: data.delivery_token,
                delivery_token_expires_at: data.delivery_token_expires_at,
              }
            : current,
        );
      }

      // Refresh status
      await fetchStatus();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // --- RENDER ---

  if (state === "loading") {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">Loading invite...</Text>
      </SafeAreaView>
    );
  }

  if (state === "error") {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center px-6">
        <Text className="text-destructive text-lg font-semibold mb-2">
          Unable to load invite
        </Text>
        <Text className="text-muted-foreground text-center">{error}</Text>
      </SafeAreaView>
    );
  }

  if (state === "rejected") {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center px-6">
        <View className="bg-destructive/10 rounded-2xl p-8 items-center gap-3 w-full max-w-md">
          <Text className="text-destructive text-2xl font-bold">Rejected</Text>
          <Text className="text-foreground text-center">
            You have rejected this transaction. The buyer will be notified.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- TRACKING VIEW (post-acceptance) ---
  if (state === "tracking" || state === "accepted") {
    const tx = transaction;
    const status = tx?.status || "accepted";
    const isReleased = status === "released";
    const isDisputed = status === "disputed";

    return (
      <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pt-4 pb-10 gap-5 items-center"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-lg gap-5">
            {/* Header */}
            <View className="items-center gap-1">
              <Text className="text-foreground text-xl font-bold">
                Transaction Tracker
              </Text>
              {tx && (
                <Text className="text-muted-foreground text-sm">
                  {tx.transaction_code}
                </Text>
              )}
            </View>

            {/* Released banner */}
            {isReleased && (
              <View className="bg-primary/10 rounded-2xl p-6 items-center gap-2">
                <Text className="text-primary text-2xl font-bold">Funds Released!</Text>
                <Text className="text-foreground text-center">
                  The buyer has released the escrow funds. You will receive a confirmation email with details.
                </Text>
                <Text className="text-muted-foreground text-xs text-center mt-1">
                  Academic prototype — no real money was transferred.
                </Text>
              </View>
            )}

            {/* Disputed banner */}
            {isDisputed && (
              <View className="bg-destructive/10 rounded-2xl p-6 items-center gap-2">
                <Text className="text-destructive text-xl font-bold">Dispute Opened</Text>
                <Text className="text-foreground text-center">
                  The buyer has opened a dispute. An admin will review the transaction.
                </Text>
              </View>
            )}

            {/* Transaction details */}
            {tx && (
              <Card className="p-4 gap-2">
                <Text className="text-foreground font-semibold mb-1">Details</Text>
                <DetailRow label="Item" value={tx.item_name} />
                <DetailRow label="Price" value={formatCurrency(tx.price)} />
                <DetailRow label="Buyer" value={tx.buyer_name} />
                {tx.item_condition && (
                  <DetailRow
                    label="Condition"
                    value={tx.item_condition.charAt(0).toUpperCase() + tx.item_condition.slice(1)}
                  />
                )}
                <DetailRow
                  label="Delivery by"
                  value={new Date(tx.delivery_deadline).toLocaleDateString()}
                />
                <DetailRow
                  label="Inspection"
                  value={`${tx.inspection_period / 24} day(s)`}
                />
                <DetailRow
                  label="Status"
                  value={STATUS_LABELS[tx.status] || tx.status}
                />
              </Card>
            )}

            {/* Progress timeline */}
            {tx && !isReleased && !isDisputed && (
              <Card className="p-4 gap-2">
                <Text className="text-foreground font-semibold mb-1">Progress</Text>
                <StatusTimeline currentStatus={status} />
              </Card>
            )}

            {/* Seller actions */}
            {tx && !isReleased && !isDisputed && (
              <Card className="p-4 gap-3">
                <Text className="text-foreground font-semibold">Your Actions</Text>

                {status === "accepted" && (
                  <View className="bg-secondary/50 rounded-xl p-3">
                    <Text className="text-muted-foreground text-sm text-center">
                      Waiting for the buyer to fund the escrow...
                    </Text>
                  </View>
                )}

                {status === "funded" && (
                  <>
                    <Text className="text-muted-foreground text-sm">
                      The buyer has funded the escrow. Ship the item and generate a delivery token for the buyer.
                    </Text>
                    <Button
                      onPress={() => handleSellerAction("mark_shipped")}
                      disabled={actionLoading}
                    >
                      <Text className="text-primary-foreground font-semibold">
                        {actionLoading ? "Generating..." : "Mark as Shipped & Generate Token"}
                      </Text>
                    </Button>
                  </>
                )}

                {status === "in_delivery" && (
                  <>
                    {tx.delivery_token ? (
                      <View className="bg-secondary/50 rounded-xl p-4 gap-2">
                        <Text className="text-muted-foreground text-xs uppercase font-semibold">
                          Delivery token
                        </Text>
                        <Text selectable className="text-foreground text-2xl font-bold tracking-widest">
                          {tx.delivery_token}
                        </Text>
                        <Text className="text-muted-foreground text-sm">
                          Share this token with the buyer when they receive the item. The buyer enters it in the mobile app to confirm delivery.
                        </Text>
                        {tx.delivery_token_expires_at && (
                          <Text className="text-muted-foreground text-xs">
                            Expires {new Date(tx.delivery_token_expires_at).toLocaleString()}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <>
                        <Text className="text-muted-foreground text-sm">
                          Item is in transit, but no active delivery token was found.
                        </Text>
                        <Button
                          onPress={() => handleSellerAction("mark_shipped")}
                          disabled={actionLoading}
                        >
                          <Text className="text-primary-foreground font-semibold">
                            {actionLoading ? "Generating..." : "Generate Delivery Token"}
                          </Text>
                        </Button>
                      </>
                    )}
                  </>
                )}

                {status === "delivered" && (
                  <View className="bg-secondary/50 rounded-xl p-3">
                    <Text className="text-muted-foreground text-sm text-center">
                      Item delivered. Waiting for the buyer to inspect and release funds...
                    </Text>
                  </View>
                )}

                {status === "under_inspection" && (
                  <View className="bg-secondary/50 rounded-xl p-3">
                    <Text className="text-muted-foreground text-sm text-center">
                      The buyer is inspecting the item. Funds will be released once they approve.
                    </Text>
                  </View>
                )}

                {error && (
                  <Text className="text-destructive text-sm text-center">{error}</Text>
                )}
              </Card>
            )}

            {/* Loading state when transaction hasn't loaded yet */}
            {!tx && (
              <View className="items-center py-8 gap-3">
                <ActivityIndicator size="small" />
                <Text className="text-muted-foreground text-sm">
                  Loading transaction details...
                </Text>
              </View>
            )}

            {/* Auto-refresh notice */}
            {tx && !isReleased && !isDisputed && (
              <Text className="text-muted-foreground text-xs text-center">
                This page refreshes automatically every 10 seconds.
              </Text>
            )}

            {/* Prototype disclaimer */}
            <View className="bg-secondary/50 rounded-xl p-3">
              <Text className="text-muted-foreground text-xs text-center">
                This is an academic prototype. All wallet balances and escrow operations are simulated. No real money is collected, held, or transferred.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- PRE-ACCEPTANCE FLOW ---
  return (
    <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-10 gap-6 items-center"
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-lg gap-6">
          {/* Header */}
          <View className="items-center gap-2">
            <Text className="text-foreground text-xl font-bold">
              Escrow Transaction Invite
            </Text>
            <Text className="text-muted-foreground text-sm text-center">
              {preview?.buyer_name} has invited you to review a transaction
            </Text>
          </View>

          {/* Preview card */}
          {preview && (
            <Card className="p-4 gap-3">
              <DetailRow label="Item" value={preview.item_name} />
              <DetailRow label="Price" value={formatCurrency(preview.price)} />
              <DetailRow label="From" value={preview.buyer_name} />
              <DetailRow label="Code" value={preview.transaction_code} />

              {preview.is_verified && (
                <>
                  {preview.item_description && (
                    <View>
                      <Text className="text-muted-foreground text-sm">Description</Text>
                      <Text className="text-foreground text-sm mt-1">
                        {preview.item_description}
                      </Text>
                    </View>
                  )}
                  {preview.item_condition && (
                    <DetailRow
                      label="Condition"
                      value={preview.item_condition.charAt(0).toUpperCase() + preview.item_condition.slice(1)}
                    />
                  )}
                  {preview.delivery_deadline && (
                    <DetailRow
                      label="Delivery by"
                      value={new Date(preview.delivery_deadline).toLocaleDateString()}
                    />
                  )}
                  {preview.inspection_period && (
                    <DetailRow
                      label="Inspection period"
                      value={`${preview.inspection_period / 24} day(s)`}
                    />
                  )}
                </>
              )}
            </Card>
          )}

          {/* Email entry */}
          {state === "preview" && (
            <Card className="p-4 gap-4">
              <Text className="text-foreground font-semibold">
                Verify your email to continue
              </Text>
              <Text className="text-muted-foreground text-sm">
                Enter the email address the buyer used to invite you. We will send a verification code.
              </Text>
              <Input
                className="h-14 rounded-xl"
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              {error && (
                <Text className="text-destructive text-sm">{error}</Text>
              )}
              <Button onPress={handleSendOtp} disabled={loading || !email.trim()}>
                <Text className="text-primary-foreground font-semibold">
                  {loading ? "Sending..." : "Send Verification Code"}
                </Text>
              </Button>
            </Card>
          )}

          {/* OTP entry */}
          {state === "otp_sent" && (
            <Card className="p-4 gap-4">
              <Text className="text-foreground font-semibold">
                Enter verification code
              </Text>
              <Text className="text-muted-foreground text-sm">
                We sent a 6-digit code to {email}. It expires in 10 minutes.
              </Text>
              <Input
                className="h-14 rounded-xl text-center text-2xl tracking-widest"
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
              />
              {error && (
                <Text className="text-destructive text-sm">{error}</Text>
              )}
              <Button onPress={handleVerifyOtp} disabled={loading || otp.length < 6}>
                <Text className="text-primary-foreground font-semibold">
                  {loading ? "Verifying..." : "Verify"}
                </Text>
              </Button>
              <Button variant="outline" onPress={() => { setOtp(""); setState("preview"); setError(null); }}>
                <Text className="text-foreground font-medium">Resend Code</Text>
              </Button>
            </Card>
          )}

          {/* Accept / Reject */}
          {state === "verified" && (
            <Card className="p-4 gap-4">
              <View className="bg-primary/10 rounded-xl p-3 items-center">
                <Text className="text-primary font-semibold">Email Verified</Text>
              </View>
              <Text className="text-foreground font-semibold text-center">
                Accept this transaction?
              </Text>
              <Text className="text-muted-foreground text-sm text-center">
                By accepting, you agree to deliver the item as described and within the deadline.
              </Text>
              {error && (
                <Text className="text-destructive text-sm text-center">{error}</Text>
              )}
              <Button onPress={handleAccept} disabled={loading}>
                <Text className="text-primary-foreground font-semibold">
                  {loading ? "Processing..." : "Accept Transaction"}
                </Text>
              </Button>
              <Button variant="outline" onPress={handleReject} disabled={loading}>
                <Text className="text-destructive font-semibold">Reject</Text>
              </Button>
            </Card>
          )}

          {/* Prototype disclaimer */}
          <View className="bg-secondary/50 rounded-xl p-3">
            <Text className="text-muted-foreground text-xs text-center">
              This is an academic prototype. All wallet balances and escrow operations are simulated. No real money is collected, held, or transferred.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
