"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";

type Bill = {
  id: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  tilt: number;
};

const SECRET_WORD = "moneyspread";
const MAX_BILLS = 180;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function createBill(x: number, y: number, id: number): Bill {
  return {
    id,
    x: x - 72 + (Math.random() - 0.5) * 28,
    y: y - 32 + (Math.random() - 0.5) * 22,
    rotation: Math.random() * 64 - 32,
    scale: 0.82 + Math.random() * 0.36,
    tilt: Math.random() * 8 - 4,
  };
}

export function MoneySpread() {
  const [isActive, setIsActive] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const nextIdRef = useRef(1);
  const lastDropRef = useRef(0);
  const logoClicksRef = useRef<number[]>([]);
  const typedRef = useRef("");

  useEffect(() => {
    const activate = () => setIsActive(true);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsActive(false);
        setIsDragging(false);
        return;
      }

      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      typedRef.current = `${typedRef.current}${event.key.toLowerCase()}`.slice(-SECRET_WORD.length);
      if (typedRef.current === SECRET_WORD) {
        activate();
        typedRef.current = "";
      }
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".logo")) {
        return;
      }

      const now = Date.now();
      logoClicksRef.current = [...logoClicksRef.current.filter((clickTime) => now - clickTime < 1800), now];
      if (logoClicksRef.current.length >= 5) {
        activate();
        logoClicksRef.current = [];
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  const addBill = (x: number, y: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastDropRef.current < 42) {
      return;
    }

    lastDropRef.current = now;
    const bill = createBill(x, y, nextIdRef.current);
    nextIdRef.current += 1;
    setBills((currentBills) => [...currentBills.slice(-(MAX_BILLS - 1)), bill]);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    addBill(event.clientX, event.clientY, true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) {
      return;
    }

    addBill(event.clientX, event.clientY);
  };

  const stopDragging = () => {
    setIsDragging(false);
  };

  if (!isActive) {
    return null;
  }

  return (
    <div
      className="money-spread"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      role="presentation"
    >
      <div className="money-spread__bills" aria-hidden>
        {bills.map((bill) => (
          <div
            className="money-bill"
            key={bill.id}
            style={{
              left: `${bill.x}px`,
              top: `${bill.y}px`,
              transform: `rotate(${bill.rotation}deg) skewY(${bill.tilt}deg) scale(${bill.scale})`,
            }}
          >
            <span className="money-bill__corner">100</span>
            <span className="money-bill__seal">$</span>
            <span className="money-bill__portrait">100</span>
            <span className="money-bill__corner money-bill__corner--right">100</span>
          </div>
        ))}
      </div>
      <div className="money-spread__controls">
        <button
          className="money-spread__control"
          type="button"
          aria-label="Clear money spread"
          title="Clear"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setBills([])}
        >
          $
        </button>
        <button
          className="money-spread__control"
          type="button"
          aria-label="Close money spread"
          title="Close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            setIsActive(false);
            setIsDragging(false);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
