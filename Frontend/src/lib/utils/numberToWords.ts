/**
 * Number to Words Converter
 * 
 * Converts numeric amounts to English words for invoice display.
 * Follows Nepali numbering system (Lakhs/Crores) format.
 * 
 * Example: 5700 → "Rupees Five Thousand Seven Hundred Only"
 */

// =============================================================================
// WORD MAPPINGS
// =============================================================================

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert a number less than 100 to words
 */
function convertLessThanHundred(num: number): string {
  if (num < 20) {
    return ones[num];
  }
  const ten = Math.floor(num / 10);
  const one = num % 10;
  return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
}

/**
 * Convert a number less than 1000 to words
 */
function convertLessThanThousand(num: number): string {
  if (num < 100) {
    return convertLessThanHundred(num);
  }
  const hundred = Math.floor(num / 100);
  const remainder = num % 100;
  return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + convertLessThanHundred(remainder) : '');
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Convert a number to words in Nepali Rupees format
 * 
 * @param amount - The amount to convert (supports up to Crores)
 * @param currency - Currency prefix (default: "Rupees")
 * @param suffix - Suffix after the amount (default: "Only")
 * @returns The amount in words (e.g., "Rupees Five Thousand Seven Hundred Only")
 * 
 * @example
 * numberToWords(5700) // "Rupees Five Thousand Seven Hundred Only"
 * numberToWords(125000) // "Rupees One Lakh Twenty Five Thousand Only"
 * numberToWords(0) // "Rupees Zero Only"
 */
export function numberToWords(
  amount: number | null | undefined,
  currency: string = 'Rupees',
  suffix: string = 'Only'
): string {
  // Handle edge cases
  if (amount === null || amount === undefined || isNaN(amount)) {
    return `${currency} Zero ${suffix}`;
  }

  // Handle negative numbers
  const isNegative = amount < 0;
  let num = Math.abs(Math.floor(amount));

  if (num === 0) {
    return `${currency} Zero ${suffix}`;
  }

  const parts: string[] = [];

  // Crores (10,000,000)
  if (num >= 10000000) {
    const crores = Math.floor(num / 10000000);
    parts.push(convertLessThanThousand(crores) + ' Crore');
    num %= 10000000;
  }

  // Lakhs (100,000)
  if (num >= 100000) {
    const lakhs = Math.floor(num / 100000);
    parts.push(convertLessThanHundred(lakhs) + ' Lakh');
    num %= 100000;
  }

  // Thousands (1,000)
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    parts.push(convertLessThanHundred(thousands) + ' Thousand');
    num %= 1000;
  }

  // Hundreds and below
  if (num > 0) {
    parts.push(convertLessThanThousand(num));
  }

  // Combine parts
  let result = parts.join(' ');

  // Handle paisa (decimal part) if needed
  const decimalPart = Math.round((Math.abs(amount) % 1) * 100);
  if (decimalPart > 0) {
    result += ' and ' + convertLessThanHundred(decimalPart) + ' Paisa';
  }

  // Add negative prefix if needed
  if (isNegative) {
    result = 'Minus ' + result;
  }

  return `${currency} ${result} ${suffix}`;
}

/**
 * Compact version without currency prefix
 * @param amount - The amount to convert
 * @returns The amount in words without currency prefix
 */
export function amountToWords(amount: number | null | undefined): string {
  return numberToWords(amount, '', '').trim();
}

export default numberToWords;
