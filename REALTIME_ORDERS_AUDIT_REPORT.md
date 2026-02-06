# 🚀 Real-Time Orders Page Audit Report
## Lightning-Fast Updates for 100-200 Concurrent Users

**Date:** February 5, 2026  
**Priority:** P1 - Performance Critical  
**Goal:** Google Sheets-like real-time collaboration on Orders page

---

## 📊 Executive Summary

To achieve **instant, Google Sheets-like updates** across 100-200 concurrent users, we need to implement a **Hybrid Real-Time Architecture** combining:
1. **Supabase Realtime** (PostgreSQL LISTEN/NOTIFY)
2. **Optimistic UI Updates** (instant local feedback)
3. **Smart Invalidation** (surgical cache updates)
4. **Presence System** (who's viewing what)

**Estimated Implementation Time:** 3-5 days  
**Complexity:** Medium-High

---

## 🔍 Current Architecture Analysis

### What We Have Now

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Frontend   │ ───► │   Backend   │ ───► │  Supabase   │
│  (Next.js)  │ HTTP │  (Express)  │ SQL  │ (PostgreSQL)│
└─────────────┘      └─────────────┘      └─────────────┘
```

**Current Flow:**
1. User A edits order → API call → Database update → User A sees change
2. User B sees change only after **manual refresh** or **30-second stale time**

### Current Limitations

| Issue | Impact |
|-------|--------|
| Polling-based updates | 30-second delay for other users |
| Full refetch on change | Expensive for 100+ users |
| No presence awareness | Users don't know who else is editing |
| React Query stale time | Changes not reflected instantly |
| No conflict detection | Last-write-wins (data loss risk) |

---

## 🎯 Target Architecture

### Google Sheets-Like Real-Time

```
┌─────────────┐                              ┌─────────────┐
│   User A    │◄────────────────────────────►│   User B    │
│  (Browser)  │      WebSocket (Realtime)    │  (Browser)  │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  ┌─────────────────────────────────────┐   │
       └──►│      Supabase Realtime Channel     │◄──┘
           │   (PostgreSQL LISTEN/NOTIFY)       │
           └─────────────────┬──────────────────┘
                             │
                    ┌────────▼────────┐
                    │    PostgreSQL   │
                    │   (orders table)│
                    └─────────────────┘
```

**Target Flow:**
1. User A edits order → **Optimistic UI update** (instant)
2. API call → Database update
3. PostgreSQL triggers **NOTIFY**
4. Supabase broadcasts to **ALL connected clients**
5. User B, C, D... see change in **<100ms**

---

## 📋 Implementation Checklist

### Phase 1: Supabase Realtime Setup (Day 1)

#### 1.1 Enable Realtime on Orders Table

```sql
-- Migration: Enable realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Enable row-level changes (INSERT, UPDATE, DELETE)
-- This is done in Supabase Dashboard > Database > Replication
```

#### 1.2 Create Realtime Hook

```typescript
// hooks/useOrdersRealtime.ts
import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useOrdersRealtime() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    // Subscribe to orders table changes
    const channel: RealtimeChannel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('[Realtime] Order change:', payload.eventType, payload.new?.readable_id);
          
          // Surgical update instead of full refetch
          if (payload.eventType === 'INSERT') {
            // Add new order to cache
            queryClient.setQueryData(['orders', 'list'], (old: any) => {
              if (!old) return old;
              return {
                ...old,
                data: [payload.new, ...old.data],
                pagination: { ...old.pagination, total: old.pagination.total + 1 }
              };
            });
          } else if (payload.eventType === 'UPDATE') {
            // Update existing order in cache
            queryClient.setQueryData(['orders', 'list'], (old: any) => {
              if (!old) return old;
              return {
                ...old,
                data: old.data.map((order: any) => 
                  order.id === payload.new.id ? { ...order, ...payload.new } : order
                )
              };
            });
          } else if (payload.eventType === 'DELETE') {
            // Remove order from cache
            queryClient.setQueryData(['orders', 'list'], (old: any) => {
              if (!old) return old;
              return {
                ...old,
                data: old.data.filter((order: any) => order.id !== payload.old.id),
                pagination: { ...old.pagination, total: old.pagination.total - 1 }
              };
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, supabase]);
}
```

### Phase 2: Optimistic Updates (Day 2)

#### 2.1 Instant UI Feedback

```typescript
// hooks/useOptimisticOrderUpdate.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useOptimisticOrderUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, updates }) => {
      const response = await apiClient.patch(`/orders/${orderId}`, updates);
      return response.data;
    },
    
    // ⚡ INSTANT: Update UI before API call completes
    onMutate: async ({ orderId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['orders', 'list'] });
      
      // Snapshot previous value
      const previousOrders = queryClient.getQueryData(['orders', 'list']);
      
      // Optimistically update cache
      queryClient.setQueryData(['orders', 'list'], (old: any) => ({
        ...old,
        data: old.data.map((order: any) =>
          order.id === orderId ? { ...order, ...updates } : order
        )
      }));
      
      return { previousOrders };
    },
    
    // Rollback on error
    onError: (err, variables, context) => {
      queryClient.setQueryData(['orders', 'list'], context?.previousOrders);
      toast.error('Failed to update order');
    },
    
    // Sync with server response
    onSettled: () => {
      // Don't invalidate - realtime will handle it
    },
  });
}
```

### Phase 3: Presence System (Day 3)

#### 3.1 Show Who's Viewing/Editing

```typescript
// hooks/useOrderPresence.ts
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  viewing_order_id?: string;
  editing_order_id?: string;
}

export function useOrderPresence(currentOrderId?: string) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase.channel('orders-presence', {
      config: { presence: { key: 'user-id' } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat() as PresenceUser[];
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Broadcast this user's presence
          await channel.track({
            id: 'current-user-id',
            name: 'Current User',
            viewing_order_id: currentOrderId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrderId, supabase]);

  // Check if someone else is editing the same order
  const isBeingEditedBy = onlineUsers.find(
    u => u.editing_order_id === currentOrderId && u.id !== 'current-user-id'
  );

  return { onlineUsers, isBeingEditedBy };
}
```

#### 3.2 UI Component for Presence

```tsx
// components/orders/ActiveUsersIndicator.tsx
export function ActiveUsersIndicator({ orderId }: { orderId: string }) {
  const { onlineUsers, isBeingEditedBy } = useOrderPresence(orderId);
  
  const viewingThisOrder = onlineUsers.filter(u => u.viewing_order_id === orderId);
  
  return (
    <div className="flex items-center gap-1">
      {/* Avatar stack of users viewing this order */}
      {viewingThisOrder.slice(0, 3).map((user, i) => (
        <div 
          key={user.id}
          className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center border-2 border-white -ml-2 first:ml-0"
          style={{ zIndex: 10 - i }}
          title={user.name}
        >
          {user.name.charAt(0)}
        </div>
      ))}
      {viewingThisOrder.length > 3 && (
        <span className="text-xs text-gray-500">+{viewingThisOrder.length - 3}</span>
      )}
      
      {/* Warning if someone else is editing */}
      {isBeingEditedBy && (
        <span className="ml-2 text-xs text-amber-600 animate-pulse">
          🔒 {isBeingEditedBy.name} is editing...
        </span>
      )}
    </div>
  );
}
```

### Phase 4: Conflict Resolution (Day 4)

#### 4.1 Optimistic Locking with Version

```sql
-- Add version column for optimistic locking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create trigger to auto-increment version
CREATE OR REPLACE FUNCTION increment_order_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_version_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION increment_order_version();
```

#### 4.2 Backend Conflict Check

```javascript
// services/order/OrderCore.service.js
async updateOrder(id, data, context) {
  const { version, ...updateData } = data;
  
  // Check version to prevent conflicts
  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update(updateData)
    .eq('id', id)
    .eq('version', version) // Only update if version matches
    .select()
    .single();
  
  if (error || !updated) {
    // Version mismatch = someone else updated it
    throw new ConflictError(
      'This order was modified by another user. Please refresh and try again.'
    );
  }
  
  return updated;
}
```

### Phase 5: Performance Optimization (Day 5)

#### 5.1 Batch Updates for High Load

```typescript
// hooks/useRealtimeBatch.ts
import { useEffect, useRef } from 'react';

export function useRealtimeBatch(onBatchReady: (updates: any[]) => void) {
  const batchRef = useRef<any[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();

  const addToBatch = (update: any) => {
    batchRef.current.push(update);
    
    // Debounce: process batch after 50ms of no new updates
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (batchRef.current.length > 0) {
        onBatchReady(batchRef.current);
        batchRef.current = [];
      }
    }, 50);
  };

  return { addToBatch };
}
```

#### 5.2 Selective Field Updates

```typescript
// Only broadcast changed fields, not entire row
const channel = supabase
  .channel('orders-realtime')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    // Filter to only specific columns we care about
    filter: 'status=neq.status,delivery_type=neq.delivery_type'
  }, handleChange);
```

---

## 📊 Architecture Comparison

| Feature | Current | After Implementation |
|---------|---------|---------------------|
| Update Latency | 30,000ms (polling) | **<100ms** (realtime) |
| Data Transfer | Full refetch (50KB+) | **Delta only (~500 bytes)** |
| Server Load | High (constant polling) | **Low (push-based)** |
| Concurrent Users | ~50 comfortable | **200+ comfortable** |
| Conflict Handling | Last-write-wins | **Version-based locking** |
| User Awareness | None | **Live presence indicators** |

---

## 🔧 Required Changes

### Backend Changes

1. **Enable Supabase Realtime Publication**
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE orders;
   ```

2. **Add Version Column for Conflict Detection**
   ```sql
   ALTER TABLE orders ADD COLUMN version INTEGER DEFAULT 1;
   ```

3. **Update Order Service** - Check version on updates

### Frontend Changes

1. **Create `useOrdersRealtime` Hook** - Subscribe to changes
2. **Create `useOrderPresence` Hook** - Track who's online
3. **Update `useOrders` Hook** - Use optimistic updates
4. **Add Conflict UI** - Show when someone else is editing
5. **Add Presence UI** - Show active users avatars

### Infrastructure

1. **Supabase Dashboard** - Enable Realtime for `orders` table
2. **WebSocket Connection** - Already available via Supabase JS client
3. **No additional servers needed** - Supabase handles scaling

---

## 💡 Quick Win: Minimal Implementation

If you want **immediate improvement** with minimal changes:

```typescript
// Add this single line to orders/page.tsx useEffect:
useEffect(() => {
  const channel = supabase
    .channel('orders-quick')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      // Simple: just refetch on any change
      refetch();
    })
    .subscribe();
    
  return () => supabase.removeChannel(channel);
}, []);
```

This gives **instant notification of changes** but still does full refetch. Good for quick demo, not optimal for 200 users.

---

## 📈 Scaling Considerations

### For 100-200 Users

| Component | Recommendation |
|-----------|---------------|
| Supabase Plan | Pro ($25/mo) - 500 concurrent realtime connections |
| React Query | `staleTime: Infinity` when realtime is active |
| Batch Updates | Debounce UI updates every 50ms |
| Presence | Limit to 10 visible avatars |

### For 500+ Users

| Component | Recommendation |
|-----------|---------------|
| Supabase Plan | Team ($599/mo) or Enterprise |
| Add Redis | For presence state (faster than Supabase) |
| Add CDN | For static assets |
| Sharding | Split by fulfillment_type or date |

---

## ✅ Checklist Summary

- [ ] Enable Supabase Realtime on `orders` table
- [ ] Create `useOrdersRealtime` hook
- [ ] Implement optimistic updates in mutations
- [ ] Add version column for conflict detection
- [ ] Create `useOrderPresence` hook
- [ ] Add active users indicator UI
- [ ] Add "being edited by" warning
- [ ] Implement batch processing for high load
- [ ] Test with 100+ concurrent connections
- [ ] Monitor WebSocket connections in production

---

## 🎯 Expected Results

After implementation:
- **Update latency:** <100ms (vs 30,000ms now)
- **Perceived performance:** Instant (like Google Sheets)
- **Concurrent users:** 200+ without degradation
- **Conflict rate:** Near zero with optimistic locking
- **User experience:** Collaborative, live, modern

---

*Report generated by ERP System Audit Tool*
