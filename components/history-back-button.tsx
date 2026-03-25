"use client";

import { useRouter } from "next/navigation";

type HistoryBackButtonProps = {
  className?: string;
  fallbackHref?: string;
  label: string;
};

export function HistoryBackButton({
  className = "button ghost",
  fallbackHref = "/",
  label,
}: HistoryBackButtonProps) {
  const router = useRouter();

  return (
    <button
      className={className}
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
    >
      {label}
    </button>
  );
}
