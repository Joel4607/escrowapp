import { BalanceCard } from "@/features/transactions/components/balance-card";
import { EmptyState } from "@/features/transactions/components/empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import { useUserProfile } from "@/features/user/use-user-profile";
import { useEscrowLedger } from "@/features/transactions/use-escrow-ledger";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { LedgerType } from "@/lib/database.types";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
} from "lucide-react-native";
import { useState, useCallback } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const LEDGER_LABELS: Record<LedgerType, string> = {
  fund: "Funds Locked",
  release: "Released to Seller",
  refund: "Refunded",
  partial_refund: "Partial Refund",
};

const LEDGER_ICONS: Record<LedgerType, typeof ArrowDownRight> = {
  fund: ArrowDownRight,
  release: ArrowUpRight,
  refund: ArrowDownRight,
  partial_refund: ArrowDownRight,
};

export default function WalletScreen() {
  const { session } = useAuth();
  const { profile, isLoading, refetch } = useUserProfile();
  const { entries, isLoading: ledgerLoading, refetch: refetchLedger } = useEscrowLedger();
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchLedger()]);
    setRefreshing(false);
  }, [refetch, refetchLedger]);
  const [amount, setAmount] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddMoney = async () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }

    if (!session?.user || !profile) return;

    setAdding(true);
    try {
      const { error } = await supabase.rpc("add_wallet_funds", {
        p_amount: parsed,
      });

      if (error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert("Success", `${formatCurrency(parsed)} added to your wallet.`);
        setAmount("");
        setShowAddMoney(false);
        refetch();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      Alert.alert("Error", msg);
    } finally {
      setAdding(false);
    }
  };

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
        <View className="px-6 pt-4 pb-6">
          <Text className="text-foreground text-2xl font-bold">Wallet</Text>
        </View>

        {/* Balance Card */}
        <View className="px-6">
          <BalanceCard
            availableBalance={profile?.wallet_balance ?? 0}
            lockedBalance={profile?.locked_balance ?? 0}
            isLoading={isLoading}
          />
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-3 px-6 mt-6">
          <Pressable
            className="bg-card border border-border flex-1 flex-row items-center justify-center gap-2 rounded-xl py-4"
            onPress={() => setShowAddMoney(true)}
          >
            <Icon as={ArrowDownToLine} className="text-primary" size={18} />
            <Text className="text-foreground font-semibold">Add Money</Text>
          </Pressable>

          <Pressable
            className="bg-card border border-border flex-1 flex-row items-center justify-center gap-2 rounded-xl py-4"
            onPress={() =>
              Alert.alert("Coming Soon", "Withdrawals will be available in a future update.")
            }
          >
            <Icon as={ArrowUpFromLine} className="text-muted-foreground" size={18} />
            <Text className="text-foreground font-semibold">Withdraw</Text>
          </Pressable>
        </View>

        {/* Escrow Activity */}
        <View className="mt-8 px-6">
          <Text className="text-foreground text-lg font-semibold mb-4">
            Escrow Activity
          </Text>
          {ledgerLoading ? (
            <View className="gap-3">
              {[1, 2].map((i) => (
                <View
                  key={i}
                  className="bg-card border border-border h-16 rounded-xl animate-pulse"
                />
              ))}
            </View>
          ) : entries.length > 0 ? (
            <View className="gap-3">
              {entries.map((entry) => {
                const LedgerIcon = LEDGER_ICONS[entry.type] ?? ArrowDownRight;
                return (
                  <View
                    key={entry.id}
                    className="bg-card border border-border rounded-xl px-4 py-3 flex-row items-center gap-3"
                  >
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-lg ${
                        entry.type === "fund"
                          ? "bg-destructive/15"
                          : "bg-primary/15"
                      }`}
                    >
                      <Icon
                        as={LedgerIcon}
                        className={
                          entry.type === "fund"
                            ? "text-destructive"
                            : "text-primary"
                        }
                        size={16}
                      />
                    </View>
                    <View className="flex-1 gap-0.5">
                      <Text className="text-foreground font-medium text-sm">
                        {LEDGER_LABELS[entry.type]}
                      </Text>
                      {entry.transactions?.item_name && (
                        <Text
                          className="text-muted-foreground text-xs"
                          numberOfLines={1}
                        >
                          {entry.transactions.item_name}
                        </Text>
                      )}
                      <Text className="text-muted-foreground text-xs">
                        {formatRelativeDate(entry.created_at)}
                      </Text>
                    </View>
                    <Text
                      className={`font-semibold text-sm ${
                        entry.type === "fund"
                          ? "text-destructive"
                          : "text-primary"
                      }`}
                    >
                      {entry.type === "fund" ? "-" : "+"}
                      {formatCurrency(entry.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState
              icon={Receipt}
              title="No escrow activity"
              description="Your escrow fund, release, and refund history will appear here."
            />
          )}
        </View>
      </ScrollView>

      {/* Add Money Modal */}
      <Modal
        visible={showAddMoney}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMoney(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-card border-t border-border rounded-t-3xl px-6 pt-6 pb-10">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-foreground text-xl font-bold">
                Add Money
              </Text>
              <Pressable onPress={() => setShowAddMoney(false)}>
                <Text className="text-muted-foreground text-2xl">
                  &#x2715;
                </Text>
              </Pressable>
            </View>

            <Text className="text-muted-foreground text-sm mb-2">
              Enter amount (simulated for testing)
            </Text>
            <Input
              className="h-14 rounded-xl text-lg mb-4"
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <View className="flex-row gap-2 mb-6">
              {[100, 500, 1000, 5000].map((preset) => (
                <Pressable
                  key={preset}
                  className="bg-muted border border-border flex-1 items-center rounded-lg py-2"
                  onPress={() => setAmount(preset.toString())}
                >
                  <Text className="text-foreground text-sm font-medium">
                    {"₵"}{preset}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Button
              size="lg"
              className="h-14 rounded-xl"
              onPress={handleAddMoney}
              disabled={adding || !amount}
            >
              <Text className="text-primary-foreground text-base font-semibold">
                {adding ? "Adding..." : "Add to Wallet"}
              </Text>
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
