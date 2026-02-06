'use client';

/**
 * Category Management Page
 * 
 * Full CRUD management for product categories.
 * Features: Table, Search, Add/Edit Modal, Delete confirmation.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  Tag,
  Edit,
  Trash2,
  MoreHorizontal,
  Loader2,
  Package,
  CheckCircle,
  XCircle,
  ArrowLeft,
  FolderOpen,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCategories } from '@/hooks/useCategories';
import { getErrorMessage } from '@/lib/api/apiClient';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/api/categories';

// =============================================================================
// FORM SCHEMA
// =============================================================================

const categoryFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
});

type CategoryFormData = z.infer<typeof categoryFormSchema>;

// =============================================================================
// COMPONENT
// =============================================================================

export default function CategoriesPage() {
  const {
    categories,
    isLoading,
    pagination,
    search,
    setSearch,
    page,
    setPage,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useCategories();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '', is_active: true, sort_order: 0 },
  });

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleOpenCreate = () => {
    setEditingCategory(null);
    form.reset({ name: '', is_active: true, sort_order: 0 });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      is_active: category.is_active,
      sort_order: category.sort_order ?? 0,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: CategoryFormData) => {
    setIsSubmitting(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, data);
      } else {
        await createCategory(data);
      }
      setIsModalOpen(false);
      form.reset();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      await deleteCategory(deletingCategory.id);
      setDeletingCategory(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-purple-50/30 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard/products"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-sm text-gray-400">Products</span>
            <span className="text-sm text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-600">Categories</span>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            Categories
          </h1>
          <p className="text-gray-500 mt-1">
            Manage product categories for structured product entry
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-all h-12 px-6 rounded-xl font-semibold"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-transparent rounded-bl-[100px]" />
          <p className="text-sm font-medium text-gray-500">Total Categories</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{pagination.total}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/10 to-transparent rounded-bl-[100px]" />
          <p className="text-sm font-medium text-gray-500">Active</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {categories.filter(c => c.is_active).length}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-[100px]" />
          <p className="text-sm font-medium text-gray-500">Total Products</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {categories.reduce((sum, c) => sum + (c.product_count || 0), 0)}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-5 mb-6">
        <div className="relative max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 h-12 text-base rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400/20"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <Skeleton className="h-5 w-48 flex-1" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-10 h-10 text-orange-400" />
            </div>
            <p className="text-xl font-semibold text-gray-700">No categories found</p>
            <p className="text-gray-500 mt-1">
              {search ? 'Try a different search term' : 'Add your first category to get started'}
            </p>
            {!search && (
              <Button
                onClick={handleOpenCreate}
                className="mt-6 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-xl px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Category
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider px-6">
                      Name
                    </TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Slug
                    </TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                      Products
                    </TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                      Order
                    </TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                      Status
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow
                      key={category.id}
                      className="hover:bg-orange-50/30 transition-colors"
                    >
                      <TableCell className="px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center">
                            <Tag className="w-4 h-4 text-orange-600" />
                          </div>
                          <span className="font-semibold text-gray-900">
                            {category.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                          {category.slug}
                        </code>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-blue-100 text-blue-700 border border-blue-200 font-semibold">
                          <Package className="w-3 h-3 mr-1" />
                          {category.product_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-gray-500 font-medium">
                          {category.sort_order ?? 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {category.is_active ? (
                          <Badge className="bg-green-100 text-green-700 border border-green-200 px-3 py-1">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1">
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
                              <MoreHorizontal className="w-5 h-5 text-gray-500" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 rounded-xl">
                            <DropdownMenuItem
                              onClick={() => handleOpenEdit(category)}
                              className="cursor-pointer"
                            >
                              <Edit className="w-4 h-4 mr-2 text-gray-500" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingCategory(category)}
                              className="text-red-600 focus:text-red-600 cursor-pointer"
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
            </div>

            {/* Pagination Footer */}
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-orange-50/50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Showing{' '}
                <span className="font-semibold text-gray-900">
                  {categories.length}
                </span>{' '}
                of {pagination.total} categories
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={!pagination.hasPrev}
                  className="rounded-lg"
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-500 px-2">
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!pagination.hasNext}
                  className="rounded-lg"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* CREATE/EDIT MODAL */}
      {/* ================================================================== */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <Tag className="w-4 h-4 text-white" />
              </div>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? 'Update the category details below.'
                : 'Add a new product category.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5 pt-2">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Category Name <span className="text-red-500">*</span>
              </label>
              <Input
                {...form.register('name')}
                placeholder="e.g., Clothing, Electronics"
                className="h-11 rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400/20"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500 mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Sort Order
              </label>
              <Input
                type="number"
                {...form.register('sort_order')}
                placeholder="0"
                className="h-11 rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400/20"
                min="0"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">
                Active
              </label>
              <Switch
                checked={form.watch('is_active')}
                onCheckedChange={(val) => form.setValue('is_active', val)}
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ================================================================== */}
      <Dialog
        open={!!deletingCategory}
        onOpenChange={() => setDeletingCategory(null)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-gray-900">
                &quot;{deletingCategory?.name}&quot;
              </span>
              ? This action cannot be undone.
              {(deletingCategory?.product_count ?? 0) > 0 && (
                <span className="block mt-2 text-amber-600 font-medium">
                  Warning: This category has {deletingCategory?.product_count}{' '}
                  product(s). You must reassign them first.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeletingCategory(null)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
