import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { useEvidenceRequirements } from "@/features/evidence/use-evidence-requirements";
import { EvidenceUploadButton } from "./evidence-upload-button";
import type { EvidenceType } from "@/features/evidence/use-evidence";
import type { Database } from "@/lib/database.types";
import { CheckCircle, Circle } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";

type Evidence = Database["public"]["Tables"]["evidence"]["Row"];

type Props = {
  phase: string;
  evidenceType: EvidenceType;
  existingEvidence: Evidence[];
  onImageSelected: (uri: string, type: EvidenceType, category: string) => void;
  uploading: boolean;
  disabled?: boolean;
};

export function GuidedEvidenceCapture({
  phase,
  evidenceType,
  existingEvidence,
  onImageSelected,
  uploading,
  disabled = false,
}: Props) {
  const { requirements, isLoading } = useEvidenceRequirements(phase);

  const completedCategories = useMemo(() => {
    const completed = new Set<string>();
    for (const ev of existingEvidence) {
      if (ev.phase === phase && ev.category) {
        completed.add(ev.category);
      }
    }
    return completed;
  }, [existingEvidence, phase]);

  const requiredComplete = useMemo(() => {
    return requirements
      .filter((r) => r.is_required)
      .every((r) => completedCategories.has(r.category));
  }, [requirements, completedCategories]);

  if (isLoading) return null;

  const required = requirements.filter((r) => r.is_required);
  const optional = requirements.filter((r) => !r.is_required);

  return (
    <View className="gap-3">
      {required.length > 0 && (
        <View className="gap-2">
          <Text className="text-foreground text-sm font-semibold">
            Required Photos
          </Text>
          {required.map((req) => {
            const done = completedCategories.has(req.category);
            return (
              <View
                key={req.id}
                className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                  done ? "bg-primary/5 border-primary/30" : "bg-secondary border-border"
                }`}
              >
                <Icon
                  as={done ? CheckCircle : Circle}
                  className={done ? "text-primary" : "text-muted-foreground"}
                  size={20}
                />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-medium">
                    {req.label}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {req.description}
                  </Text>
                </View>
                {!done && !disabled && (
                  <EvidenceUploadButton
                    onImageSelected={(uri) =>
                      onImageSelected(uri, evidenceType, req.category)
                    }
                    evidenceType={evidenceType}
                    label="Add"
                    uploading={uploading}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {optional.length > 0 && (
        <View className="gap-2">
          <Text className="text-foreground text-sm font-semibold">
            Optional Photos
          </Text>
          {optional.map((req) => {
            const done = completedCategories.has(req.category);
            return (
              <View
                key={req.id}
                className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                  done ? "bg-primary/5 border-primary/30" : "bg-secondary border-border"
                }`}
              >
                <Icon
                  as={done ? CheckCircle : Circle}
                  className={done ? "text-primary" : "text-muted-foreground"}
                  size={20}
                />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-medium">
                    {req.label}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {req.description}
                  </Text>
                </View>
                {!done && !disabled && (
                  <EvidenceUploadButton
                    onImageSelected={(uri) =>
                      onImageSelected(uri, evidenceType, req.category)
                    }
                    evidenceType={evidenceType}
                    label="Add"
                    uploading={uploading}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {!requiredComplete && required.length > 0 && (
        <Text className="text-destructive text-xs text-center">
          Complete all required photos before proceeding
        </Text>
      )}
    </View>
  );
}

export { type Props as GuidedEvidenceCaptureProps };
