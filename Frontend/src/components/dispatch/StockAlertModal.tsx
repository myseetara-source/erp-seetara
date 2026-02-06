'use client';

/**
 * StockAlertModal - Professional Insufficient Stock Alert
 * 
 * Features:
 * - Animated modal with red warning styling
 * - Sound notification on open
 * - Detailed SKU-level stock information
 * - Quick actions: Add Stock, View Inventory
 */

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Package, ArrowRight, Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface StockShortage {
  sku: string;
  product_name?: string;
  variant_name?: string;
  required: number;
  available: number;
  shortage: number;
}

interface StockAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber?: string;
  message?: string;
  shortages?: StockShortage[];
  onAddStock?: () => void;
}

// Error sound - using Web Audio API for reliability
const playAlertSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Play two-tone alert
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    // Error beep pattern: high-low-high
    playTone(880, now, 0.15);        // A5
    playTone(440, now + 0.15, 0.15); // A4
    playTone(880, now + 0.3, 0.2);   // A5
    
  } catch (error) {
    console.warn('Could not play alert sound:', error);
  }
};

export function StockAlertModal({
  isOpen,
  onClose,
  orderNumber,
  message,
  shortages = [],
  onAddStock,
}: StockAlertModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Play sound when modal opens
  useEffect(() => {
    if (isOpen) {
      playAlertSound();
      // Focus modal for accessibility
      modalRef.current?.focus();
    }
  }, [isOpen]);

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Parse message to extract SKU info if shortages not provided
  const parsedShortages = shortages.length > 0 ? shortages : parseMessageForShortages(message);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full pointer-events-auto overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header with animated pulse */}
              <div className="relative bg-gradient-to-r from-red-500 to-red-600 p-6">
                {/* Animated pulse rings */}
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                  <motion.div
                    animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute w-20 h-20 rounded-full bg-white/20"
                  />
                  <motion.div
                    animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    className="absolute w-20 h-20 rounded-full bg-white/20"
                  />
                </div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>

                {/* Icon and title */}
                <div className="relative flex items-center gap-4">
                  <motion.div
                    animate={{ rotate: [0, -10, 10, -10, 0] }}
                    transition={{ duration: 0.5, repeat: 3 }}
                    className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"
                  >
                    <AlertTriangle className="w-8 h-8 text-white" />
                  </motion.div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Stock Insufficient!</h2>
                    <p className="text-red-100 text-sm">Cannot pack this order</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Order Info */}
                {orderNumber && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs text-gray-500 uppercase font-medium">Order</p>
                    <p className="text-lg font-bold text-gray-900">{orderNumber}</p>
                  </div>
                )}

                {/* Shortage Details */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Stock Shortage Details
                  </h3>
                  
                  <div className="space-y-2">
                    {parsedShortages.length > 0 ? (
                      parsedShortages.map((item, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {item.product_name || item.sku}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm">
                              <span className="text-green-600 font-medium">{item.available}</span>
                              <ArrowRight className="w-3 h-3 text-gray-400" />
                              <span className="text-red-600 font-bold">{item.required}</span>
                            </div>
                            <p className="text-xs text-red-500">
                              Need {item.shortage} more
                            </p>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
                        <p className="text-sm text-red-700">
                          {message || 'Insufficient stock to pack this order. Please add stock first.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="flex-1"
                  >
                    Close
                  </Button>
                  <Link href="/dashboard/inventory" className="flex-1">
                    <Button className="w-full bg-red-500 hover:bg-red-600 text-white">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Stock
                    </Button>
                  </Link>
                </div>

                {/* Quick Link */}
                <Link 
                  href="/dashboard/inventory/transaction/new"
                  className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Go to Stock Entry
                </Link>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Helper to parse error message for stock info
function parseMessageForShortages(message?: string): StockShortage[] {
  if (!message) return [];
  
  // Pattern: "Insufficient stock: SKU-NAME: have X, need Y"
  const regex = /Insufficient stock:\s*([^:]+):\s*have\s*(\d+),\s*need\s*(\d+)/i;
  const match = message.match(regex);
  
  if (match) {
    const sku = match[1].trim();
    const available = parseInt(match[2], 10);
    const required = parseInt(match[3], 10);
    return [{
      sku,
      required,
      available,
      shortage: required - available,
    }];
  }
  
  return [];
}

export default StockAlertModal;
