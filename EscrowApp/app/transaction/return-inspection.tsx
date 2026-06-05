import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScreenLoader, ScreenError } from "@/components/screen-state";
import { useAuth } from "@/features/auth/auth-context";
import { useReturnTransaction } from "@/features/returns/use-return-transaction";
import { useEvidence } from "@/features/evidence/use-evidence";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import { GuidedEvidenceCapture } from "@/features/evidence/components/guided-evidence-capture";
import { EvidenceGallery } from "@/features/evidence/components/evidence-gallery";
import { formatRelativeDate } from "@/lib/format";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { Alert, ScrollView, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COUNTER_DISPUTE_REASONS = [
  "Product returned damaged",
  "Parts removed or swapped",
  "Accessories missing",
  "Product condition differs from return photos",
  "Wrong item returned",
  "Other",
] as const;

export default function ReturnInspectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const {
    returnTransaction,
    isLoading,
    error,
    confirmReturnDelivery,
    approveReturn,
    raiseCounterDispute,
    refetch,
  } = useReturnTransaction(id);
  const {
    evidence,
    isLoading: evidenceLoading,
    uploadEvidence,
    deleteEvidence,
  } = useEvidence(id);
  const [uploading, setUploading] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCounterDispute, setShowCounterDispute] = useState(false);
  const [counterReason, setCounterReason] = useState("");
  const [counterDescription, setCounterDescription] = useState("");

  const receiptEvidence = useMemo(
    () => evidence.filter((e) => e.phase === "return_receipt"),
    [evidence],
  );

  const handleImageSelected = async (uri: string, type: EvidenceType, category: string) => {
    setUploading(true);
    const result = await uploadEvidence({
      imageUri: uri,
      evidenceType: type,
      phase: "return_receipt",
      category,
    });
    setUploading(false);
    if (!result.ok) Alert.alert("Upload Failed", result.error);
  };

  const handleConfirmReceipt = async () => {
    if (!returnTransaction || !tokenInput.trim()) return;
    setConfirming(true);
    const result = await confirmReturnDelivery(returnTransaction.id, tokenInput.trim());
    setConfirming(false);
    if (!result.ok) {
      Alert.alert("Error", result.error);
    } else {
      refetch();
    }
  };

  const handleApprove = () => {
    if (!returnTransaction) return;
    Alert.alert(
      "Approve Return",
      "Confirm that the returned item is in acceptable condition? The buyer will receive a full refund.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve & Refund",
          onPress: async () => {
            setProcessing(true);
            const result = await approveReturn(returnTransaction.id);
            setProcessing(false);
            if (!result.ok) Alert.alert("Error", result.error);
            else {
              Alert.alert("Return Approved", "The buyer has been refunded.", [
                { text: "OK", onPress: () => router.back() },
              ]);
            }
          },
        },
      ],
    );
  };

  const handleCounterDispute = async () => {
    if (!returnTransaction || !counterReason) return;
    setProcessing(true);
    const result = await raiseCounterDispute(
      returnTransaction.id,
      counterReason,
      counterDescription.trim() || undefined,
    );
    setProcessing(false);
    if (!result.ok) {
      Alert.alert("Error", result.error);
    } else {
      Alert.alert(
        "Counter-Dispute Raised",
        "An admin will review both parties' evidence and make a decision.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  };

  if (isLoading) return <ScreenLoader message="Loading return details..." />;
  if (error || !returnTransaction) {
    return <ScreenError message={error ?? "Return not found."} onRetry={refetch} />;
  }

  const isInTransit = returnTransaction.status === "in_transit";
  const isInspection = returnTransaction.status === "inspection";

  return (
    <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-10 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Token entry — when return is in transit */}
        {isInTransit && (
          <Card className="p-4 gap-3">
            <Text className="text-foreground font-semibold">Confirm Return Receipt</Text>
            <Text className="text-muted-foreground text-sm">
              Enter the return delivery token from the buyer to confirm you received the package.
            </Text>
            <Input
              className="h-14 rounded-xl text-center text-xl tracking-widest"
              placeholder="ENTER TOKEN"
              autoCapitalize="characters"
              value={tokenInput}
              onChangeText={setTokenInput}
            />
            <Button onPress={handleConfirmReceipt} disabled={confirming || !tokenInput.trim()}>
              <Text className="text-primary-foreground font-semibold">
                {confirming ? "Confirming..." : "Confirm Receipt"}
              </Text>
            </Button>
          </Card>
        )}

        {/* Inspection flow */}
        {isInspection && (
          <>
            {/* Deadline */}
            {returnTransaction.inspection_deadline && (
              <Card className="p-4 gap-2">
                <Text className="text-foreground font-semibold">Inspection Deadline</Text>
                <Text className="text-primary text-lg font-bold">
                  {formatRelativeDate(returnTransaction.inspection_deadline)}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  If you do not approve or raise a counter-dispute before the deadline, the return will be auto-approved and the buyer refunded.
                </Text>
              </Card>
            )}

            {/* Return conditions reminder */}
            {returnTransaction.seller_return_conditions && (
              <Card className="p-4 gap-2">
                <Text className="text-foreground font-semibold">Your Return Conditions</Text>
                <Text className="text-muted-foreground text-sm">
                  {returnTransaction.seller_return_conditions}
                </Text>
              </Card>
            )}

            {/* Guided evidence capture */}
            <View className="gap-3">
              <Text className="text-foreground text-base font-semibold">Inspect & Photograph</Text>
              <Text className="text-muted-foreground text-sm">
                Photograph the seal BEFORE opening, then inspect the item and capture evidence.
              </Text>
              <GuidedEvidenceCapture
                phase="return_receipt"
                evidenceType="received_item"
                existingEvidence={evidence}
                onImageSelected={handleImageSelected}
                uploading={uploading}
              />
            </View>

            {/* Evidence gallery */}
            {receiptEvidence.length > 0 && (
              <View className="gap-3">
                <Text className="text-foreground text-base font-semibold">Your Photos</Text>
                <EvidenceGallery
                  evidence={receiptEvidence}
                  isLoading={evidenceLoading}
                  currentUserId={session?.user?.id}
                  onDelete={deleteEvidence}
                />
              </View>
            )}

            {/* Decision buttons */}
            {!showCounterDispute && (
              <View className="gap-3">
                <Button onPress={handleApprove} disabled={processing}>
                  <Text className="text-primary-foreground font-semibold">
                    {processing ? "Processing..." : "Approve Return"}
                  </Text>
                </Button>
                <Button
                  variant="outline"
                  onPress={() => setShowCounterDispute(true)}
                  disabled={processing}
                >
                  <Text className="text-destructive font-semibold">
                    Raise Counter-Dispute
                  </Text>
                </Button>
              </View>
            )}

            {/* Counter-dispute form */}
            {showCounterDispute && (
              <Card className="p-4 gap-4">
                <Text className="text-foreground font-semibold">Counter-Dispute</Text>
                <View className="gap-2">
                  <Label nativeID="counter-reason">Reason *</Label>
                  {COUNTER_DISPUTE_REASONS.map((r) => (
                    <Pressable
                      key={r}
                      className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                        counterReason === r
                          ? "bg-destructive/10 border-destructive"
                          : "bg-secondary border-border"
                      }`}
                      onPress={() => setCounterReason(r)}
                    >
                      <View
                        className={`h-4 w-4 rounded-full border ${
                          counterReason === r
                            ? "bg-destructive border-destructive"
                            : "border-muted-foreground"
                        }`}
                      />
                      <Text className="text-foreground text-sm">{r}</Text>
                    </Pressable>
                  ))}
                </View>
                <View className="gap-2">
                  <Label nativeID="counter-desc">Description</Label>
                  <Input
                    aria-labelledby="counter-desc"
                    className="h-24 rounded-xl"
                    placeholder="Describe the issue in detail..."
                    multiline
                    textAlignVertical="top"
                    value={counterDescription}
                    onChangeText={setCounterDescription}
                  />
                </View>
                <View className="flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onPress={() => setShowCounterDispute(false)}
                  >
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
              </Card>
            )}
          </>
        )}

        {/* Counter-disputed status */}
        {returnTransaction.status === "counter_disputed" && (
          <Card className="p-4 gap-2 items-center">
            <Text className="text-destructive text-lg font-bold">Counter-Dispute Filed</Text>
            <Text className="text-muted-foreground text-sm text-center">
              Your counter-dispute is under review. An admin will compare all evidence and make a decision.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
