import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-12 gap-3">
      <View className="bg-muted h-16 w-16 items-center justify-center rounded-2xl mb-2">
        <Icon as={icon} className="text-muted-foreground" size={28} />
      </View>
      <Text className="text-foreground text-lg font-semibold text-center">
        {title}
      </Text>
      <Text className="text-muted-foreground text-sm text-center px-8">
        {description}
      </Text>
      {actionLabel && onAction && (
        <Button className="mt-4 rounded-xl" onPress={onAction}>
          <Text className="text-primary-foreground font-semibold">
            {actionLabel}
          </Text>
        </Button>
      )}
    </View>
  );
}
