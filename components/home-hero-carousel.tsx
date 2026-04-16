import Image from "next/image";
import erickMoralesPlayingSoccer from "../public/home-hero/ErickMoralesPlayingSoccerAldrichSportsLongIslandNewYorkSoccerLandingPage.png";

export function HomeHeroCarousel() {
  return (
    <div className="home-hero__carousel" aria-hidden="true">
      <div className="home-hero__carousel-slide">
        <Image
          src={erickMoralesPlayingSoccer}
          alt=""
          fill
          priority
          sizes="100vw"
          className="home-hero__carousel-image"
        />
      </div>
    </div>
  );
}
