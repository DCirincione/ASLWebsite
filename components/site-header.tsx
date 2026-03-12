"use client";

import Image from "next/image";
import Link from "next/link";
import { MouseEvent, useCallback, useEffect, useRef, useState } from "react";

import { AccountSignupForm } from "./account-signup-form";
import { AccountSigninForm } from "./account-signin-form";
import { supabase } from "@/lib/supabase/client";

const links = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/sports", label: "Sports" },
  { href: "/community", label: "Community" },
  { href: "/contact", label: "Contact" },
  { href: "/register", label: "Register" },
];

export function SiteHeader() {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
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
      setProfileRole(profile?.role ?? null);
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeAccountModal, isAccountOpen]);

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

  const canAccessAdmin = profileRole === "admin" || profileRole === "owner";

  return (
    <>
      <header className="site-header">
        <div className="shell site-header__inner">
          <Link href="/" className="logo">
            <Image src="/ASLLogo.png" alt="ASL Logo" width={75} height={75} />
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
            {links.map((link) => (
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
                  <Link href="/account" className="nav__link" onClick={() => setIsMobileNavOpen(false)}>
                    Account
                  </Link>
                  <Link href="/account#events" className="nav__link" onClick={() => setIsMobileNavOpen(false)}>
                    My Events
                  </Link>
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
                    {canAccessAdmin ? (
                      <Link href="/admin" role="menuitem" onClick={() => setIsMenuOpen(false)}>
                        Admin Dashboard
                      </Link>
                    ) : null}
                    <Link href="/account#settings" role="menuitem" onClick={() => setIsMenuOpen(false)}>
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
