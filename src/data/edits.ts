import { mediaAssets, assetUrl } from "./media-assets.js";

import type { ContentFormat } from "../types/content";

export type Edit = {
  id: number;
  title: string;
  category: string;
  tags: string[];
  description: string;
  creator: string;
  poster: string;
  source: string;
  duration: string;
  trending: boolean;
  format?: ContentFormat;
  fandomIds?: string[];
};
const titles = [
  "Into the Light",
  "Echoes of Tomorrow",
  "Fragments",
  "Red Horizon",
  "Silent World",
  "Neon Soul",
  "Broken Crowns",
  "Liminal",
  "Darkest Days",
  "Reflections",
  "Chasing Heaven",
  "Afterglow",
  "Cold Hearts",
  "Parallel",
  "Lost Signal",
  "Radiant",
  "Midnight City",
];
const categories = [
  "Cinematic",
  "Gaming",
  "Anime",
  "Movies",
  "Series",
  "Phonk",
];
export const edits: Edit[] = titles.map((title, id) => ({
  id,
  title,
  category: categories[id % 6],
  tags: [
    categories[id % 6].toLowerCase(),
    "original",
    "demo",
    id % 2 ? "neon" : "landscape",
  ],
  description:
    "Original geometric artwork. Silent motion study for player testing; not finished creator footage.",
  creator: "Lolixco demo",
  poster: assetUrl(mediaAssets.posters[id], import.meta.env?.BASE_URL ?? "/"),
  source: assetUrl(mediaAssets.video, import.meta.env?.BASE_URL ?? "/"),
  duration: "0:12",
  trending: id > 10,
}));
export const categoriesList = [
  "Featured",
  "Trending",
  "Anime",
  "Movies",
  "Series",
  "Gaming",
  "Phonk",
  "Cinematic",
  "New",
];
