import { Text } from "@/components/ui/text";
import { X, Trash2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  View,
} from "react-native";
import { useState, useEffect } from "react";

type Props = {
  visible: boolean;
  imageUrl: string | null;
  caption?: string;
  canDelete?: boolean;
  onClose: () => void;
  onDelete?: () => void;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");

export function ImageViewerModal({
  visible,
  imageUrl,
  caption,
  canDelete = false,
  onClose,
  onDelete,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Reset loading/error state when a new image is shown
  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(false);
    }
  }, [visible, imageUrl]);

  const handleDelete = () => {
    Alert.alert(
      "Delete Photo",
      "Are you sure you want to delete this evidence photo? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            onDelete?.();
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {/* Top bar */}
        <View
          style={{
            position: "absolute",
            top: 50,
            left: 20,
            right: 20,
            zIndex: 10,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Delete button */}
          {canDelete ? (
            <Pressable
              style={{
                backgroundColor: "rgba(255,60,60,0.3)",
                height: 44,
                width: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
              }}
              onPress={handleDelete}
              hitSlop={16}
            >
              <Icon as={Trash2} className="text-white" size={22} />
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}

          {/* Close button */}
          <Pressable
            style={{
              backgroundColor: "rgba(255,255,255,0.3)",
              height: 44,
              width: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
            }}
            onPress={onClose}
            hitSlop={16}
          >
            <Icon as={X} className="text-white" size={24} />
          </Pressable>
        </View>

        {/* Image */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {loading && !error && (
            <ActivityIndicator
              size="large"
              color="#ffffff"
              style={{ position: "absolute" }}
            />
          )}
          {error && (
            <View style={{ paddingHorizontal: 20, alignItems: "center", gap: 8 }}>
              <Text style={{ color: "#fff", fontSize: 14 }}>
                Failed to load image
              </Text>
            </View>
          )}
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={{
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT * 0.75,
              }}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
            />
          )}
        </View>

        {/* Caption */}
        {caption && (
          <View style={{ paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 }}>
            <Text style={{ color: "#fff", fontSize: 14, textAlign: "center" }}>
              {caption}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
