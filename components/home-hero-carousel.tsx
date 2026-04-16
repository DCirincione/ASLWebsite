import Image from "next/image";
import newestHomePic from "../public/home-hero/newestHomePic.png";

export function HomeHeroCarousel() {
  return (
    <div className="home-hero__carousel" aria-hidden="true">
      <div className="home-hero__carousel-slide">
        <Image
          src={newestHomePic}
          alt=""
          fill
          priority
          sizes="(max-width: 1366px) 100vw, 1366px"
          className="home-hero__carousel-image"
        />
      </div>
    </div>
  );
}
