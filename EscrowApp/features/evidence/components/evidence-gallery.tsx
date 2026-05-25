import { Text } from "@/components/ui/text";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { ImageViewerModal } from "./image-viewer-modal";
import { formatRelativeDate } from "@/lib/format";
import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  View,
} from "react-native";

type Evidence = Database["public"]["Tables"]["evidence"]["Row"];

type Props = {
  evidence: Evidence[];
  isLoading: boolean;
};

type EvidenceWithUrl = Evidence & { signedUrl: string | null };

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  item_photo: "Item Photo",
  pre_delivery: "Pre-Delivery",
  received_item: "Received Item",
  dispute_evidence: "Dispute Evidence",
  delivery_proof: "Delivery Proof",
  unboxing: "Unboxing",
};

export function EvidenceGallery({ evidence, isLoading }: Props) {
  const [items, setItems] = useState<EvidenceWithUrl[]>([]);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [viewerImage, setViewerImage] = useState<{
    url: string;
    caption: string;
  } | null>(null);

  useEffect(() => {
    if (evidence.length === 0) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoadingUrls(true);

    async function loadUrls() {
      const withUrls = await Promise.all(
        evidence.map(async (e) => {
          const { data } = await supabase.storage
            .from("evidence")
            .createSignedUrl(e.image_url, 3600);
          return { ...e, signedUrl: data?.signedUrl ?? null };
        }),
      );
      if (!cancelled) {
        setItems(withUrls);
        setLoadingUrls(false);
      }
    }

    loadUrls();
    return () => {
      cancelled = true;
    };
  }, [evidence]);

  const handlePress = useCallback((item: EvidenceWithUrl) => {
    if (!item.signedUrl) return;
    const typeLabel =
      EVIDENCE_TYPE_LABELS[item.evidence_type] ?? item.evidence_type;
    const roleLabel =
      item.user_role === "buyer"
        ? "Buyer"
        : item.user_role === "seller"
        ? "Seller"
        : "Admin";
    const caption = `${roleLabel} • ${typeLabel}${item.notes ? `\n${item.notes}` : ""}\n${formatRelativeDate(item.created_at)}`;
    setViewerImage({ url: item.signedUrl, caption });
  }, []);

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
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => handlePress(item)}>
            <View className="gap-1">
              {item.signedUrl ? (
                <Image
                  source={{ uri: item.signedUrl }}
                  className="h-20 w-20 rounded-lg bg-secondary"
                  resizeMode="cover"
                />
              ) : (
                <View className="h-20 w-20 rounded-lg bg-secondary items-center justify-center">
                  <ActivityIndicator size="small" />
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
        )}
      />

      <ImageViewerModal
        visible={!!viewerImage}
        imageUrl={viewerImage?.url ?? null}
        caption={viewerImage?.caption}
        onClose={() => setViewerImage(null)}
      />
    </>
  );
}
