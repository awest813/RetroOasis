import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PwaManifest {
  theme_color: string;
  file_handlers: Array<{
    accept: Record<string, string[]>;
  }>;
  share_target: {
    params: {
      files: Array<{
        accept: string[];
      }>;
    };
  };
}

describe("PWA assets", () => {
  it("keeps share-target cache names aligned between app and service worker", () => {
    const mainSource = readFileSync("src/main.ts", "utf8");
    const serviceWorkerSource = readFileSync("public/coi-serviceworker.js", "utf8");

    expect(mainSource).toContain('"retro-oasis-shared-roms-v1"');
    expect(serviceWorkerSource).toContain('SHARE_TARGET_CACHE = "retro-oasis-shared-roms-v1"');
    expect(serviceWorkerSource).toContain('"retro-oasis-user-v1"');
  });

  it("registers install and share handlers for supported archive formats", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as PwaManifest;
    const accept = manifest.file_handlers[0]?.accept ?? {};
    const shareAccept = manifest.share_target.params.files[0]?.accept ?? [];

    expect(accept["application/x-7z-compressed"]).toContain(".7z");
    expect(accept["application/vnd.rar"]).toContain(".rar");
    expect(accept["application/x-rar-compressed"]).toContain(".rar");
    expect(accept["application/x-tar"]).toContain(".tar");
    expect(accept["application/gzip"]).toEqual(expect.arrayContaining([".gz", ".tgz"]));
    expect(shareAccept).toEqual(expect.arrayContaining([
      "application/zip",
      "application/x-7z-compressed",
      "application/vnd.rar",
      "application/x-tar",
      "application/gzip",
    ]));
  });

  it("keeps shell assets aligned across HTML, manifest, and service worker", () => {
    const indexHtml = readFileSync("index.html", "utf8");
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as PwaManifest;
    const serviceWorkerSource = readFileSync("public/coi-serviceworker.js", "utf8");

    expect(manifest.theme_color).toBe("#ff2e97");
    expect(indexHtml).toContain('<meta name="theme-color" content="#ff2e97" />');
    expect(indexHtml).toContain('<link rel="icon" type="image/x-icon" href="./favicon.ico" />');
    expect(serviceWorkerSource).toContain('"./favicon.ico"');
    expect(serviceWorkerSource).not.toContain('"./favicon-16x16.png"');
    expect(serviceWorkerSource).not.toContain('"./favicon-32x32.png"');
    expect(existsSync("public/favicon.ico")).toBe(true);
  });
});
