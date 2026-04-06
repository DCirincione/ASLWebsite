"use client";

import Image from "next/image";
import { startTransition, useEffect, useState } from "react";

import fundraisersSlide from "../public/home-hero/Aldrich Sports Fundraisers.png";
import homePageSlide from "../public/home-hero/Aldrich Sports Home Page.png";
import leaguesSlide from "../public/home-hero/Aldrich Sports Leagues.png";
import moreSlide from "../public/home-hero/Aldrich Sports More.png";
import tournamentsSlide from "../public/home-hero/Aldrich Sports Tournaments.png";

const HOME_HERO_SLIDES = [
  homePageSlide,
  leaguesSlide,
  tournamentsSlide,
  fundraisersSlide,
  moreSlide,
] as const;

const AUTOPLAY_DELAY_MS = 7000;

export function HomeHeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      startTransition(() => {
        setActiveIndex((currentIndex) => (currentIndex + 1) % HOME_HERO_SLIDES.length);
      });
    }, AUTOPLAY_DELAY_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="home-hero__carousel" aria-hidden="true">
      <div
        className="home-hero__carousel-track"
        style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
      >
        {HOME_HERO_SLIDES.map((src, index) => (
          <div className="home-hero__carousel-slide" key={src.src}>
            <Image
              src={src}
              alt=""
              fill
              priority={index === 0}
              sizes="100vw"
              className="home-hero__carousel-image"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
