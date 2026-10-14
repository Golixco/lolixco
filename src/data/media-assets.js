// Public files shared by the feed, brand components, and build-time audit.
export const mediaAssets = {
  posters: Array.from({ length: 17 }, (_, id) => `media/art-${id}.svg`),
  video: "media/motion-study.webm",
  wordmark: "brand/lolixco-wordmark-reference.png",
  icon: "brand/lolixco-icon-reference.png",
};

export const assetPaths = [
  ...mediaAssets.posters,
  mediaAssets.video,
  mediaAssets.wordmark,
  mediaAssets.icon,
];

export function assetUrl(path, base = "/") {
  return `${base.endsWith("/") ? base : `${base}/`}${path.replace(/^\/+/, "")}`;
}
