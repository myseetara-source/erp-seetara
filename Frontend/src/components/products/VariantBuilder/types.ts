/**
 * VariantBuilder Types
 * 
 * Shared types for the VariantBuilder component
 */

export interface ProductOption {
  id: string;
  name: string;
  values: string[];
}

export interface VariantFormData {
  id?: string;
  sku: string;
  color?: string;
  size?: string;
  attributes?: Record<string, string>;
  selling_price: number;
  cost_price: number;
  current_stock: number;
  reserved_stock?: number;
  is_active?: boolean;
}

export interface VariantRow extends VariantFormData {
  primaryValue: string;
  secondaryValues: string[];
  isFirstInGroup: boolean;
  groupRowSpan: number;
}

export interface VariantBuilderProps {
  isEditMode: boolean;
  productOptions: ProductOption[];
  variants: VariantFormData[];
  onOptionsChange: (options: ProductOption[]) => void;
  onVariantsChange: (variants: VariantFormData[]) => void;
  onAddOption: () => void;
  onRemoveOption: (optionId: string) => void;
  onOptionNameChange: (optionId: string, name: string) => void;
  onOptionValuesChange: (optionId: string, values: string[]) => void;
}
