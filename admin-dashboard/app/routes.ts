import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  // Public route
  route("login", "routes/login.tsx"),

  // Protected admin routes with sidebar layout
  layout("components/admin-layout.tsx", [
    index("routes/home.tsx"),
    route("transactions", "routes/transactions.tsx"),
    route("transactions/:id", "routes/transaction-detail.tsx"),
    route("disputes", "routes/disputes.tsx"),
    route("disputes/:id", "routes/dispute-detail.tsx"),
    route("evidence", "routes/evidence.tsx"),
    route("fraud-flags", "routes/fraud-flags.tsx"),
    route("users", "routes/users.tsx"),
    route("users/:id", "routes/user-detail.tsx"),
    route("ledger", "routes/ledger.tsx"),
    route("audit-logs", "routes/audit-logs.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig
