/**
 * Print Layout Group
 * 
 * Minimal layout for print pages - no sidebar, no header.
 * Pages render directly without any dashboard chrome.
 */

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
