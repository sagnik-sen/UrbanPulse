import { useEffect } from "react";
import { useMap } from "react-leaflet";

// leaflet reads container size at mount; if layout settles a tick later
// (flex panels, dynamic vh heights) tiles render into the stale grid.
export default function MapReady() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t1 = setTimeout(fix, 0);
    const t2 = setTimeout(fix, 150);
    window.addEventListener("resize", fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}
