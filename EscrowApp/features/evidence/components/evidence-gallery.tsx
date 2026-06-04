import { Text } from "@/components/ui/text";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { ImageViewerModal } from "./image-viewer-modal";
import { formatRelativeDate } from "@/lib/format";
import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  View,
} from "react-native";

type Evidence = Database["public"]["Tables"]["evidence"]["Row"];

type Props = {
  evidence: Evidence[];
  isLoading: boolean;
  currentUserId?: string;
  onDelete?: (evidenceId: string, imagePath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type EvidenceWithUrl = Evidence & { imageUri: string | null; loadError: string | null };

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  item_photo: "Item Photo",
  pre_delivery: "Pre-Delivery",
  received_item: "Received Item",
  dispute_evidence: "Dispute Evidence",
  delivery_proof: "Delivery Proof",
  unboxing: "Unboxing",
};

export function EvidenceGallery({ evidence, isLoading, currentUserId, onDelete }: Props) {
  const [items, setItems] = useState<EvidenceWithUrl[]>([]);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [viewerImage, setViewerImage] = useState<{
    url: string;
    caption: string;
    evidenceId: string;
    imagePath: string;
    canDelete: boolean;
  } | null>(null);

  useEffect(() => {
    if (evidence.length === 0) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoadingUrls(true);

    async function loadImages() {
      const withUrls = await Promise.all(
        evidence.map(async (e) => {
          try {
            const { data: signedData, error: signedError } = await supabase.storage
              .from("evidence")
              .createSignedUrl(e.image_url, 3600);

            if (signedError || !signedData?.signedUrl) {
              return {
                ...e,
                imageUri: null,
                loadError: signedError?.message ?? "Failed to generate URL",
              };
            }

            return { ...e, imageUri: signedData.signedUrl, loadError: null };
          } catch (err) {
            return {
              ...e,
              imageUri: null,
              loadError: err instanceof Error ? err.message : "Failed to load",
            };
          }
        }),
      );
      if (!cancelled) {
        setItems(withUrls);
        setLoadingUrls(false);
      }
    }

    loadImages();
    return () => {
      cancelled = true;
    };
  }, [evidence]);

  const handlePress = useCallback((item: EvidenceWithUrl) => {
    if (!item.imageUri) return;
    const typeLabel =
      EVIDENCE_TYPE_LABELS[item.evidence_type] ?? item.evidence_type;
    const roleLabel =
      item.user_role === "buyer"
        ? "Buyer"
        : item.user_role === "seller"
        ? "Seller"
        : "Admin";
    const caption = `${roleLabel} • ${typeLabel}${item.notes ? `\n${item.notes}` : ""}\n${formatRelativeDate(item.created_at)}`;
    const canDelete = !!currentUserId && item.uploaded_by === currentUserId;
    setViewerImage({
      url: item.imageUri,
      caption,
      evidenceId: item.id,
      imagePath: item.image_url,
      canDelete,
    });
  }, [currentUserId]);

  const handleDelete = useCallback(async () => {
    if (!viewerImage || !onDelete) return;
    const result = await onDelete(viewerImage.evidenceId, viewerImage.imagePath);
    if (!result.ok) {
      Alert.alert("Delete Failed", result.error);
    }
  }, [viewerImage, onDelete]);

  if (isLoading || loadingUrls) {
    return (
      <View className="flex-row gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-20 rounded-lg bg-muted" />
        ))}
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <Text className="text-muted-foreground text-xs text-center py-2">
        No evidence photos yet.
      </Text>
    );
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {items.map((item) => (
          <Pressable key={item.id} onPress={() => handlePress(item)}>
            <View className="gap-1">
              {item.imageUri ? (
                <Image
                  source={{ uri: item.imageUri }}
                  className="h-20 w-20 rounded-lg bg-secondary"
                  resizeMode="cover"
                />
              ) : (
                <View className="h-20 w-20 rounded-lg bg-destructive/10 items-center justify-center">
                  <Text style={{ fontSize: 8 }} className="text-destructive text-center px-1">
                    {item.loadError ?? "Error"}
                  </Text>
                </View>
              )}
              <Text
                className="text-muted-foreground text-center"
                style={{ fontSize: 9 }}
                numberOfLines={1}
              >
                {item.user_role === "buyer" ? "Buyer" : "Seller"}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <ImageViewerModal
        visible={!!viewerImage}
        imageUrl={viewerImage?.url ?? null}
        caption={viewerImage?.caption}
        canDelete={viewerImage?.canDelete ?? false}
        onClose={() => setViewerImage(null)}
        onDelete={handleDelete}
      />
    </>
  );
}
