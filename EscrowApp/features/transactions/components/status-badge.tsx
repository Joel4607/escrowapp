import { Text } from "@/components/ui/text";
import { getStatusLabel } from "@/lib/format";
import type { TransactionStatus } from "@/lib/database.types";
import { View } from "react-native";

type StatusBadgeProps = {
  status: TransactionStatus;
};

const STATUS_STYLES: Record<
  TransactionStatus,
  { bg: string; text: string; dot: string }
> = {
  created: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  seller_invited: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-400" },
  accepted: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-400" },
  rejected: { bg: "bg-destructive/15", text: "text-red-400", dot: "bg-red-400" },
  funded: { bg: "bg-primary/15", text: "text-primary", dot: "bg-primary" },
  in_delivery: { bg: "bg-orange-500/15", text: "text-orange-400", dot: "bg-orange-400" },
  delivered: { bg: "bg-primary/15", text: "text-primary", dot: "bg-primary" },
  under_inspection: { bg: "bg-yellow-500/15", text: "text-yellow-400", dot: "bg-yellow-400" },
  released: { bg: "bg-primary/15", text: "text-primary", dot: "bg-primary" },
  disputed: { bg: "bg-destructive/15", text: "text-red-400", dot: "bg-red-400" },
  refunded: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-400" },
  partially_refunded: { bg: "bg-orange-500/15", text: "text-orange-400", dot: "bg-orange-400" },
  cancelled: { bg: "bg-destructive/15", text: "text-red-400", dot: "bg-red-400" },
  expired: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  admin_review: { bg: "bg-purple-500/15", text: "text-purple-400", dot: "bg-purple-400" },
  return_approved: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-400" },
  return_in_progress: { bg: "bg-orange-500/15", text: "text-orange-400", dot: "bg-orange-400" },
  return_delivered: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-400" },
  return_inspection: { bg: "bg-yellow-500/15", text: "text-yellow-400", dot: "bg-yellow-400" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = getStatusLabel(status);
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.created;

  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full px-2 py-0.5 ${style.bg}`}
    >
      <View className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      <Text className={`text-[11px] font-medium leading-tight ${style.text}`}>{label}</Text>
    </View>
  );
}
