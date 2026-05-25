import { BalanceCard } from "@/features/transactions/components/balance-card";
import { EmptyState } from "@/features/transactions/components/empty-state";
import { QuickActions } from "@/features/transactions/components/quick-actions";
import { TransactionCard } from "@/features/transactions/components/transaction-card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import { useUserProfile } from "@/features/user/use-user-profile";
import { useTransactions } from "@/features/transactions/use-transactions";
import { Bell, PackageSearch } from "lucide-react-native";
import { useState, useCallback } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile, isLoading: profileLoading, refetch: refetchProfile } = useUserProfile();
  const { transactions, isLoading: txLoading, refetch: refetchTx } = useTransactions("all", 5);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), refetchTx()]);
    setRefreshing(false);
  }, [refetchProfile, refetchTx]);

  const greeting = profile?.name
    ? `Hello, ${profile.name}`
    : `Hello there`;

  const handleNewTransaction = useCallback(() => {
    if (!profileLoading && (profile?.wallet_balance ?? 0) <= 0) {
      Alert.alert(
        "Empty Wallet",
        "You need funds in your wallet before creating a transaction. Add money first.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Add Money",
            onPress: () => router.push("/(tabs)/wallet"),
          },
        ],
      );
      return;
    }
    router.push("/transaction/create");
  }, [profileLoading, profile?.wallet_balance, router]);

  return (
    <SafeAreaView className="bg-background flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pt-4 pb-6">
          <View className="flex-1">
            <Text className="text-foreground text-2xl font-bold">
              {greeting}
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              {profile?.phone ?? session?.user.email}
            </Text>
          </View>
          <Pressable
            className="bg-card border border-border h-10 w-10 items-center justify-center rounded-xl"
            onPress={() =>
              Alert.alert("Notifications", "No new notifications.")
            }
          >
            <Icon as={Bell} className="text-muted-foreground" size={18} />
          </Pressable>
        </View>

        {/* Balance Card */}
        <View className="px-6">
          <BalanceCard
            availableBalance={profile?.wallet_balance ?? 0}
            lockedBalance={profile?.locked_balance ?? 0}
            isLoading={profileLoading}
          />
        </View>

        {/* Quick Actions */}
        <View className="px-6 mt-6">
          <QuickActions
            onNewTransaction={handleNewTransaction}
            onAddMoney={() => router.push("/(tabs)/wallet")}
            onJoinTransaction={() => router.push("/transaction/join")}
          />
        </View>

        {/* Recent Transactions */}
        <View className="mt-8 px-6">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-foreground text-lg font-semibold">
              Recent Transactions
            </Text>
            {transactions.length > 0 && (
              <Pressable onPress={() => router.push("/(tabs)/transactions")}>
                <Text className="text-primary text-sm font-medium">
                  See all
                </Text>
              </Pressable>
            )}
          </View>

          {txLoading ? (
            <View className="gap-3">
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  className="bg-card border border-border h-24 rounded-2xl animate-pulse"
                />
              ))}
            </View>
          ) : transactions.length > 0 ? (
            <View className="gap-3">
              {transactions.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  transaction={tx}
                  currentUserId={session?.user.id ?? ""}
                  onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: tx.id } })}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon={PackageSearch}
              title="No transactions yet"
              description="Create your first escrow transaction to get started."
              actionLabel="New Transaction"
              onAction={() => router.push("/transaction/create")}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
