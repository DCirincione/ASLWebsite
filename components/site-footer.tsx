import Image from "next/image";
import Link from "next/link";

const quickLinks = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/leagues", label: "League" },
  { href: "/community", label: "Community" },
];

const resources = [
  { href: "/sponsors", label: "Sponsors" },
  { href: "/contact", label: "Contact" },
];

const socials = [
  { href: "https://instagram.com", label: "Instagram" },
  { href: "https://facebook.com", label: "Facebook" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div className="site-footer__brand">
          <Link href="/" className="logo">
            <div className="logo__image logo__image--footer" aria-hidden>
              <Image
                src="/ASLLogo.png"
                alt="ASL Logo"
                fill
                sizes="200px"
                priority
              />
            </div>
            <span className="sr-only">ASL Website home</span>
          </Link>
          <p className="muted">Community sports. Real competition. Local impact.</p>
        </div>
        <div className="site-footer__links">
          <div className="site-footer__column">
            <h4>Quick Links</h4>
            <ul>
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="site-footer__column">
            <h4>Resources</h4>
            <ul>
              {resources.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="site-footer__social">
          <h4>Follow Us</h4>
          <ul>
            {socials.map((social) => (
              <li key={social.href}>
                <Link href={social.href} target="_blank" rel="noreferrer">
                  {social.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
