// Screenshot build only: the licence check is skipped so the guide can show
// every screen without a licence key bound to this computer. The real
// activation screen is captured separately from the normal build.
import type { ReactNode } from 'react';
export default function LicenseGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
