/**
 * Public Layout - No authentication, no dashboard sidebar
 * Used for: /support/complaint and other public pages
 */

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
