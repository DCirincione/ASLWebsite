"use client";

import Image from "next/image";
import Link from "next/link";
import { CSSProperties, MouseEvent, useCallback, useEffect, useRef, useState } from "react";

import { AccountSignupForm } from "./account-signup-form";
import { AccountSigninForm } from "./account-signin-form";
import { canAccessAdminDashboard, isPartnerRole } from "@/lib/event-approval";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

const links = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/sports", label: "Sports" },
  { href: "/merch", label: "Merch" },
  { href: "/community", label: "Community" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<Profile["role"] | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(96);
  const headerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeAccountModal = useCallback(() => setIsAccountOpen(false), []);
  const openAccountModal = useCallback(() => {
    setAuthMode("signup");
    setIsAccountOpen(true);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const loadHeaderProfile = async (uid: string) => {
      const { data: profile } = await client
        .from("profiles")
        .select("avatar_url,role")
        .eq("id", uid)
        .maybeSingle();
      setAvatarUrl(profile?.avatar_url ?? null);
      setProfileRole((profile?.role as Profile["role"] | null | undefined) ?? null);
    };

    client.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      setIsAuthenticated(Boolean(session));
      if (session?.user?.id) {
        await loadHeaderProfile(session.user.id);
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      if (session?.user?.id) {
        void loadHeaderProfile(session.user.id);
      } else {
        setAvatarUrl(null);
        setProfileRole(null);
      }
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAccountOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAccountModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAccountModal, isAccountOpen]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileNavOpen]);

  useEffect(() => {
    const shouldLockPage = isAccountOpen || isMobileNavOpen;
    if (!shouldLockPage) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isAccountOpen, isMobileNavOpen]);

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeAccountModal();
    }
  };

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClick = (event: MouseEvent | globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900 && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobileNavOpen]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeaderHeight = () => {
      setHeaderHeight(Math.max(64, Math.ceil(header.getBoundingClientRect().height)));
    };

    updateHeaderHeight();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateHeaderHeight());
      observer.observe(header);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateHeaderHeight);
    return () => window.removeEventListener("resize", updateHeaderHeight);
  }, []);

  const canAccessAdmin = canAccessAdminDashboard(profileRole);
  const shouldShowPartnerSignup = !isPartnerRole(profileRole) && !canAccessAdmin;
  const navLinks = isPartnerRole(profileRole) ? [...links, { href: "/partner", label: "Partner Portal" }] : links;

  return (
    <>
      <header
        ref={headerRef}
        className="site-header"
        style={{ "--site-header-height": `${headerHeight}px` } as CSSProperties}
      >
        <div className="shell site-header__inner">
          <Link href="/" className="logo">
            <div className="logo__image logo__image--header" aria-hidden>
              <Image src="/ASLLogo.png" alt="ASL Logo" fill sizes="(max-width: 720px) 68px, 75px" priority />
            </div>
          </Link>
          <button
            className="mobile-nav-toggle"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={isMobileNavOpen}
            onClick={() => setIsMobileNavOpen((open) => !open)}
          >
            <span aria-hidden>{isMobileNavOpen ? "✕" : "☰"}</span>
          </button>
          <nav className={`nav ${isMobileNavOpen ? "nav--open" : ""}`} aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="nav__link"
                onClick={() => setIsMobileNavOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="nav__mobile-actions">
              {isAuthenticated ? (
                <>
                  <details className="nav__mobile-group">
                    <summary className="nav__link">
                      <span className="nav__mobile-caret" aria-hidden>
                        ›
                      </span>
                      <span>Profile</span>
                    </summary>
                    <div className="nav__mobile-submenu">
                      <Link href="/account#profile" className="nav__link nav__link--sub" onClick={() => setIsMobileNavOpen(false)}>
                        My Profile
                      </Link>
                      <Link href="/account/inbox" className="nav__link nav__link--sub" onClick={() => setIsMobileNavOpen(false)}>
                        Inbox
                      </Link>
                      <Link href="/account/settings" className="nav__link nav__link--sub" onClick={() => setIsMobileNavOpen(false)}>
                        Settings
                      </Link>
                      {shouldShowPartnerSignup ? (
                        <Link href="/partner" className="nav__link nav__link--sub" onClick={() => setIsMobileNavOpen(false)}>
                          Become a Partner
                        </Link>
                      ) : null}
                      {canAccessAdmin ? (
                        <Link href="/admin" className="nav__link nav__link--sub" onClick={() => setIsMobileNavOpen(false)}>
                          Admin Dashboard
                        </Link>
                      ) : null}
                    </div>
                  </details>
                </>
              ) : (
                <button className="button ghost" type="button" onClick={() => { setIsMobileNavOpen(false); openAccountModal(); }}>
                  Sign In / Create Account
                </button>
              )}
            </div>
          </nav>
          <div className="header-actions">
            {isAuthenticated ? (
              <div className="header-user" ref={menuRef}>
                <button
                  className="header-user__button"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                >
                  <span className="header-avatar">
                    <Image
                      src={avatarUrl || "/avatar-placeholder.svg"}
                      alt=""
                      fill
                      sizes="38px"
                      priority
                    />
                  </span>
                  <span className="header-user__chevron" aria-hidden>
                    ˅
                  </span>
                </button>
                {isMenuOpen ? (
                  <div className="header-menu" role="menu">
                    <Link href="/account#profile" role="menuitem" onClick={() => setIsMenuOpen(false)}>
                      My Profile
                    </Link>
                    <Link href="/account/inbox" role="menuitem" onClick={() => setIsMenuOpen(false)}>
                      Inbox
                    </Link>
                    {shouldShowPartnerSignup ? (
                      <Link href="/partner" role="menuitem" onClick={() => setIsMenuOpen(false)}>
                        Become a Partner
                      </Link>
                    ) : null}
                    {canAccessAdmin ? (
                      <Link href="/admin" role="menuitem" onClick={() => setIsMenuOpen(false)}>
                        Admin Dashboard
                      </Link>
                    ) : null}
                    <Link href="/account/settings" role="menuitem" onClick={() => setIsMenuOpen(false)}>
                      Settings
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <button className="button ghost" type="button" onClick={openAccountModal}>
                Create an Account
              </button>
            )}
          </div>
        </div>
      </header>

      {isAccountOpen ? (
        <div
          className="account-create-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-account-title"
          onClick={handleOverlayClick}
        >
          <div className="account-create-modal">
            <button
              className="account-create__close"
              type="button"
              aria-label="Close create account dialog"
              onClick={closeAccountModal}
            >
              X
            </button>
            <header className="account-create__header">
              <div>
                <p className="eyebrow">Account</p>
                <h1 id="create-account-title">
                  {authMode === "signup" ? "Create an Account" : "Sign In"}
                </h1>
                <p className="muted">
                  {authMode === "signup"
                    ? "Set up your profile so you can register teams, track stats, and connect with friends."
                    : "Sign in to access your account, manage teams, and track stats."}
                </p>
              </div>
              <div className="account-create__actions">
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}
                >
                  {authMode === "signup" ? "Already have an account? Sign in" : "New here? Create account"}
                </button>
                <button className="button ghost" type="button" onClick={closeAccountModal}>
                  Cancel
                </button>
              </div>
            </header>
            {authMode === "signup" ? (
              <AccountSignupForm onSuccess={closeAccountModal} />
            ) : (
              <AccountSigninForm onSuccess={closeAccountModal} />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
