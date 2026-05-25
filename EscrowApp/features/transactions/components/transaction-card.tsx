import { Text } from "@/components/ui/text";
import type { Database } from "@/lib/database.types";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import { Pressable, View } from "react-native";
import { StatusBadge } from "./status-badge";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

type TransactionCardProps = {
  transaction: Transaction;
  currentUserId: string;
  onPress?: () => void;
  onLongPress?: () => void;
};

const ITEM_COLORS = [
  "bg-primary",
  "bg-blue-600",
  "bg-purple-600",
  "bg-orange-500",
  "bg-pink-600",
  "bg-cyan-600",
];

function getColorForItem(name: string): string {
  const index = name.charCodeAt(0) % ITEM_COLORS.length;
  return ITEM_COLORS[index];
}

export function TransactionCard({
  transaction,
  currentUserId,
  onPress,
  onLongPress,
}: TransactionCardProps) {
  const isBuyer = transaction.buyer_id === currentUserId;
  const counterparty = isBuyer
    ? transaction.seller_contact
    : "You're selling";
  const initial = transaction.item_name.charAt(0).toUpperCase();
  const color = getColorForItem(transaction.item_name);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <View className="bg-card border border-border rounded-2xl overflow-hidden">
        <View className="flex-row items-center gap-3 px-4 py-3.5">
          <View
            className={`h-10 w-10 items-center justify-center rounded-xl ${color}`}
          >
            <Text className="text-white text-sm font-bold">{initial}</Text>
          </View>

          <View className="flex-1 gap-0.5">
            <Text className="text-foreground font-semibold" numberOfLines={1}>
              {transaction.item_name}
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {counterparty}
            </Text>
          </View>

          <View className="items-end gap-1.5">
            <Text className="text-foreground font-semibold">
              {formatCurrency(transaction.price)}
            </Text>
            <StatusBadge status={transaction.status} />
          </View>
        </View>

        <View className="bg-muted/30 border-t border-border px-4 py-2">
          <Text className="text-muted-foreground text-xs">
            {formatRelativeDate(transaction.created_at)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
