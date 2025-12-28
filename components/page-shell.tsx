import { ReactNode } from "react";

import { SiteHeader } from "./site-header";

type PageShellProps = {
  children: ReactNode;
};

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell">
      <SiteHeader />
      <main className="page-content">
        <div className="shell">{children}</div>
      </main>
      <footer className="site-footer">
        <div className="shell">
          <p>Built with Next.js App Router and ready for your ASL site.</p>
        </div>
      </footer>
    </div>
  );
}
