import { Navigate } from 'react-router-dom';
import { isCloudConfigured } from '@/lib/offlineNoCloud';
import { CloudOff } from 'lucide-react';

/**
 * Guard for internet-only modules in the Offline build.
 * If the online modules are disabled — redirect to POS home and show a brief
 * inline notice if user lands here mid-render. Online build renders children.
 */
export default function OfflineBlocked({ children }: { children: React.ReactNode }) {
  if (!isCloudConfigured()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Static fallback (kept for completeness — Navigate handles the redirect). */
export function OfflineBlockedNotice() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <CloudOff className="h-10 w-10 text-muted-foreground mb-3" />
      <h2 className="text-lg font-bold">Module not available offline</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        This feature relies on internet / cloud and is disabled in the Offline Edition.
      </p>
    </div>
  );
}
