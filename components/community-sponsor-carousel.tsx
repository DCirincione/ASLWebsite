"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function CommunitySponsorCarousel({ children, count }: { children: ReactNode; count: number }) {
  const track = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState({ start: true, end: false });
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () => setPosition({ start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [count]);
  const move = (direction: number) => {
    const element = track.current;
    const card = element?.firstElementChild;
    if (!element || !card) return;
    element.scrollBy({ left: direction * (card.getBoundingClientRect().width + 12), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div className={`community-sponsors-carousel ${count > 2 ? "community-sponsors-carousel--scrollable" : ""}`} aria-label="More community sponsors">
    <div className="community-sponsors-carousel__viewport"><div id={id} ref={track} className="community-sponsors-carousel__track" tabIndex={0} role="region" aria-label="Sponsor cards">{children}</div></div>
    {count > 1 && <div className="community-sponsors-carousel__mobile-controls"><span>Swipe to browse sponsors</span><div><button type="button" className="button ghost" aria-label="Previous sponsor" aria-controls={id} disabled={position.start} onClick={() => move(-1)}>←</button><button type="button" className="button ghost" aria-label="Next sponsor" aria-controls={id} disabled={position.end} onClick={() => move(1)}>→</button></div></div>}
    {count > 2 && <div className="community-sponsors-carousel__cue" aria-hidden="true"><span className="community-sponsors-carousel__cue-arrow">↑</span><span className="community-sponsors-carousel__cue-line" /><span className="community-sponsors-carousel__cue-text">Scroll</span><span className="community-sponsors-carousel__cue-line" /><span className="community-sponsors-carousel__cue-arrow">↓</span></div>}
  </div>;
}
