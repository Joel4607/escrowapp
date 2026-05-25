import { Text } from "@/components/ui/text";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Wallet, Lock } from "lucide-react-native";

type BalanceCardProps = {
  availableBalance: number;
  lockedBalance: number;
  isLoading: boolean;
};

export function BalanceCard({
  availableBalance,
  lockedBalance,
  isLoading,
}: BalanceCardProps) {
  return (
    <View className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Main balance */}
      <View className="p-6 pb-4">
        <View className="flex-row items-center gap-2 mb-2">
          <View className="bg-primary/15 h-8 w-8 items-center justify-center rounded-lg">
            <Icon as={Wallet} className="text-primary" size={16} />
          </View>
          <Text className="text-muted-foreground text-sm font-medium">
            Available Balance
          </Text>
        </View>

        {isLoading ? (
          <Skeleton className="mt-2 h-10 w-48 bg-muted" />
        ) : (
          <Text className="text-foreground mt-1 text-4xl font-bold tracking-tight">
            {formatCurrency(availableBalance)}
          </Text>
        )}
      </View>

      {/* Locked balance section */}
      <View className="bg-muted/50 border-t border-border px-6 py-3 flex-row items-center gap-2">
        <Icon as={Lock} className="text-muted-foreground" size={14} />
        {isLoading ? (
          <Skeleton className="h-4 w-36 bg-muted" />
        ) : (
          <Text className="text-muted-foreground text-sm">
            {formatCurrency(lockedBalance)} locked in escrow
          </Text>
        )}
      </View>
    </View>
  );
}
