import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReturnShipmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const {
    returnTransaction,
    isLoading,
    error,
    generateReturnToken,
    refetch,
  } = useReturnTransaction(id);
  const {
    evidence,
    isLoading: evidenceLoading,
    uploadEvidence,
    deleteEvidence,
  } = useEvidence(id);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const returnEvidence = useMemo(
    () => evidence.filter((e) => e.phase === "return_shipment"),
    [evidence],
  );

  const requiredCategories = ["seal", "front", "back"];
  const completedCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const e of returnEvidence) {
      if (e.category) cats.add(e.category);
    }
    return cats;
  }, [returnEvidence]);
  const allRequiredDone = requiredCategories.every((c) => completedCategories.has(c));

  const handleImageSelected = async (uri: string, type: EvidenceType, category: string) => {
    setUploading(true);
    const result = await uploadEvidence({
      imageUri: uri,
      evidenceType: type,
      phase: "return_shipment",
      category,
    });
    setUploading(false);
    if (!result.ok) {
      Alert.alert("Upload Failed", result.error);
    }
  };

  const handleGenerateToken = async () => {
    if (!returnTransaction) return;

    if (!allRequiredDone) {
      Alert.alert("Required Photos", "Please upload all required photos before generating the return token.");
      return;
    }

    setGenerating(true);
    const result = await generateReturnToken(returnTransaction.id);
    setGenerating(false);

    if (!result.ok) {
      Alert.alert("Error", result.error);
    } else {
      refetch();
      router.push({
        pathname: "/transaction/token-qr",
        params: { token: result.token },
      });
    }
  };

  if (isLoading) return <ScreenLoader message="Loading return details..." />;
  if (error || !returnTransaction) {
    return <ScreenError message={error ?? "Return not found."} onRetry={refetch} />;
  }

  const deadlineDate = new Date(returnTransaction.return_deadline);
  const isExpired = deadlineDate < new Date();
  const canGenerateToken = returnTransaction.status === "created" || returnTransaction.status === "awaiting_shipment";

  return (
    <SafeAreaView className="bg-background flex-1" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-10 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Deadline banner */}
        <Card className="p-4 gap-2">
          <Text className="text-foreground font-semibold">Return Deadline</Text>
          <Text className={`text-lg font-bold ${isExpired ? "text-destructive" : "text-primary"}`}>
            {deadlineDate.toLocaleDateString()} ({isExpired ? "EXPIRED" : formatRelativeDate(returnTransaction.return_deadline)})
          </Text>
          {isExpired && (
            <Text className="text-destructive text-sm">
              The return deadline has passed. Funds will be released to the seller.
            </Text>
          )}
        </Card>

        {/* Seller return conditions */}
        {returnTransaction.seller_return_conditions && (
          <Card className="p-4 gap-2">
            <Text className="text-foreground font-semibold">Seller Return Conditions</Text>
            <Text className="text-muted-foreground text-sm">
              {returnTransaction.seller_return_conditions}
            </Text>
          </Card>
        )}

        {/* Instructions */}
        {canGenerateToken && !isExpired && (
          <Card className="p-4 gap-2">
            <Text className="text-foreground font-semibold">Instructions</Text>
            <Text className="text-muted-foreground text-sm">
              1. Package the item securely{"\n"}
              2. Seal the package and sign across the seal{"\n"}
              3. Upload the required photos below{"\n"}
              4. Generate the return delivery token{"\n"}
              5. Include the token with the package or share with the dispatch rider
            </Text>
          </Card>
        )}

        {/* Guided evidence capture */}
        {canGenerateToken && !isExpired && (
          <View className="gap-3">
            <Text className="text-foreground text-base font-semibold">Return Evidence</Text>
            <GuidedEvidenceCapture
              phase="return_shipment"
              evidenceType="delivery_proof"
              existingEvidence={evidence}
              onImageSelected={handleImageSelected}
              uploading={uploading}
            />
          </View>
        )}

        {/* Existing evidence gallery */}
        {returnEvidence.length > 0 && (
          <View className="gap-3">
            <Text className="text-foreground text-base font-semibold">Uploaded Photos</Text>
            <EvidenceGallery
              evidence={returnEvidence}
              isLoading={evidenceLoading}
              currentUserId={session?.user?.id}
              onDelete={deleteEvidence}
            />
          </View>
        )}

        {/* Generate token button */}
        {canGenerateToken && !isExpired && (
          <Button
            onPress={handleGenerateToken}
            disabled={generating || !allRequiredDone}
          >
            <Text className="text-primary-foreground font-semibold">
              {generating ? "Generating..." : "Generate Return Delivery Token"}
            </Text>
          </Button>
        )}

        {/* Already shipped status */}
        {returnTransaction.status === "in_transit" && (
          <Card className="p-4 gap-2 items-center">
            <Text className="text-primary text-lg font-bold">Item Shipped</Text>
            <Text className="text-muted-foreground text-sm text-center">
              Waiting for the seller to confirm receipt of the returned item.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
