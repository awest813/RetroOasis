import { readFileSync, writeFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

function copyEmulatorDataPlugin(): Plugin {
  return {
    name: "copy-emulator-data",
    closeBundle() {
      const source = resolve("data");
      const target = resolve("dist", "data");
      if (!existsSync(source)) return;
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
      }
      cpSync(source, target, { recursive: true });
    },
  };
}

/**
 * Emit `dist/pwa-precache.json`: app shell + EmulatorJS loader infrastructure.
 *
 * Lazy chunks (modals, saves, archive WASM, cores) are cached at runtime on
 * first use — not at PWA install — to keep the install payload lightweight.
 */
function pwaPrecacheManifestPlugin(): Plugin {
  return {
    name: "pwa-precache-manifest",
    closeBundle() {
      const distDir = resolve("dist");
      const indexPath = resolve(distDir, "index.html");
      if (!existsSync(indexPath)) return;

      const urls = new Set<string>();
      const addShellAsset = (rel: string) => {
        if (!rel.startsWith("assets/index-")) return;
        urls.add(`./${rel}`);
      };

      const html = readFileSync(indexPath, "utf-8");

      for (const m of html.matchAll(/\b(?:src|href)="(\.\/assets\/index-[^"]+)"/g)) {
        addShellAsset(m[1]!.replace(/^\.\//, ""));
      }
      for (const m of html.matchAll(/\b(?:src|href)="\/(assets\/index-[^"]+)"/g)) {
        addShellAsset(m[1]!);
      }

      urls.add("./index.html");
      urls.add("./manifest.json");
      urls.add("./audio-processor.js");

      const dataDir = resolve(distDir, "data");
      const addDataFile = (rel: string) => {
        const p = `./data/${rel}`;
        if (existsSync(resolve(distDir, p.slice(2)))) urls.add(p);
      };
      if (existsSync(dataDir)) {
        addDataFile("loader.js");
        addDataFile("emulator.css");
        addDataFile("version.json");
        addDataFile("localization/en.json");
      }

      // Filing archive WASM is copied for runtime import flows but not precached.
      const filingWasm = resolve("node_modules/filing/dist/esm/wasm/archive.wasm");
      if (existsSync(filingWasm)) {
        cpSync(filingWasm, resolve(distDir, "assets", "filing-archive.wasm"));
      }

      const list = [...urls]
        .filter((u) => {
          if (u === "./index.html" || u === "./manifest.json" || u === "./audio-processor.js") return true;
          if (u.startsWith("./data/")) {
            const tail = u.slice("./data/".length);
            return tail.length > 0 && !tail.includes("..") && !tail.startsWith("/");
          }
          if (!u.startsWith("./assets/")) return false;
          const tail = u.slice("./assets/".length);
          return tail.startsWith("index-") && tail.length > 0 && !tail.includes("..");
        })
        .sort();
      writeFileSync(resolve(distDir, "pwa-precache.json"), `${JSON.stringify(list)}\n`, "utf-8");
      console.info(`[pwa-precache-manifest] ${list.length} shell URLs (lazy assets excluded)`);
    },
  };
}

function dev404Plugin(): Plugin {
  return {
    name: "dev-404-middleware",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url ? (req.url.split("?")[0] ?? "").split("#")[0] ?? "" : "";
        if (urlPath && (urlPath.startsWith("/data/") || urlPath.startsWith("/cores/"))) {
          const filePath = urlPath.startsWith("/cores/")
            ? resolve("public", urlPath.slice(1))
            : resolve(urlPath.slice(1));
          if (!existsSync(filePath)) {
            res.statusCode = 404;
            res.end("Not Found");
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  // Serve from repo root; Vite will pick up index.html automatically.
  root: ".",
  plugins: [
    dev404Plugin(),
    copyEmulatorDataPlugin(),
    pwaPrecacheManifestPlugin(),
    ...(process.env.ANALYZE
      ? [
          visualizer({
            filename: "dist/bundle-stats.html",
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],

  // Base public path for GitHub Pages deployment (https://<user>.github.io/WebPPSSPP/).
  // Has no effect during local `vite dev` because the dev server serves from /.
  base: "./",

  server: {
    port: 5173,
    // PPSSPP core requires SharedArrayBuffer, which is gated behind
    // Cross-Origin Isolation (COOP + COEP). The dev server sets these
    // headers directly; for static production deployments the included
    // coi-serviceworker.js injects them at the service-worker level.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  preview: {
    port: 4173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: ".vite/manifest.json",
    rollupOptions: {
      input: "index.html",
      output: {
        /**
         * Code splitting strategy (Phase 5):
         *
         * - core: emulator engine, system definitions, performance detection,
         *         game library, saves, BIOS — everything needed for the initial
         *         paint and first game launch.
         * - tools: archive extraction and ROM patching — lazily loaded only
         *          when the user drops a ZIP or patch file. Keeps the initial
         *          bundle ~15 KB smaller.
         * - touch: virtual gamepad overlay — lazily loaded only on first game
         *          start on a touch device.
         */
        manualChunks(id: string) {
          if (id.includes("/src/archive.") || id.includes("/src/patcher.")) {
            return "tools";
          }
          if (id.includes("/src/multiplayer.") || id.includes("/src/netplay/")) {
            return "multiplayer";
          }
          if (id.includes("/src/cloudSave.") || id.includes("/src/saveService.") || id.includes("/src/saves.")) {
            return "saves";
          }
          if (id.includes("/src/ui/modals.")) {
            return "modals";
          }
          if (id.includes("/src/ui/virtualGrid.")) {
            return "virtualgrid";
          }
          if (id.includes("/src/ui/highlightsPanel.")) {
            return "highlights";
          }
          if (id.includes("/src/compatibility.")) {
            return "compatibility";
          }
          if (id.includes("/src/performancePrimitives.")) {
            return "perf-primitives";
          }
        },
      },
    },
  },
});
