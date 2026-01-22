/**
 * Currency Formatting Utilities
 * 
 * Centralized currency formatting for the entire application.
 * Change CURRENCY_SYMBOL here to switch between NPR, INR, USD, etc.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export const CURRENCY_CONFIG = {
  symbol: 'Rs.',           // Nepal Rupee symbol
  code: 'NPR',             // ISO 4217 currency code
  locale: 'en-NP',         // Locale for number formatting
  decimalPlaces: 0,        // No decimals for NPR (paisa rarely used)
  thousandsSeparator: ',', // Standard separator
} as const;

// =============================================================================
// FORMATTING FUNCTIONS
// =============================================================================

/**
 * Format a number as currency with the default symbol
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string (e.g., "Rs. 1,234")
 */
export function formatCurrency(
  amount: number | null | undefined,
  options: {
    showSymbol?: boolean;
    showSign?: boolean;
    compact?: boolean;
  } = {}
): string {
  const { showSymbol = true, showSign = false, compact = false } = options;
  
  // Handle null/undefined
  if (amount === null || amount === undefined || isNaN(amount)) {
    return showSymbol ? `${CURRENCY_CONFIG.symbol} 0` : '0';
  }

  const absAmount = Math.abs(amount);
  let formatted: string;

  if (compact) {
    // Compact format for large numbers (e.g., 1.2L, 5.5K)
    if (absAmount >= 10000000) {
      formatted = `${(absAmount / 10000000).toFixed(1)}Cr`;
    } else if (absAmount >= 100000) {
      formatted = `${(absAmount / 100000).toFixed(1)}L`;
    } else if (absAmount >= 1000) {
      formatted = `${(absAmount / 1000).toFixed(1)}K`;
    } else {
      formatted = absAmount.toLocaleString(CURRENCY_CONFIG.locale, {
        minimumFractionDigits: CURRENCY_CONFIG.decimalPlaces,
        maximumFractionDigits: CURRENCY_CONFIG.decimalPlaces,
      });
    }
  } else {
    // Standard format with thousand separators
    formatted = absAmount.toLocaleString(CURRENCY_CONFIG.locale, {
      minimumFractionDigits: CURRENCY_CONFIG.decimalPlaces,
      maximumFractionDigits: CURRENCY_CONFIG.decimalPlaces,
    });
  }

  // Add sign if requested
  let sign = '';
  if (showSign && amount !== 0) {
    sign = amount > 0 ? '+' : '-';
  } else if (amount < 0) {
    sign = '-';
  }

  // Return with or without symbol
  if (showSymbol) {
    return `${sign}${CURRENCY_CONFIG.symbol} ${formatted}`;
  }
  return `${sign}${formatted}`;
}

/**
 * Format currency for display in tables (compact, no symbol prefix)
 * @param amount - The amount to format
 * @returns Formatted string (e.g., "₹1.2K")
 */
export function formatCurrencyCompact(amount: number | null | undefined): string {
  return formatCurrency(amount, { showSymbol: true, compact: true });
}

/**
 * Format currency with explicit +/- sign for balance changes
 * @param amount - The amount to format
 * @returns Formatted string (e.g., "+Rs. 500" or "-Rs. 200")
 */
export function formatCurrencyWithSign(amount: number | null | undefined): string {
  return formatCurrency(amount, { showSymbol: true, showSign: true });
}

/**
 * Format just the number without currency symbol
 * @param amount - The amount to format
 * @returns Formatted number string (e.g., "1,234")
 */
export function formatNumber(amount: number | null | undefined): string {
  return formatCurrency(amount, { showSymbol: false });
}

/**
 * Parse a currency string back to a number
 * @param value - The currency string to parse
 * @returns The numeric value
 */
export function parseCurrency(value: string): number {
  if (!value) return 0;
  // Remove currency symbols, spaces, and commas
  const cleaned = value
    .replace(/[Rs.₹NPR\s,]/gi, '')
    .replace(/K$/i, '000')
    .replace(/L$/i, '00000')
    .replace(/Cr$/i, '0000000')
    .trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format balance with color indication
 * @param balance - The balance amount
 * @returns Object with formatted value and color class
 */
export function formatBalance(balance: number | null | undefined): {
  value: string;
  colorClass: string;
  label: string;
} {
  const amount = balance ?? 0;
  const formatted = formatCurrency(Math.abs(amount));
  
  if (amount > 0) {
    return {
      value: formatted,
      colorClass: 'text-red-600',
      label: 'Payable',
    };
  } else if (amount < 0) {
    return {
      value: formatted,
      colorClass: 'text-green-600',
      label: 'Receivable',
    };
  } else {
    return {
      value: formatted,
      colorClass: 'text-gray-500',
      label: 'Settled',
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  CURRENCY_CONFIG,
  formatCurrency,
  formatCurrencyCompact,
  formatCurrencyWithSign,
  formatNumber,
  parseCurrency,
  formatBalance,
};
