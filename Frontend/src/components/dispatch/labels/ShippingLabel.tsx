/**
 * ShippingLabel Component
 * 
 * High-density shipping label design for Oddy ST-8A4100 paper
 * Label size: 99.1mm x 67.7mm (3.90" x 2.66")
 * 
 * Features:
 * - Company branding
 * - COD/Prepaid indicator
 * - Customer details with phone prominent
 * - Item list summary
 * - QR Code for order URL
 * - Barcode for order ID scanning
 * - Route/Branch info for logistics
 */

import QRCode from 'react-qr-code';
import Barcode from 'react-barcode';

// =============================================================================
// TYPES
// =============================================================================

export interface LabelOrderItem {
  product_name: string;
  variant_name?: string;
  quantity: number;
}

export interface LabelOrder {
  id: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  alt_phone?: string;
  shipping_address: string;
  shipping_city: string;
  shipping_district?: string;
  destination_branch?: string;
  zone_code?: string;
  total_amount: number;
  payment_method: 'cod' | 'prepaid' | string;
  items?: LabelOrderItem[];
  item_count?: number;
  fulfillment_type?: 'inside_valley' | 'outside_valley' | 'store';
  created_at?: string;
}

interface ShippingLabelProps {
  order: LabelOrder;
  companyName?: string;
  companyLogo?: string;
  showBorder?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ORDER_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.seetara.com';

// =============================================================================
// COMPONENT
// =============================================================================

export default function ShippingLabel({ 
  order, 
  companyName = 'SEETARA',
  companyLogo,
  showBorder = false,
}: ShippingLabelProps) {
  const isCOD = order.payment_method?.toLowerCase() === 'cod';
  const itemCount = order.items?.length || order.item_count || 0;
  const orderUrl = `${ORDER_BASE_URL}/track/${order.readable_id}`;
  
  // Format items for display (max 3 items shown)
  const displayItems = order.items?.slice(0, 3) || [];
  const hasMoreItems = (order.items?.length || 0) > 3;

  return (
    <div 
      className="shipping-label"
      style={{
        width: '99.1mm',
        height: '67.7mm',
        padding: '2mm',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '8pt',
        lineHeight: '1.2',
        backgroundColor: 'white',
        color: '#000',
        overflow: 'hidden',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        border: showBorder ? '1px dashed #ccc' : 'none',
      }}
    >
      {/* Header Row: Logo + Order ID + COD Badge */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        borderBottom: '1pt solid #000',
        paddingBottom: '1.5mm',
        marginBottom: '1.5mm',
      }}>
        {/* Company Logo/Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
          {companyLogo ? (
            <img 
              src={companyLogo} 
              alt={companyName} 
              style={{ height: '6mm', width: 'auto' }} 
            />
          ) : (
            <span style={{ 
              fontWeight: 'bold', 
              fontSize: '10pt',
              letterSpacing: '0.5px',
            }}>
              {companyName}
            </span>
          )}
        </div>

        {/* Order ID */}
        <div style={{ 
          fontWeight: 'bold', 
          fontSize: '11pt',
          fontFamily: 'monospace',
        }}>
          #{order.readable_id}
        </div>

        {/* Payment Badge */}
        <div style={{
          backgroundColor: isCOD ? '#DC2626' : '#16A34A',
          color: 'white',
          padding: '1mm 3mm',
          borderRadius: '2mm',
          fontWeight: 'bold',
          fontSize: '9pt',
        }}>
          {isCOD ? `COD ₹${order.total_amount.toLocaleString()}` : 'PREPAID ✓'}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ 
        display: 'flex', 
        flex: 1,
        gap: '2mm',
        minHeight: 0,
      }}>
        {/* Left: Customer & Items */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          minWidth: 0,
        }}>
          {/* Customer Name */}
          <div style={{ 
            fontWeight: 'bold', 
            fontSize: '10pt',
            marginBottom: '1mm',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {order.customer_name}
          </div>

          {/* Phone Numbers */}
          <div style={{ 
            display: 'flex',
            gap: '2mm',
            marginBottom: '1mm',
          }}>
            <span style={{ 
              fontWeight: 'bold', 
              fontSize: '10pt',
              fontFamily: 'monospace',
            }}>
              📞 {order.customer_phone}
            </span>
            {order.alt_phone && (
              <span style={{ fontSize: '8pt', color: '#666' }}>
                / {order.alt_phone}
              </span>
            )}
          </div>

          {/* Address */}
          <div style={{ 
            fontSize: '7.5pt',
            marginBottom: '1.5mm',
            lineHeight: '1.3',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            📍 {order.shipping_address}
          </div>

          {/* City + District */}
          <div style={{ 
            display: 'flex', 
            gap: '2mm', 
            marginBottom: '1.5mm',
            flexWrap: 'wrap',
          }}>
            <span style={{
              backgroundColor: '#2563EB',
              color: 'white',
              padding: '0.5mm 2mm',
              borderRadius: '1mm',
              fontSize: '7pt',
              fontWeight: '600',
            }}>
              {order.shipping_city}
            </span>
            {order.shipping_district && (
              <span style={{
                backgroundColor: '#7C3AED',
                color: 'white',
                padding: '0.5mm 2mm',
                borderRadius: '1mm',
                fontSize: '7pt',
              }}>
                {order.shipping_district}
              </span>
            )}
            {order.destination_branch && (
              <span style={{
                backgroundColor: '#0891B2',
                color: 'white',
                padding: '0.5mm 2mm',
                borderRadius: '1mm',
                fontSize: '7pt',
              }}>
                🏢 {order.destination_branch}
              </span>
            )}
          </div>

          {/* Items List */}
          <div style={{ 
            flex: 1,
            fontSize: '7pt',
            lineHeight: '1.4',
            backgroundColor: '#F3F4F6',
            padding: '1mm',
            borderRadius: '1mm',
            overflow: 'hidden',
          }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5mm' }}>
              📦 Items ({itemCount}):
            </div>
            {displayItems.map((item, idx) => (
              <div key={idx} style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                • {item.product_name}
                {item.variant_name && ` - ${item.variant_name}`}
                {item.quantity > 1 && ` ×${item.quantity}`}
              </div>
            ))}
            {hasMoreItems && (
              <div style={{ fontStyle: 'italic', color: '#666' }}>
                +{(order.items?.length || 0) - 3} more items...
              </div>
            )}
          </div>
        </div>

        {/* Right: QR + Barcode */}
        <div style={{ 
          width: '26mm',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* QR Code */}
          <div style={{
            padding: '1mm',
            backgroundColor: 'white',
            border: '0.5pt solid #000',
          }}>
            <QRCode 
              value={orderUrl}
              size={70}
              level="M"
            />
          </div>

          {/* Barcode */}
          <div style={{
            transform: 'scale(0.7)',
            transformOrigin: 'center',
            marginTop: '-5mm',
          }}>
            <Barcode 
              value={order.readable_id}
              width={1}
              height={25}
              fontSize={8}
              margin={0}
              displayValue={false}
            />
          </div>

          {/* Zone/Route Code */}
          {order.zone_code && (
            <div style={{
              backgroundColor: '#000',
              color: 'white',
              padding: '0.5mm 2mm',
              borderRadius: '1mm',
              fontSize: '8pt',
              fontWeight: 'bold',
              textAlign: 'center',
              width: '100%',
            }}>
              {order.zone_code}
            </div>
          )}
        </div>
      </div>

      {/* Footer: Total Amount (if COD) + Fulfillment Type */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '0.5pt solid #ccc',
        paddingTop: '1mm',
        marginTop: '1mm',
        fontSize: '7pt',
        color: '#666',
      }}>
        <span>
          {order.fulfillment_type === 'inside_valley' ? '🏠 Inside Valley' : 
           order.fulfillment_type === 'outside_valley' ? '🚚 Outside Valley' : ''}
        </span>
        {isCOD && (
          <span style={{ 
            fontWeight: 'bold', 
            fontSize: '9pt',
            color: '#DC2626',
          }}>
            COLLECT: Rs. {order.total_amount.toLocaleString()}
          </span>
        )}
        <span>
          {order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : ''}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// EMPTY LABEL (for skipped slots)
// =============================================================================

export function EmptyLabel() {
  return (
    <div 
      className="empty-label"
      style={{
        width: '99.1mm',
        height: '67.7mm',
        backgroundColor: 'transparent',
        boxSizing: 'border-box',
      }}
    />
  );
}
