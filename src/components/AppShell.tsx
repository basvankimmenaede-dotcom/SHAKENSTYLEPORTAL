import UnifiedSidebar from './UnifiedSidebar';

export default function AppShell({
  children,
  admin = false,
  adminPreview = false,
  portalLabel,
  userLabel,
}: {
  children: React.ReactNode;
  admin?: boolean;
  adminPreview?: boolean;
  portalLabel?: string;
  userLabel?: string | null;
}) {
  const mode = admin ? 'admin' : 'portal';

  return (
    <div className="uiAppShell">
      <UnifiedSidebar mode={mode} userLabel={userLabel || portalLabel} canViewPortal />
      <div className="uiAppMain">
        {adminPreview ? (
          <div className="previewBanner uiPreviewBanner">Admin gebruikersweergave — je bekijkt nu het klantportaal.</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
