"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { canAccessRefPortal } from "@/lib/event-approval";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

const quickLinks = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/sports", label: "Sports" },
  { href: "/community", label: "Community" },
];

const resources = [
  { href: "/contact", label: "Contact" },
  { href: "/partner", label: "Become a Partner" },
];

const socials = [
  { href: "https://www.instagram.com/aldrichsportsny/", label: "Instagram" },
  { href: "https://www.facebook.com/profile.php?id=61587240961647", label: "Facebook" },
];

export function SiteFooter() {
  const [profileRole, setProfileRole] = useState<Profile["role"] | null>(null);
  const footerResources = canAccessRefPortal(profileRole)
    ? [...resources, { href: "/ref-portal", label: "Ref Portal" }]
    : resources;

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const loadRole = async (uid: string) => {
      const { data: profile } = await client.from("profiles").select("role").eq("id", uid).maybeSingle();
      setProfileRole((profile?.role as Profile["role"] | null | undefined) ?? null);
    };

    client.auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (userId) {
        void loadRole(userId);
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id) {
        void loadRole(session.user.id);
      } else {
        setProfileRole(null);
      }
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

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
            <span className="sr-only">Aldrich Sports home</span>
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
              {footerResources.map((link) => (
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
