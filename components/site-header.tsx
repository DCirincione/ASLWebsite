import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/leagues", label: "Leagues" },
  { href: "/community", label: "Community" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link href="/" className="logo">
          <Image src="/ASLLogo.png" alt="ASL Logo" width={75} height={75} />
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="nav__link">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link className="button ghost" href="/account">
            Create an Account
          </Link>
          <Link className="button primary" href="/register">
            Register
          </Link>
        </div>
      </div>
    </header>
  );
}
