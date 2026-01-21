'use client';

/**
 * Edit Product Page
 * 
 * Dynamic route: /dashboard/products/[productId]
 * Fetches product by ID and renders ProductForm in Edit mode.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, Package, Loader2 } from 'lucide-react';
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

  // Fetch product data
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

  // Loading State
  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header Skeleton */}
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Skeleton */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              <Skeleton className="h-10 w-full mb-4" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
            </div>
          </div>

          {/* Sidebar Skeleton */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
            <div className="bg-gray-50 rounded-xl p-6">
              <Skeleton className="h-6 w-24 mb-3" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center justify-center py-8 mt-4">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500 mr-2" />
          <span className="text-gray-500">Loading product...</span>
        </div>
      </div>
    );
  }

  // Error State / 404
  if (error || !product) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h2>
            <p className="text-gray-500 max-w-md">
              {error || 'The product you are looking for does not exist or has been deleted.'}
            </p>
            <p className="text-sm text-gray-400 mt-2">Product ID: {productId}</p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button 
              onClick={() => router.push('/dashboard/products')}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Package className="w-4 h-4 mr-2" />
              View All Products
            </Button>
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
