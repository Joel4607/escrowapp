import { Text } from "@/components/ui/text";
import type { Database } from "@/lib/database.types";
import { formatRelativeDate } from "@/lib/format";
import { View, Pressable } from "react-native";

type Evidence = Database["public"]["Tables"]["evidence"]["Row"];

const PHASE_COLORS: Record<string, string> = {
  original: "bg-primary",
  dispute: "bg-destructive",
  counter_dispute: "bg-destructive",
  return_shipment: "bg-blue-500",
  return_receipt: "bg-blue-500",
};

const PHASE_LABELS: Record<string, string> = {
  original: "Pre-Delivery",
  dispute: "Dispute",
  return_shipment: "Return Shipment",
  return_receipt: "Return Receipt",
  counter_dispute: "Counter-Dispute",
};

const CATEGORY_LABELS: Record<string, string> = {
  front: "Front view",
  back: "Back view",
  left: "Left side",
  right: "Right side",
  top: "Top",
  bottom: "Bottom",
  serial_number: "Serial number",
  seal: "Sealed package",
  seal_condition: "Seal condition",
  defect: "Defect area",
  packaging: "Packaging",
  accessories: "Accessories",
  unique_identifier: "Unique feature",
  other: "Photo",
};

type Props = {
  evidence: Evidence[];
  onPress?: (evidence: Evidence) => void;
};

export function EvidenceFeed({ evidence, onPress }: Props) {
  if (evidence.length === 0) return null;

  // Sort by most recent first
  const sorted = [...evidence].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <View className="gap-2">
      {sorted.map((item) => {
        const phase = (item.phase as string) || "original";
        const category = (item.category as string) || "other";
        const dotColor = PHASE_COLORS[phase] || "bg-muted-foreground";
        const roleLabel = item.user_role === "buyer" ? "Buyer" : "Seller";
        const phaseLabel = PHASE_LABELS[phase] || phase;
        const categoryLabel = CATEGORY_LABELS[category] || category;

        return (
          <Pressable
            key={item.id}
            className="flex-row items-center gap-3 py-1.5"
            onPress={() => onPress?.(item)}
          >
            <View className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
            <View className="flex-1">
              <Text className="text-foreground text-sm">
                {roleLabel} · {phaseLabel}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {categoryLabel} · {formatRelativeDate(item.created_at)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
