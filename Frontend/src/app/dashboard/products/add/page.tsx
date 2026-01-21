'use client';

/**
 * Add Product Page
 * 
 * Uses the reusable ProductForm component in CREATE mode.
 */

import { ProductForm } from '@/components/products/ProductForm';

export default function AddProductPage() {
  return (
    <ProductForm 
      initialData={null}
      onSuccess={(product) => {
        console.log('Product created:', product);
      }}
    />
  );
}
