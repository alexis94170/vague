const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT = path.join(__dirname, "..", "public");

// Base icon — gradient indigo→violet with wave
function svg(size, rounded) {
  const r = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  <path d="M${size * 0.16} ${size * 0.52}c${size * 0.08}-${size * 0.16} ${size * 0.18}-${size * 0.16} ${size * 0.26} 0s${size * 0.18} ${size * 0.16} ${size * 0.26} 0 ${size * 0.15}-${size * 0.16} ${size * 0.14}-${size * 0.16}" fill="none" stroke="white" stroke-width="${size * 0.082}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

// Maskable icon — safe zone inset (80% center), solid background
function svgMaskable(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
  <path d="M${size * 0.22} ${size * 0.52}c${size * 0.064}-${size * 0.128} ${size * 0.144}-${size * 0.128} ${size * 0.208} 0s${size * 0.144} ${size * 0.128} ${size * 0.208} 0 ${size * 0.12}-${size * 0.128} ${size * 0.112}-${size * 0.128}" fill="none" stroke="white" stroke-width="${size * 0.065}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

async function main() {
  const targets = [
    { name: "icon-192.png", size: 192, maskable: false },
    { name: "icon-512.png", size: 512, maskable: false },
    { name: "icon-maskable-512.png", size: 512, maskable: true },
    { name: "apple-icon.png", size: 180, maskable: false },
    { name: "apple-icon-167.png", size: 167, maskable: false },
    { name: "apple-icon-152.png", size: 152, maskable: false },
    { name: "favicon-32.png", size: 32, maskable: false },
    { name: "favicon-16.png", size: 16, maskable: false },
  ];

  for (const t of targets) {
    const source = t.maskable ? svgMaskable(t.size) : svg(t.size, true);
    const out = path.join(OUT, t.name);
    await sharp(Buffer.from(source)).png().toFile(out);
    console.log(`✓ ${t.name} (${t.size}×${t.size})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
