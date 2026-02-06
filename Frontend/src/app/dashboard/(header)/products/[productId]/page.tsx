'use client';

/**
 * Edit Product Page - Premium Design
 * 
 * Dynamic route: /dashboard/products/[productId]
 * Fetches product by ID and renders ProductForm in Edit mode.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, Package, Loader2, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductForm } from '@/components/products/ProductForm';
import { getProductById, type Product } from '@/lib/api/products';

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.productId as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProduct() {
      if (!productId) {
        setError('Product ID is missing');
        setIsLoading(false);
        return;
      }

      try {
        const data = await getProductById(productId);
        setProduct(data);
      } catch (err: any) {
        console.error('Failed to load product:', err);
        setError(err.message || 'Product not found');
      } finally {
        setIsLoading(false);
      }
    }

    loadProduct();
  }, [productId]);

  // Loading State - Premium Design
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-purple-50/30 p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header Skeleton */}
          <div className="flex items-center gap-4 mb-8">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content Skeleton */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
                <Skeleton className="h-6 w-48 mb-6" />
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                  <Skeleton className="h-24 w-full rounded-xl" />
                </div>
              </div>
              
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
                <Skeleton className="h-6 w-32 mb-6" />
                <div className="space-y-4">
                  <Skeleton className="h-48 w-full rounded-xl" />
                  <Skeleton className="h-48 w-full rounded-xl" />
                </div>
              </div>
            </div>

            {/* Sidebar Skeleton */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
                <Skeleton className="h-48 w-full rounded-xl" />
              </div>
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
                <Skeleton className="h-6 w-24 mb-4" />
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </div>
          </div>

          {/* Loading indicator */}
          <div className="flex items-center justify-center py-12 mt-4">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25 animate-pulse">
                <Edit3 className="w-8 h-8 text-white" />
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                <span className="text-gray-600 font-medium">Loading product...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error State / 404 - Premium Design
  if (error || !product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-red-50/30 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/25">
              <AlertCircle className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h2>
            <p className="text-gray-500 mb-2">
              {error || 'The product you are looking for does not exist or has been deleted.'}
            </p>
            <p className="text-sm text-gray-400 bg-gray-50 rounded-lg py-2 px-4 inline-block font-mono">
              ID: {productId}
            </p>

            <div className="flex flex-col gap-3 mt-8">
              <Button 
                onClick={() => router.push('/dashboard/products')}
                className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/25"
              >
                <Package className="w-5 h-5 mr-2" />
                View All Products
              </Button>
              <Button 
                variant="outline" 
                onClick={() => router.back()}
                className="w-full h-12 rounded-xl font-semibold"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render ProductForm in Edit Mode
  return (
    <ProductForm 
      initialData={product} 
      onSuccess={(updatedProduct) => {
        console.log('Product updated:', updatedProduct);
      }}
    />
  );
}
