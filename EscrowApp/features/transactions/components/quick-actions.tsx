import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ArrowDownToLine, LogIn, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

type QuickActionItem = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
};

type QuickActionsProps = {
  onNewTransaction: () => void;
  onAddMoney: () => void;
  onJoinTransaction: () => void;
};

export function QuickActions({
  onNewTransaction,
  onAddMoney,
  onJoinTransaction,
}: QuickActionsProps) {
  const actions: QuickActionItem[] = [
    {
      icon: Plus,
      label: "New",
      onPress: onNewTransaction,
    },
    {
      icon: ArrowDownToLine,
      label: "Add Money",
      onPress: onAddMoney,
    },
    {
      icon: LogIn,
      label: "Join",
      onPress: onJoinTransaction,
    },
  ];

  return (
    <View className="flex-row justify-between gap-3">
      {actions.map((action) => (
        <Pressable
          key={action.label}
          className="bg-card border border-border flex-1 items-center gap-2.5 rounded-2xl py-4"
          onPress={action.onPress}
        >
          <Icon as={action.icon} className="text-primary" size={22} />
          <Text className="text-foreground text-xs font-medium">
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
