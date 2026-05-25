import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"
import type { RiskLevel } from "~/lib/types"

const riskClasses: Record<RiskLevel, string> = {
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
}

type Props = {
  level: RiskLevel
  className?: string
}

export function RiskBadge({ level, className }: Props) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wider",
        riskClasses[level],
        className
      )}
    >
      {level} risk
    </Badge>
  )
}
