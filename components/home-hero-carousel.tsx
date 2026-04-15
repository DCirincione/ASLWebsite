import Image from "next/image";
import newestHomePic from "../public/home-hero/newestHomePic.png";

export function HomeHeroCarousel() {
  return (
    <div className="home-hero__carousel" aria-hidden="true">
      <div className="home-hero__carousel-slide">
        <Image
          src={newestHomePic}
          alt=""
          priority
          sizes="100vw"
          className="home-hero__carousel-image"
        />
      </div>
    </div>
  );
}
