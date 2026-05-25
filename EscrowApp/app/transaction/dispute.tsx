import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import { useEvidence } from "@/features/evidence/use-evidence";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import { EvidenceUploadButton } from "@/features/evidence/components/evidence-upload-button";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useState, useEffect } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";

// Dispute reasons from the project brief
const BUYER_REASONS = [
  "Fake product",
  "Wrong item",
  "Damaged product",
  "Empty package",
  "Item not delivered",
  "Seller changed terms",
  "Delivery delay",
  "Other",
] as const;

const SELLER_REASONS = [
  "Buyer refusing to release payment",
  "Other",
] as const;

type DisputePhoto = {
  uri: string;
  uploaded: boolean;
};

export default function DisputeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBuyer, setIsBuyer] = useState(true);
  const [photos, setPhotos] = useState<DisputePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const { uploadEvidence } = useEvidence(id);

  // Determine if current user is buyer or seller
  useEffect(() => {
    if (!id || !session?.user?.id) return;

    supabase
      .from("transactions")
      .select("buyer_id, seller_id")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) {
          setIsBuyer(data.buyer_id === session.user.id);
        }
      });
  }, [id, session?.user?.id]);

  const reasons = isBuyer ? BUYER_REASONS : SELLER_REASONS;

  const handleAddPhoto = (uri: string) => {
    setPhotos((prev) => [...prev, { uri, uploaded: false }]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert("Missing info", "Please select a reason for the dispute.");
      return;
    }

    if (!session?.user || !id) return;

    setLoading(true);
    try {
      // 1. Raise the dispute
      const { error } = await supabase.rpc("raise_dispute", {
        p_transaction_id: id,
        p_reason: reason,
        p_description: description.trim() || undefined,
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      // 2. Upload any attached photos as dispute evidence
      if (photos.length > 0) {
        setUploading(true);
        for (const photo of photos) {
          await uploadEvidence({
            imageUri: photo.uri,
            evidenceType: "dispute_evidence",
            notes: `Dispute: ${reason}`,
          });
        }
        setUploading(false);
      }

      Alert.alert(
        "Dispute raised",
        "Your dispute has been submitted with evidence. An admin will review it shortly.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="bg-background flex-1"
    >
      <ScrollView
        className="flex-1 px-6"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pt-6 pb-8 gap-5"
      >
        <Text className="text-muted-foreground text-sm">
          Select the reason for your dispute and provide supporting details. An
          admin will review the evidence and contact both parties.
        </Text>

        {/* Reason selection */}
        <View className="gap-2">
          <Label nativeID="reason-label">Reason *</Label>
          <View className="gap-2">
            {reasons.map((r) => {
              const isSelected = reason === r;
              return (
                <Pressable
                  key={r}
                  className={`flex-row items-center gap-3 rounded-xl border px-4 py-3.5 ${
                    isSelected
                      ? "bg-destructive/10 border-destructive"
                      : "bg-secondary border-border"
                  }`}
                  onPress={() => setReason(r)}
                >
                  <View
                    className={`h-5 w-5 rounded-full items-center justify-center border ${
                      isSelected
                        ? "bg-destructive border-destructive"
                        : "border-muted-foreground"
                    }`}
                  >
                    {isSelected && (
                      <Icon
                        as={Check}
                        className="text-destructive-foreground"
                        size={12}
                      />
                    )}
                  </View>
                  <Text
                    className={`text-sm font-medium ${
                      isSelected ? "text-foreground" : "text-foreground"
                    }`}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Additional details */}
        <View className="gap-2">
          <Label nativeID="desc-label">Additional Details</Label>
          <Input
            aria-labelledby="desc-label"
            className="h-28 rounded-xl"
            placeholder="Describe what happened in detail..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Evidence photos */}
        <View className="gap-3">
          <Label nativeID="evidence-label">Evidence Photos</Label>
          <Text className="text-muted-foreground text-xs -mt-1">
            Attach photos to support your dispute. These will be visible to the
            admin reviewing the case.
          </Text>

          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {photos.map((photo, index) => (
                <View key={index} className="relative">
                  <Image
                    source={{ uri: photo.uri }}
                    className="h-20 w-20 rounded-lg"
                    resizeMode="cover"
                  />
                  <Pressable
                    className="absolute -top-1.5 -right-1.5 bg-destructive h-5 w-5 rounded-full items-center justify-center"
                    onPress={() => handleRemovePhoto(index)}
                  >
                    <Text className="text-destructive-foreground text-xs font-bold">
                      ✕
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <EvidenceUploadButton
            onImageSelected={(uri) => handleAddPhoto(uri)}
            evidenceType="dispute_evidence"
            label={
              photos.length > 0
                ? `Add Another Photo (${photos.length})`
                : "Add Evidence Photo"
            }
            uploading={uploading}
          />
        </View>
      </ScrollView>

      <View className="px-6 pb-8">
        <Button
          size="lg"
          className="h-14 rounded-xl bg-destructive"
          onPress={handleSubmit}
          disabled={loading || !reason}
        >
          <Text className="text-destructive-foreground text-base font-semibold">
            {loading
              ? uploading
                ? "Uploading evidence..."
                : "Submitting..."
              : "Submit Dispute"}
          </Text>
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
