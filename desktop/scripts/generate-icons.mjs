/**
 * Build Proxy-Icon-Light.png / .icns / .ico for Electron packager + tray.
 * Prefer a high-res PNG source; falls back to the MSIX square logo.
 *
 *   npm run generate-icons --prefix desktop
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import png2icons from "png2icons";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, "..", "assets", "icons");
const sources = [
  path.join(iconsDir, "Proxy-Icon-Light.png"),
  path.join(__dirname, "..", "assets", "msix", "Square150x150Logo.scale-200.png"),
  path.join(__dirname, "..", "assets", "msix", "icon.png"),
];

const source = sources.find((p) => fs.existsSync(p));
if (!source) {
  console.error("No PNG source found for icon generation.");
  process.exit(1);
}

fs.mkdirSync(iconsDir, { recursive: true });
const input = fs.readFileSync(source);
const outPng = path.join(iconsDir, "Proxy-Icon-Light.png");
if (path.resolve(source) !== path.resolve(outPng)) {
  fs.copyFileSync(source, outPng);
}

const icns = png2icons.createICNS(input, png2icons.BILINEAR, 0);
if (!icns) {
  console.error("Failed to create .icns");
  process.exit(1);
}
fs.writeFileSync(path.join(iconsDir, "Proxy-Icon-Light.icns"), icns);

const ico = png2icons.createICO(input, png2icons.BILINEAR, 0, false);
if (!ico) {
  console.error("Failed to create .ico");
  process.exit(1);
}
fs.writeFileSync(path.join(iconsDir, "Proxy-Icon-Light.ico"), ico);

console.log("Wrote icons to", iconsDir);
console.log("  from", source);
console.log("  icns", icns.length, "bytes; ico", ico.length, "bytes");
