import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, View, Platform } from "react-native";
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

type EvidenceItem = {
  id: string;
  evidence_type: string;
  user_role: string;
  notes: string | null;
  created_at: string;
  signed_url: string | null;
  can_delete: boolean;
};

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  item_photo: "Item Photo",
  pre_delivery: "Pre-Delivery",
  received_item: "Received Item",
  dispute_evidence: "Dispute Evidence",
};

function WebEvidenceSection({
  inviteId,
  inviteToken,
  status,
}: {
  inviteId: string;
  inviteToken: string;
  status: string;
}) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewImage, setViewImage] = useState<EvidenceItem | null>(null);

  const canUpload = ["accepted", "funded", "in_delivery", "disputed", "admin_review"].includes(status);

  const fetchEvidence = useCallback(async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: inviteId, token: inviteToken, action: "get_evidence" }),
      });
      const data = await response.json();
      if (response.ok && data.evidence) {
        setEvidence(data.evidence);
      }
    } catch {
      // Silently fail
    }
  }, [inviteId, inviteToken]);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  const handleUpload = async () => {
    if (Platform.OS === "web") {
      // Web: use hidden file input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
          // Read file as base64
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              // Strip the data:image/...;base64, prefix
              resolve(result.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invite_id: inviteId,
              token: inviteToken,
              action: "upload_evidence",
              image_base64: base64,
              evidence_type: "pre_delivery",
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            Alert.alert("Upload Failed", data.error || "Failed to upload");
          } else {
            await fetchEvidence();
          }
        } catch {
          Alert.alert("Upload Failed", "Network error");
        } finally {
          setUploading(false);
        }
      };
      input.click();
    }
  };

  const handleDelete = async (evidenceId: string) => {
    Alert.alert("Delete Photo", "Are you sure you want to delete this photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                invite_id: inviteId,
                token: inviteToken,
                action: "delete_evidence",
                evidence_id: evidenceId,
              }),
            });
            if (response.ok) {
              setViewImage(null);
              await fetchEvidence();
            }
          } catch {
            Alert.alert("Error", "Failed to delete");
          }
        },
      },
    ]);
  };

  if (evidence.length === 0 && !canUpload) return null;

  return (
    <Card className="p-4 gap-3">
      <Text className="text-foreground font-semibold">Evidence Photos</Text>

      {evidence.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {evidence.map((item) => (
            <Pressable key={item.id} onPress={() => setViewImage(item)}>
              <View className="gap-1">
                {item.signed_url ? (
                  <Image
                    source={{ uri: item.signed_url }}
                    style={{ height: 80, width: 80, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ height: 80, width: 80, borderRadius: 8 }} className="bg-secondary items-center justify-center">
                    <Text style={{ fontSize: 8 }} className="text-muted-foreground">No preview</Text>
                  </View>
                )}
                <Text className="text-muted-foreground text-center" style={{ fontSize: 9 }}>
                  {item.user_role === "buyer" ? "Buyer" : "Seller"}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {evidence.length === 0 && (
        <Text className="text-muted-foreground text-sm text-center">
          No evidence photos yet. Upload photos of the item before shipping.
        </Text>
      )}

      {canUpload && (
        <Button variant="outline" onPress={handleUpload} disabled={uploading}>
          <Text className="text-foreground font-medium">
            {uploading ? "Uploading..." : "Add Pre-Delivery Photo"}
          </Text>
        </Button>
      )}

      {/* Image viewer overlay */}
      {viewImage && viewImage.signed_url && (
        <View
          style={{
            position: "fixed" as any,
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.9)",
            zIndex: 999,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Pressable
            style={{
              position: "absolute",
              top: 40,
              right: 20,
              backgroundColor: "rgba(255,255,255,0.3)",
              borderRadius: 20,
              width: 40,
              height: 40,
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
            onPress={() => setViewImage(null)}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>✕</Text>
          </Pressable>

          {viewImage.can_delete && (
            <Pressable
              style={{
                position: "absolute",
                top: 40,
                left: 20,
                backgroundColor: "rgba(255,60,60,0.4)",
                borderRadius: 20,
                width: 40,
                height: 40,
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
              }}
              onPress={() => handleDelete(viewImage.id)}
            >
              <Text style={{ color: "#fff", fontSize: 16 }}>🗑</Text>
            </Pressable>
          )}

          <Image
            source={{ uri: viewImage.signed_url }}
            style={{ width: "90%", height: "70%" } as any}
            resizeMode="contain"
          />
          <Text style={{ color: "#fff", fontSize: 13, textAlign: "center", marginTop: 12 }}>
            {viewImage.user_role === "buyer" ? "Buyer" : "Seller"} •{" "}
            {EVIDENCE_TYPE_LABELS[viewImage.evidence_type] ?? viewImage.evidence_type}
          </Text>
        </View>
      )}
    </Card>
  );
}

function WebReturnSection({
  inviteId,
  inviteToken,
  status,
}: {
  inviteId: string;
  inviteToken: string;
  status: string;
}) {
  const [returnData, setReturnData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCounterDispute, setShowCounterDispute] = useState(false);
  const [counterReason, setCounterReason] = useState("");
  const [counterDescription, setCounterDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const COUNTER_DISPUTE_REASONS = [
    "Product returned damaged",
    "Parts removed or swapped",
    "Accessories missing",
    "Product condition differs from return photos",
    "Wrong item returned",
    "Other",
  ];

  const fetchReturnDetails = useCallback(async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: inviteId, token: inviteToken, action: "get_return_details" }),
      });
      const data = await response.json();
      if (response.ok) {
        setReturnData(data);
      }
    } catch {
      // silently fail
    }
  }, [inviteId, inviteToken]);

  useEffect(() => {
    if (["return_approved", "return_in_progress", "return_delivered", "return_inspection"].includes(status)) {
      fetchReturnDetails();
      const interval = setInterval(fetchReturnDetails, 10000);
      return () => clearInterval(interval);
    }
  }, [status, fetchReturnDetails]);

  const handleConfirmReceipt = async () => {
    if (!tokenInput.trim()) return;
    setConfirming(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_id: inviteId,
          token: inviteToken,
          action: "confirm_return_receipt",
          return_token: tokenInput.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        Alert.alert("Error", data.error || "Failed to confirm receipt");
      } else {
        setTokenInput("");
        await fetchReturnDetails();
      }
    } catch {
      Alert.alert("Error", "Network error");
    } finally {
      setConfirming(false);
    }
  };

  const handleUploadEvidence = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invite_id: inviteId,
              token: inviteToken,
              action: "upload_return_evidence",
              image_base64: base64,
              evidence_type: "received_item",
              phase: "return_receipt",
              category: "other",
            }),
          });
          const data = await response.json();
          if (!response.ok) {
            Alert.alert("Upload Failed", data.error || "Failed");
          } else {
            await fetchReturnDetails();
          }
        } catch {
          Alert.alert("Upload Failed", "Network error");
        } finally {
          setUploading(false);
        }
      };
      input.click();
    }
  };

  const handleApproveReturn = async () => {
    Alert.alert("Approve Return", "Confirm that the returned item is acceptable? The buyer will be refunded.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve & Refund",
        onPress: async () => {
          setProcessing(true);
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                invite_id: inviteId,
                token: inviteToken,
                action: "approve_return",
              }),
            });
            const data = await response.json();
            if (!response.ok) {
              Alert.alert("Error", data.error || "Failed");
            } else {
              await fetchReturnDetails();
            }
          } catch {
            Alert.alert("Error", "Network error");
          } finally {
            setProcessing(false);
          }
        },
      },
    ]);
  };

  const handleCounterDispute = async () => {
    if (!counterReason) return;
    setProcessing(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seller-web-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_id: inviteId,
          token: inviteToken,
          action: "raise_counter_dispute",
          counter_reason: counterReason,
          counter_description: counterDescription.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        Alert.alert("Error", data.error || "Failed");
      } else {
        setShowCounterDispute(false);
        setCounterReason("");
        setCounterDescription("");
        await fetchReturnDetails();
      }
    } catch {
      Alert.alert("Error", "Network error");
    } finally {
      setProcessing(false);
    }
  };

  // Don't show if not in a return state
  if (!["return_approved", "return_in_progress", "return_delivered", "return_inspection"].includes(status)) {
    return null;
  }

  const rt = returnData?.return_transaction;
  const cd = returnData?.counter_dispute;
  const evidence = returnData?.evidence ?? [];

  return (
    <Card className="p-4 gap-4">
      <Text className="text-foreground font-semibold">Return Transaction</Text>

      {/* Waiting for buyer to ship */}
      {status === "return_approved" && (
        <View className="bg-secondary/50 rounded-xl p-3">
          <Text className="text-muted-foreground text-sm text-center">
            Waiting for the buyer to ship the item back to you.
          </Text>
          {rt?.return_deadline && (
            <Text className="text-muted-foreground text-xs text-center mt-1">
              Deadline: {new Date(rt.return_deadline).toLocaleDateString()}
            </Text>
          )}
        </View>
      )}

      {/* Buyer shipped — enter token */}
      {status === "return_in_progress" && (
        <View className="gap-3">
          <Text className="text-muted-foreground text-sm">
            The buyer has shipped the return. Enter the return delivery token to confirm receipt.
          </Text>
          <Input
            className="h-14 rounded-xl text-center"
            placeholder="ENTER RETURN TOKEN"
            autoCapitalize="characters"
            value={tokenInput}
            onChangeText={setTokenInput}
          />
          <Button onPress={handleConfirmReceipt} disabled={confirming || !tokenInput.trim()}>
            <Text className="text-primary-foreground font-semibold">
              {confirming ? "Confirming..." : "Confirm Receipt"}
            </Text>
          </Button>
        </View>
      )}

      {/* Return delivered — inspection */}
      {(status === "return_delivered" || status === "return_inspection") && !cd && (
        <View className="gap-3">
          {rt?.inspection_deadline && (
            <View className="bg-secondary/50 rounded-xl p-3">
              <Text className="text-muted-foreground text-xs">
                Inspection deadline: {new Date(rt.inspection_deadline).toLocaleString()}
              </Text>
              <Text className="text-muted-foreground text-xs mt-1">
                If you don't act before the deadline, the return will be auto-approved and the buyer refunded.
              </Text>
            </View>
          )}

          {rt?.seller_return_conditions && (
            <View className="bg-secondary/50 rounded-xl p-3">
              <Text className="text-muted-foreground text-xs font-semibold">Your Return Conditions</Text>
              <Text className="text-muted-foreground text-xs mt-1">{rt.seller_return_conditions}</Text>
            </View>
          )}

          {/* Evidence thumbnails */}
          {evidence.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {evidence.map((item: any) => (
                <View key={item.id} className="gap-1">
                  {item.signed_url ? (
                    <Image
                      source={{ uri: item.signed_url }}
                      style={{ height: 60, width: 60, borderRadius: 8 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ height: 60, width: 60, borderRadius: 8 }} className="bg-secondary" />
                  )}
                  <Text className="text-muted-foreground text-center" style={{ fontSize: 8 }}>
                    {item.user_role === "buyer" ? "Buyer" : "Seller"}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Button variant="outline" onPress={handleUploadEvidence} disabled={uploading}>
            <Text className="text-foreground font-medium">
              {uploading ? "Uploading..." : "Upload Inspection Photo"}
            </Text>
          </Button>

          {!showCounterDispute && (
            <View className="gap-2">
              <Button onPress={handleApproveReturn} disabled={processing}>
                <Text className="text-primary-foreground font-semibold">
                  {processing ? "Processing..." : "Approve Return"}
                </Text>
              </Button>
              <Button variant="outline" onPress={() => setShowCounterDispute(true)} disabled={processing}>
                <Text className="text-destructive font-semibold">Raise Counter-Dispute</Text>
              </Button>
            </View>
          )}

          {showCounterDispute && (
            <View className="gap-3">
              <Text className="text-foreground font-semibold">Counter-Dispute</Text>
              {COUNTER_DISPUTE_REASONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setCounterReason(r)}
                  className={`rounded-xl border px-4 py-3 ${
                    counterReason === r ? "bg-destructive/10 border-destructive" : "bg-secondary border-border"
                  }`}
                >
                  <Text className="text-foreground text-sm">{r}</Text>
                </Pressable>
              ))}
              <Input
                className="h-20 rounded-xl"
                placeholder="Describe the issue..."
                multiline
                textAlignVertical="top"
                value={counterDescription}
                onChangeText={setCounterDescription}
              />
              <View className="flex-row gap-3">
                <Button variant="outline" className="flex-1" onPress={() => setShowCounterDispute(false)}>
                  <Text className="text-foreground font-medium">Cancel</Text>
                </Button>
                <Button
                  className="flex-1 bg-destructive"
                  onPress={handleCounterDispute}
                  disabled={processing || !counterReason}
                >
                  <Text className="text-destructive-foreground font-semibold">
                    {processing ? "Submitting..." : "Submit"}
                  </Text>
                </Button>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Counter-disputed */}
      {cd && cd.status !== "resolved" && (
        <View className="bg-destructive/10 rounded-xl p-4 gap-2">
          <Text className="text-destructive font-semibold">Counter-Dispute Filed</Text>
          <Text className="text-foreground text-sm">Reason: {cd.reason}</Text>
          {cd.description && <Text className="text-muted-foreground text-sm">{cd.description}</Text>}
          <Text className="text-muted-foreground text-xs">
            An admin will review all evidence and make a decision.
          </Text>
        </View>
      )}
    </Card>
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

            {/* Evidence photos */}
            {id && token && (
              <WebEvidenceSection
                inviteId={id}
                inviteToken={token}
                status={status}
              />
            )}

            {/* Return transaction */}
            {id && token && (
              <WebReturnSection
                inviteId={id}
                inviteToken={token}
                status={status}
              />
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
