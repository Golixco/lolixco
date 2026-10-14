import { mediaAssets, assetUrl } from "../../data/media-assets.js";
export function BrandLogo({ onHome }: { onHome: () => void }) {
  return (
    <a
      className="brand"
      href="#main"
      onClick={onHome}
      aria-label="Lolixco home"
    >
      <img
        src={assetUrl(mediaAssets.wordmark, import.meta.env.BASE_URL)}
        alt="Lolixco"
      />
    </a>
  );
}
export function BrandIcon() {
  return (
    <img
      className="brand-icon"
      src={assetUrl(mediaAssets.icon, import.meta.env.BASE_URL)}
      alt="Lolixco"
    />
  );
}
