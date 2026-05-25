# Profile & Transaction History Polish

## Overview

Polish the profile screen with inline name editing, transaction stats, and wallet status. Enhance transaction history with search and additional status filters.

## Profile Screen Changes

### 1. Inline Display Name Edit

- Tap the name text to toggle into edit mode: name text is replaced by a `TextInput` pre-filled with the current name, flanked by save (checkmark) and cancel (X) icon buttons.
- Save updates `users.name` via `supabase.from('users').update({ name }).eq('id', userId)`. RLS policy "Users can update own profile" already permits this.
- Show a small spinner on the save button while the request is in flight. On success, call `refetch()` on the profile query. On error, show an `Alert`.
- The `protect_user_columns` trigger (migration 015) only guards sensitive fields — `name` is not protected, so a direct update works.

### 2. Transaction Stats Card

New card placed between the avatar/info section and the Trust Score card. Three stat tiles in a horizontal row:

| Stat | Label | Count logic |
|------|-------|-------------|
| Completed | "Completed" | `status = 'released'` |
| Disputed | "Disputed" | `status IN ('disputed', 'admin_review')` |
| Total | "Total" | all transactions where user is buyer or seller |

**Data source:** New `useTransactionStats(userId)` hook. Single query: `supabase.from('transactions').select('status').or('buyer_id.eq.{userId},seller_id.eq.{userId}')`. Counts are computed client-side from the returned rows. Returns `{ completed: number, disputed: number, total: number, isLoading: boolean }`.

### 3. Wallet Status in Account Details

Add two rows to the existing Account Details card:
- "Available Balance" → `formatCurrency(profile.wallet_balance)`
- "Locked in Escrow" → `formatCurrency(profile.locked_balance)`

Placed after the "Member since" row, before "Verified." Data already available from `useUserProfile()`.

## Transaction History Changes

### 4. Search Bar

- `TextInput` placed above the filter chips with a search icon and placeholder "Search by item name..."
- Client-side filter: `transactions.filter(tx => tx.item_name.toLowerCase().includes(query))` applied after the status filter.
- Debounced with 300ms delay to avoid re-rendering on every keystroke.
- When search is active and results are empty, show the `EmptyState` with "No matching transactions" message.

### 5. Additional Filter Chips

Add two new filters to the existing array:

```ts
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "Disputed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Expired" },
];
```

Update `StatusFilter` type and `getStatusesForFilter()` in `use-transactions.ts`:
- `cancelled` → `['cancelled', 'rejected']`
- `expired` → `['expired']`

## Files to Create

| File | Purpose |
|------|---------|
| `features/transactions/use-transaction-stats.ts` | Hook returning completed/disputed/total counts |

## Files to Modify

| File | Change |
|------|--------|
| `app/(tabs)/profile.tsx` | Inline name edit, stats card, wallet rows |
| `app/(tabs)/transactions.tsx` | Search bar, new filter chips |
| `features/transactions/use-transactions.ts` | Add `cancelled` and `expired` to `StatusFilter` |

## No Backend Changes

All data is already available via existing RLS SELECT policies. No new RPCs or migrations needed.
