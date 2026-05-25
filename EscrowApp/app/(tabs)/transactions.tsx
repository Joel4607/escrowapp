import { EmptyState } from "@/features/transactions/components/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ScreenLoader } from "@/components/screen-state";
import { TransactionCard } from "@/features/transactions/components/transaction-card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/auth-context";
import {
  useTransactions,
  canArchiveTransactionForUser,
  canDeleteTransaction,
  canDeleteTransactionForUser,
  type StatusFilter,
} from "@/features/transactions/use-transactions";
import type { Database } from "@/lib/database.types";
import { PackageSearch, Search } from "lucide-react-native";
import { useState, useCallback, useMemo, useRef } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "Disputed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Expired" },
];

export default function TransactionsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const {
    transactions,
    isLoading,
    refetch,
    deleteTransaction,
    archiveTransaction,
  } = useTransactions(activeFilter);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedQuery(text), 300);
  }, []);

  const filteredTransactions = useMemo(() => {
    if (!debouncedQuery.trim()) return transactions;
    const q = debouncedQuery.trim().toLowerCase();
    return transactions.filter((tx) =>
      tx.item_name.toLowerCase().includes(q),
    );
  }, [transactions, debouncedQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = useCallback((transaction: Transaction) => {
    const canDelete = canDeleteTransactionForUser(transaction, session?.user.id);
    const canArchive = canArchiveTransactionForUser(transaction, session?.user.id);

    if (!canDelete && !canArchive) {
      Alert.alert(
        "Not Available",
        transaction.buyer_id === session?.user.id
          ? "Transactions with active locked funds cannot be deleted."
          : transaction.seller_id === session?.user.id
          ? "Only settled transactions can be hidden from your list."
          : "You can only hide transactions where you are the seller.",
      );
      return;
    }

    if (canDelete && !canDeleteTransaction(transaction.status)) {
      Alert.alert("Cannot Delete", "Transactions with active locked funds cannot be deleted.");
      return;
    }

    Alert.alert(
      canDelete ? "Delete Transaction" : "Hide Transaction",
      canDelete
        ? `Delete "${transaction.item_name}"? This cannot be undone.`
        : `Hide "${transaction.item_name}" from your transaction list? The buyer will still keep their record.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: canDelete ? "Delete" : "Hide",
          style: "destructive",
          onPress: async () => {
            const result = canDelete
              ? await deleteTransaction(transaction.id)
              : await archiveTransaction(transaction.id);
            if (!result?.ok) {
              Alert.alert(
                canDelete ? "Delete Failed" : "Hide Failed",
                result?.error ?? "Could not update transaction.",
              );
            }
          },
        },
      ],
    );
  }, [archiveTransaction, deleteTransaction, session?.user.id]);

  return (
    <SafeAreaView className="bg-background flex-1">
      {/* Header */}
      <View className="px-6 pt-4 pb-2">
        <Text className="text-foreground text-2xl font-bold">
          Transactions
        </Text>
      </View>

      {/* Search Bar */}
      <View className="px-6 pt-2 pb-1">
        <View className="flex-row items-center bg-card border border-border rounded-xl px-3 gap-2">
          <Icon as={Search} className="text-muted-foreground" size={18} />
          <Input
            className="flex-1 h-11 border-0 bg-transparent"
            placeholder="Search by item name..."
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Filter Chips */}
      <View className="px-6 py-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {FILTERS.map((filter) => {
            const isActive = filter.key === activeFilter;
            return (
              <Pressable
                key={filter.key}
                className={`rounded-full px-4 py-2 border ${
                  isActive
                    ? "bg-primary border-primary"
                    : "bg-card border-border"
                }`}
                onPress={() => setActiveFilter(filter.key)}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Transaction List */}
      {isLoading ? (
        <ScreenLoader message="Loading transactions..." />
      ) : filteredTransactions.length > 0 ? (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionCard
              transaction={item}
              currentUserId={session?.user.id ?? ""}
              onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: item.id } })}
              onLongPress={() => handleDelete(item)}
            />
          )}
          contentContainerClassName="px-6 gap-3 pb-6"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <EmptyState
          icon={PackageSearch}
          title="No transactions found"
          description={
            debouncedQuery.trim()
              ? `No transactions matching "${debouncedQuery.trim()}".`
              : activeFilter === "all"
              ? "You haven't made any transactions yet."
              : `No ${activeFilter} transactions to show.`
          }
        />
      )}
    </SafeAreaView>
  );
}
