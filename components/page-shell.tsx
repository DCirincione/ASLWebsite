import { ReactNode } from "react";

import { AccessibilityControls } from "./accessibility-controls";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

type PageShellProps = {
  children: ReactNode;
};

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell">
      <AccessibilityControls />
      <SiteHeader />
      <main className="page-content">
        <div className="shell">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
