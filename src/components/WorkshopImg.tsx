/** A workshop picture (lib/puppet/workshop.ts workshopPic): fetched with the app's pass. */
import { useEffect, useState } from "react";
import { workshopPic } from "../lib/puppet/workshop";

export function WorkshopImg({ slug, file, className }: { slug: string; file: string; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void workshopPic(slug, file).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [slug, file]);
  return src ? <img src={src} alt="" className={className} /> : <div className={className} />;
}
