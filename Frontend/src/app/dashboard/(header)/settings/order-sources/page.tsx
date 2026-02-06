'use client';

/**
 * Order Sources Management Page
 * 
 * Manage Facebook Pages / Brands that orders come from.
 * The source name is passed to courier APIs so riders see the correct brand.
 * 
 * Path: /dashboard/settings/order-sources
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Globe,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrderSources } from '@/hooks/useOrderSources';
import type { OrderSource } from '@/lib/api/orderSources';

// =============================================================================
// FORM SCHEMA
// =============================================================================

const orderSourceFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  pixel_id: z.string().max(255).optional().or(z.literal('')),
  is_active: z.boolean().default(true),
});

type OrderSourceFormData = z.infer<typeof orderSourceFormSchema>;

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function OrderSourcesPage() {
  const {
    sources,
    isLoading,
    pagination,
    search,
    setSearch,
    page,
    setPage,
    createSource,
    updateSource,
    deleteSource,
  } = useOrderSources();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<OrderSource | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OrderSource | null>(null);

  const form = useForm<OrderSourceFormData>({
    resolver: zodResolver(orderSourceFormSchema) as any,
    defaultValues: { name: '', pixel_id: '', is_active: true },
  });

  // Open modal for create
  const openCreateModal = () => {
    setEditingSource(null);
    form.reset({ name: '', pixel_id: '', is_active: true });
    setIsModalOpen(true);
  };

  // Open modal for edit
  const openEditModal = (source: OrderSource) => {
    setEditingSource(source);
    form.reset({
      name: source.name,
      pixel_id: source.pixel_id || '',
      is_active: source.is_active,
    });
    setIsModalOpen(true);
  };

  // Submit handler
  const onSubmit = async (data: OrderSourceFormData) => {
    try {
      setIsSubmitting(true);
      const payload = {
        ...data,
        pixel_id: data.pixel_id || null,
      };

      if (editingSource) {
        await updateSource(editingSource.id, payload);
      } else {
        await createSource(payload);
      }
      setIsModalOpen(false);
      form.reset();
    } catch {
      // Error handled by hook
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteSource(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch {
      // Error handled by hook
    }
  };

  // Stats
  const totalSources = sources.length;
  const activeSources = sources.filter(s => s.is_active).length;
  const totalOrders = sources.reduce((sum, s) => sum + (s.order_count || 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Sources</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your Facebook pages and brands. The source name is sent to couriers as the vendor reference.
          </p>
        </div>
        <Button onClick={openCreateModal} className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          Add Source
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Sources</p>
          <p className="text-2xl font-bold text-gray-900">{totalSources}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeSources}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Orders Linked</p>
          <p className="text-2xl font-bold text-orange-600">{totalOrders}</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            <span className="ml-2 text-gray-500">Loading sources...</span>
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Globe className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-lg font-medium">No order sources yet</p>
            <p className="text-sm">Add your Facebook pages or brands to track order origins.</p>
            <Button onClick={openCreateModal} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add First Source
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Pixel ID</TableHead>
                  <TableHead className="font-semibold text-center">Orders</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                          <Package className="w-4 h-4 text-orange-600" />
                        </div>
                        <span className="font-medium text-gray-900">{source.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-500 text-sm font-mono">
                        {source.pixel_id || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono">
                        {source.order_count || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {source.is_active ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-500">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditModal(source)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteConfirm(source)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={!pagination.hasPrev}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={!pagination.hasNext}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSource ? 'Edit Source' : 'Add Order Source'}</DialogTitle>
            <DialogDescription>
              {editingSource
                ? 'Update the source details.'
                : 'Add a Facebook page or brand name. This will appear on courier manifests.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                {...form.register('name')}
                placeholder="e.g. Today Trend, Seetara"
                autoFocus
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500 mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Facebook Pixel ID <span className="text-gray-400">(optional)</span>
              </label>
              <Input
                {...form.register('pixel_id')}
                placeholder="e.g. 123456789012345"
              />
              <p className="text-xs text-gray-400 mt-1">For future analytics integration.</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                {...form.register('is_active')}
                className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-orange-500 hover:bg-orange-600">
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingSource ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Order Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
