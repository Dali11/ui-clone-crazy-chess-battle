"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ratio-aware creative renderer for direct-ad slots and previews.
 *
 * Advertisers are told to upload 16:9 or 1:1 creatives; this component
 * makes both fit cleanly:
 *  - wide creatives (ratio >= 1.3) fill a 16:9 window with object-cover
 *  - square creatives render centered as 1:1 (never stretched or cropped)
 *  - until the natural size is known the image letterboxes inside 16:9
 */
export default function CreativeImage({
  src,
  alt,
  rounded = "",
}: {
  src: string;
  alt: string;
  rounded?: string;
}) {
  const [shape, setShape] = useState<"unknown" | "wide" | "square">("unknown");
  const ref = useRef<HTMLImageElement>(null);

  // Read natural dimensions once the image is available (covers the
  // already-cached case where onLoad never fires).
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth && img.naturalHeight) {
      setShape(img.naturalWidth / img.naturalHeight < 1.3 ? "square" : "wide");
    }
  }, [src]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setShape(img.naturalWidth / img.naturalHeight < 1.3 ? "square" : "wide");
    }
  };

  if (shape === "square") {
    return (
      <div className="w-full flex justify-center bg-ccb-bg/60 py-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={ref}
          src={src}
          alt={alt}
          onLoad={onImgLoad}
          className={`max-h-28 w-auto h-auto object-contain ${rounded ? `${rounded}-sm` : ""}`}
        />
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-ccb-bg/60 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={onImgLoad}
        className={`w-full h-full ${shape === "wide" ? "object-cover" : "object-contain"}`}
      />
    </div>
  );
}
