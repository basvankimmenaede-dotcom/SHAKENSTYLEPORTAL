import UnifiedSidebar from './UnifiedSidebar';

export default function AppShell({
  children,
  role,
  admin = false,
  adminPreview = false,
  portalLabel,
  userLabel,
  canViewPortal = false,
  canViewPlanning = false,
  canViewBilling = false,
}: {
  children: React.ReactNode;
  role: 'admin' | 'warehouse' | 'customer';
  admin?: boolean;
  adminPreview?: boolean;
  portalLabel?: string;
  userLabel?: string | null;
  canViewPortal?: boolean;
  canViewPlanning?: boolean;
  canViewBilling?: boolean;
}) {
  const mode = admin ? 'admin' : 'portal';

  return (
    <div className="uiAppShell">
      <UnifiedSidebar
        mode={mode}
        role={role}
        userLabel={userLabel || portalLabel}
        canViewPortal={canViewPortal}
        canViewPlanning={canViewPlanning}
        canViewBilling={canViewBilling}
      />
      <div className="uiAppMain">
        {adminPreview ? (
          <div className="previewBanner uiPreviewBanner">Admin gebruikersweergave — je bekijkt nu het klantportaal.</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
