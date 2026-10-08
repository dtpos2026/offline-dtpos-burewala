// "You are using the default admin password" — the Espresso Orange top bar
// warning (DT Retail POS v1.8). Shown to an administrator only while the
// built-in admin account still has the factory password; it goes away by
// itself once the password is changed in Users & Roles.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { adminUsesDefaultPassword, onDataChange } from '@/lib/store';

export default function DefaultPasswordBanner({ userRole }: { userRole: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [show, setShow] = useState(() => userRole === 'admin' && adminUsesDefaultPassword());
  // Checked again on every page change (the users are cached in memory, so it is
  // cheap) and when the users arrive from another computer.
  useEffect(() => {
    if (userRole !== 'admin') { setShow(false); return; }
    setShow(adminUsesDefaultPassword());
    return onDataChange(col => { if (col === 'users' || col === '*') setShow(adminUsesDefaultPassword()); });
  }, [userRole, pathname]);
  if (!show) return null;
  return (
    <div data-default-password role="alert" className="flex shrink-0 items-center gap-2.5 border-b border-destructive/15 bg-destructive/[0.06] px-6 py-2 text-[13px] text-destructive">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        You are using the default admin password. Change it in{' '}
        <button type="button" onClick={() => navigate('/users')} className="font-semibold underline underline-offset-2">Users</button>{' '}
        to protect your data.
      </span>
    </div>
  );
}
