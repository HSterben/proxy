/**
 * Fill AppxManifest.xml for Forge maker-msix.
 * Declares the proxy:// protocol so Store builds can complete browser sign-in.
 *
 * Env (same as forge.config.js / desktop/.env):
 *   MSIX_PACKAGE_IDENTITY, MSIX_PUBLISHER, MSIX_PUBLISHER_DISPLAY_NAME
 *
 * Publisher must be the full CN=... string from Partner Center when submitting
 * to the Store (e.g. CN=A1B2C3D4-...).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function msixVersion(semver) {
  // Appx Identity Version must be A.B.C.D
  const parts = String(semver || "0.0.0")
    .split(/[.+-]/)
    .filter(Boolean)
    .map((p) => parseInt(p, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join(".");
}

const identity =
  process.env.MSIX_PACKAGE_IDENTITY ||
  process.env.MSIX_IDENTITY_NAME ||
  "PROXY.AI";
const publisherRaw = process.env.MSIX_PUBLISHER || "CN=PROXY";
const publisher = publisherRaw.startsWith("CN=")
  ? publisherRaw
  : `CN=${publisherRaw}`;
const publisherDisplay =
  process.env.MSIX_PUBLISHER_DISPLAY_NAME || "PROXY";

const replacements = {
  IdentityName: identity,
  ProcessorArchitecture: process.env.MSIX_ARCH || "x64",
  Version: msixVersion(pkg.version),
  Publisher: publisher,
  DisplayName: "PROXY AI",
  PublisherDisplayName: publisherDisplay,
  MinOSVersion: "10.0.19041.0",
  MaxOSVersionTested: "10.0.26100.0",
  AppExecutable: "proxy.exe",
  AppDisplayName: "PROXY AI",
  PackageDescription: "PROXY AI - chat assistant",
  PackageBackgroundColor: "transparent",
};

const templatePath = path.join(root, "assets", "msix", "AppxManifest.xml.in");
let xml = fs.readFileSync(templatePath, "utf8");
for (const [key, value] of Object.entries(replacements)) {
  xml = xml.replaceAll(`{{${key}}}`, String(value));
}

const outPath = path.join(root, "assets", "msix", "AppxManifest.xml");
fs.writeFileSync(outPath, xml, "utf8");
console.log("[msix] wrote", outPath);
console.log("[msix] identity=%s publisher=%s version=%s", identity, publisher, replacements.Version);
