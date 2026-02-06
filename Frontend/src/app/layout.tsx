import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'ERP System | E-Commerce Order Management',
  description: 'Scalable E-commerce ERP for managing Orders, Inventory, Vendors, and Logistics',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
