"use client";

import { FormEvent, useState } from "react";

type DonationCheckoutResponse = {
  checkoutUrl?: string;
  error?: string;
};

const DEFAULT_AMOUNT = "25.00";

export function CommunityDonationButton() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "error"; message?: string }>({ type: "idle" });

  const closeModal = () => {
    if (status.type === "loading") return;
    setOpen(false);
    setStatus({ type: "idle" });
  };

  const startCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: "loading", message: "Opening secure Square checkout..." });

    try {
      const response = await fetch("/api/community/donate/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount }),
      });
      const json = (await response.json().catch(() => null)) as DonationCheckoutResponse | null;

      if (!response.ok || !json?.checkoutUrl) {
        throw new Error(json?.error ?? "Could not start the donation checkout.");
      }

      window.location.assign(json.checkoutUrl);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not start the donation checkout.",
      });
    }
  };

  return (
    <>
      <button className="button primary community-donate-button" type="button" onClick={() => setOpen(true)}>
        Donate to Aldrich Sports
      </button>

      {open ? (
        <div className="community-donation-modal" role="presentation">
          <button
            className="community-donation-modal__backdrop"
            type="button"
            aria-label="Close donation amount form"
            onClick={closeModal}
          />
          <div
            className="community-donation-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-donation-title"
          >
            <div className="community-donation-modal__header">
              <div>
                <p className="community-donation-modal__eyebrow">Aldrich Sports</p>
                <h2 id="community-donation-title">Choose a donation amount</h2>
              </div>
              <button
                className="community-donation-modal__close"
                type="button"
                aria-label="Close donation amount form"
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <form className="community-donation-form" onSubmit={startCheckout}>
              <label htmlFor="community-donation-amount">Donation amount</label>
              <div className="community-donation-form__amount">
                <span>$</span>
                <input
                  id="community-donation-amount"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="10000"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={status.type === "loading"}
                  autoFocus
                  required
                />
              </div>

              {status.message ? (
                <p className={`community-donation-form__status community-donation-form__status--${status.type}`}>
                  {status.message}
                </p>
              ) : null}

              <div className="community-donation-form__actions">
                <button className="button ghost" type="button" onClick={closeModal} disabled={status.type === "loading"}>
                  Cancel
                </button>
                <button className="button primary" type="submit" disabled={status.type === "loading"}>
                  {status.type === "loading" ? "Opening Square..." : "Continue to Square"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
