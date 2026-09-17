import { ShieldAlert } from 'lucide-react';

/**
 * Role gate — sirf admin/manager ke liye. Kaam UI par nahi, role par hota hai:
 * agar cashier URL type kar ke andar aane ki koshish kare to screen nahi khulti.
 */
export default function AdminOnly({
  children,
  allow = ['admin', 'manager'],
}: {
  children: React.ReactNode;
  allow?: string[];
}) {
  let role = '';
  try { role = localStorage.getItem('pos-user-role') || ''; } catch { /* storage off */ }

  if (allow.includes(role)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border border-primary/15 bg-card p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h2 className="text-base font-bold text-foreground">Administrator access only</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This screen is restricted. Please sign in with an administrator account to continue.
        </p>
      </div>
    </div>
  );
}
