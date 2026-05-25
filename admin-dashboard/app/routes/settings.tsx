import { Settings } from "lucide-react"
import { EmptyState } from "~/components/screen-states"

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Platform configuration and admin preferences
        </p>
      </div>
      <EmptyState
        title="Settings coming soon"
        description="Admin settings and configuration will be available here."
        icon={Settings}
      />
    </div>
  )
}
