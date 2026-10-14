import { writeFileSync } from "node:fs";
const palettes = [
  ["#f9b54a", "#b35c1e"],
  ["#56caff", "#2038aa"],
  ["#ec5bd0", "#59115e"],
  ["#ff526a", "#7e1023"],
  ["#cedaf0", "#4d627d"],
  ["#23cfff", "#5a24b0"],
  ["#ffb83c", "#59401a"],
  ["#d8faff", "#415d6c"],
  ["#ff414a", "#66151f"],
  ["#d3edff", "#384c76"],
  ["#ffb7b3", "#7f3262"],
  ["#ff9cd3", "#71367d"],
  ["#b8ddf5", "#304750"],
  ["#3c86ff", "#153681"],
  ["#4eb6cf", "#372e72"],
  ["#ffcf66", "#765020"],
  ["#64bcff", "#234d8c"],
];
for (let i = 0; i < 17; i++) {
  const [light, dark] = palettes[i];
  let seed = i + 72;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let city = "";
  for (let x = 0; x < 1200; x += 24 + Math.floor(rnd() * 30)) {
    const w = 18 + rnd() * 35,
      h = 45 + rnd() * 220;
    city += `<rect x="${x}" y="${510 - h}" width="${w}" height="${h}" fill="#070b15"/>`;
    for (let y = 520 - h; y < 480; y += 14)
      if (rnd() > 0.3)
        city += `<rect x="${x + 6}" y="${y}" width="3" height="5" fill="${light}" opacity="${rnd() * 0.65}"/>`;
  }
  let stars = "";
  for (let s = 0; s < 70; s++)
    stars += `<circle cx="${rnd() * 1200}" cy="${rnd() * 450}" r="${rnd() * 1.5}" fill="${light}" opacity="${rnd() * 0.6}"/>`;
  writeFileSync(
    `public/media/art-${i}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#050912"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="a"><stop stop-color="${light}" stop-opacity=".45"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="#02050b"/></linearGradient></defs><rect width="1200" height="675" fill="url(#sky)"/><ellipse cx="780" cy="260" rx="400" ry="320" fill="url(#a)"/>${stars}<circle cx="${740 + (i % 3) * 45}" cy="260" r="${130 + (i % 4) * 10}" fill="#080c16" stroke="${light}" stroke-width="3"/><circle cx="${740 + (i % 3) * 45}" cy="260" r="${137 + (i % 4) * 10}" fill="none" stroke="${light}" stroke-opacity=".2" stroke-width="9"/><path d="M0 425L180 250 340 410 510 280 740 440 1000 290 1200 420V675H0Z" fill="#111424" opacity=".75"/>${city}<path d="M0 510H1200V675H0Z" fill="url(#floor)"/><path d="M640 510L220 675M760 510L1050 675M700 510L700 675" stroke="${light}" stroke-opacity=".25"/><path d="M0 555H1200M0 615H1200" stroke="${light}" stroke-opacity=".1"/><ellipse cx="720" cy="580" rx="75" ry="8" fill="#000" opacity=".7"/><path d="M710 438Q705 425 716 418Q734 414 736 432L733 450 748 502 740 537 731 531 732 576 721 576 718 537 713 577 703 577 705 524 696 520Z" fill="#03060b" stroke="${light}" stroke-opacity=".35"/><rect width="1200" height="675" fill="none" stroke="#ffffff08" stroke-width="2"/></svg>`,
  );
}
