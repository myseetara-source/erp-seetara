'use client';

/**
 * Command Palette (Ctrl+K / Cmd+K)
 * 
 * Global keyboard-accessible search and navigation.
 * Inspired by VS Code, Notion, Linear command palettes.
 * 
 * FEATURES:
 * - Navigate to any page
 * - Search orders by number
 * - Search customers by phone
 * - Quick actions (New Order, New Product)
 * - Keyboard-first UX
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Package,
  ShoppingCart,
  Users,
  Boxes,
  FileText,
  PlusCircle,
  Search,
  Settings,
  Truck,
  LifeBuoy,
  BarChart3,
  User,
  Phone,
  Hash,
  ArrowRight,
  Keyboard,
  Clock,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
  group: 'navigation' | 'actions' | 'search' | 'recent';
}

interface SearchResult {
  type: 'order' | 'customer' | 'product';
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  path: string;
}

// =============================================================================
// COMMAND PALETTE COMPONENT
// =============================================================================

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // =========================================================================
  // KEYBOARD SHORTCUT (Ctrl+K / Cmd+K)
  // =========================================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      
      // Escape to close
      if (e.key === 'Escape') {
        setOpen(false);
      }
      
      // Ctrl+/ for new order (when palette is closed)
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        router.push('/dashboard/orders/new');
        toast.info('Creating new order...', { duration: 1500 });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  // =========================================================================
  // NAVIGATION COMMANDS
  // =========================================================================
  const navigationCommands: CommandItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart3 className="h-4 w-4" />,
      shortcut: 'G D',
      action: () => router.push('/dashboard'),
      keywords: ['home', 'main', 'overview'],
      group: 'navigation',
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: <ShoppingCart className="h-4 w-4" />,
      shortcut: 'G O',
      action: () => router.push('/dashboard/orders'),
      keywords: ['sales', 'orders'],
      group: 'navigation',
    },
    {
      id: 'products',
      label: 'Products',
      icon: <Package className="h-4 w-4" />,
      shortcut: 'G P',
      action: () => router.push('/dashboard/products'),
      keywords: ['items', 'catalog', 'inventory'],
      group: 'navigation',
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: <Users className="h-4 w-4" />,
      shortcut: 'G C',
      action: () => router.push('/dashboard/customers'),
      keywords: ['clients', 'buyers'],
      group: 'navigation',
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: <Boxes className="h-4 w-4" />,
      shortcut: 'G I',
      action: () => router.push('/dashboard/inventory'),
      keywords: ['stock', 'warehouse'],
      group: 'navigation',
    },
    {
      id: 'vendors',
      label: 'Vendors',
      icon: <Truck className="h-4 w-4" />,
      shortcut: 'G V',
      action: () => router.push('/dashboard/vendors'),
      keywords: ['suppliers', 'distributors'],
      group: 'navigation',
    },
    {
      id: 'dispatch',
      label: 'Dispatch',
      icon: <Truck className="h-4 w-4" />,
      action: () => router.push('/dashboard/dispatch'),
      keywords: ['delivery', 'shipping', 'riders'],
      group: 'navigation',
    },
    {
      id: 'support',
      label: 'Support Tickets',
      icon: <LifeBuoy className="h-4 w-4" />,
      action: () => router.push('/dashboard/support'),
      keywords: ['help', 'tickets', 'issues'],
      group: 'navigation',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="h-4 w-4" />,
      shortcut: 'G S',
      action: () => router.push('/dashboard/settings'),
      keywords: ['config', 'preferences'],
      group: 'navigation',
    },
  ];

  // =========================================================================
  // QUICK ACTIONS
  // =========================================================================
  const actionCommands: CommandItem[] = [
    {
      id: 'new-order',
      label: 'New Order',
      icon: <PlusCircle className="h-4 w-4 text-green-500" />,
      shortcut: '⌘/',
      action: () => {
        router.push('/dashboard/orders/new');
        toast.success('Creating new order');
      },
      keywords: ['create', 'add', 'order'],
      group: 'actions',
    },
    {
      id: 'new-product',
      label: 'New Product',
      icon: <PlusCircle className="h-4 w-4 text-blue-500" />,
      action: () => {
        router.push('/dashboard/products/new');
        toast.success('Creating new product');
      },
      keywords: ['create', 'add', 'product'],
      group: 'actions',
    },
    {
      id: 'new-transaction',
      label: 'New Stock Transaction',
      icon: <PlusCircle className="h-4 w-4 text-purple-500" />,
      action: () => {
        router.push('/dashboard/inventory/transaction');
        toast.success('Opening transaction form');
      },
      keywords: ['purchase', 'stock', 'inventory'],
      group: 'actions',
    },
  ];

  // =========================================================================
  // LIVE SEARCH
  // =========================================================================
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results: SearchResult[] = [];

      try {
        // Search orders by number
        if (/^ORD-?\d*/i.test(query) || /^\d{3,}$/.test(query)) {
          const { data } = await apiClient.get('/orders', {
            params: { search: query, limit: 5 },
          });
          
          if (data.success && data.data) {
            data.data.forEach((order: { id: string; order_number: string; customer_name: string; total_amount: number }) => {
              results.push({
                type: 'order',
                id: order.id,
                title: order.order_number,
                subtitle: `${order.customer_name} • Rs. ${order.total_amount}`,
                icon: <FileText className="h-4 w-4 text-orange-500" />,
                path: `/dashboard/orders?selected=${order.id}`,
              });
            });
          }
        }

        // Search customers by phone
        if (/^\d{5,}$/.test(query) || /^98\d*/.test(query)) {
          const { data } = await apiClient.get('/customers', {
            params: { search: query, limit: 5 },
          });
          
          if (data.success && data.data) {
            data.data.forEach((customer: { id: string; name: string; phone: string; total_orders: number }) => {
              results.push({
                type: 'customer',
                id: customer.id,
                title: customer.name,
                subtitle: `${customer.phone} • ${customer.total_orders} orders`,
                icon: <User className="h-4 w-4 text-blue-500" />,
                path: `/dashboard/customers?selected=${customer.id}`,
              });
            });
          }
        }

        // Search products
        if (query.length >= 2) {
          const { data } = await apiClient.get('/products/search', {
            params: { q: query, limit: 5 },
          });
          
          if (data.success && data.data) {
            data.data.forEach((product: { id: string; name: string; brand?: string; variant_count?: number }) => {
              results.push({
                type: 'product',
                id: product.id,
                title: product.name,
                subtitle: `${product.brand || 'No brand'} • ${product.variant_count || 0} variants`,
                icon: <Package className="h-4 w-4 text-green-500" />,
                path: `/dashboard/products/${product.id}`,
              });
            });
          }
        }

        setSearchResults(results);
      } catch (error) {
        console.error('Command palette search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Handle search input change
  useEffect(() => {
    handleSearch(search);
  }, [search, handleSearch]);

  // Handle command execution
  const handleSelect = useCallback((action: () => void) => {
    action();
    setOpen(false);
    setSearch('');
    setSearchResults([]);
  }, []);

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <>
      {/* Trigger Button (optional - for toolbar) */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg border transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-background border rounded font-mono">
          ⌘K
        </kbd>
      </button>

      {/* Command Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command className="rounded-lg border shadow-lg">
          <CommandInput
            placeholder="Type a command or search..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isSearching ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">Searching...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 gap-2">
                  <Search className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No results found.</p>
                  <p className="text-xs text-muted-foreground/70">Try searching for orders, customers, or products</p>
                </div>
              )}
            </CommandEmpty>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <CommandGroup heading="Search Results">
                {searchResults.map((result) => (
                  <CommandItem
                    key={`${result.type}-${result.id}`}
                    onSelect={() => handleSelect(() => router.push(result.path))}
                    className="flex items-center gap-3"
                  >
                    {result.icon}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{result.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Quick Actions */}
            {search.length === 0 && (
              <>
                <CommandGroup heading="Quick Actions">
                  {actionCommands.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      onSelect={() => handleSelect(cmd.action)}
                      className="flex items-center gap-3"
                    >
                      {cmd.icon}
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>

                <CommandSeparator />

                {/* Navigation */}
                <CommandGroup heading="Navigation">
                  {navigationCommands.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      onSelect={() => handleSelect(cmd.action)}
                      className="flex items-center gap-3"
                    >
                      {cmd.icon}
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Footer with keyboard hints */}
            <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted border rounded text-[10px]">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted border rounded text-[10px]">↵</kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted border rounded text-[10px]">esc</kbd>
                  Close
                </span>
              </div>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Seetara ERP
              </span>
            </div>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

// =============================================================================
// KEYBOARD SHORTCUTS HELP
// =============================================================================

export function KeyboardShortcutsHelp() {
  const shortcuts = [
    { keys: '⌘ K', description: 'Open command palette' },
    { keys: '⌘ /', description: 'Create new order' },
    { keys: 'G D', description: 'Go to Dashboard' },
    { keys: 'G O', description: 'Go to Orders' },
    { keys: 'G P', description: 'Go to Products' },
    { keys: 'G C', description: 'Go to Customers' },
    { keys: 'G I', description: 'Go to Inventory' },
    { keys: 'Esc', description: 'Close modal/panel' },
  ];

  return (
    <div className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Keyboard className="h-4 w-4" />
        Keyboard Shortcuts
      </h3>
      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.keys} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{shortcut.description}</span>
            <kbd className="px-2 py-1 bg-muted border rounded text-xs font-mono">
              {shortcut.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CommandPalette;
