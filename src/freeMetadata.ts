/**
 * freeMetadata.ts — no-key metadata fallbacks.
 *
 * Uses Wikipedia's public API to enrich game detail pages when the user has
 * not configured IGDB. This keeps metadata useful out of the box while the
 * API-key providers remain available for richer structured fields.
 */

import { normalizeRomName } from "./coverArt.js";
import type { IGDBMetadata } from "./types/metadata.js";

interface WikipediaQueryResponse {
  query?: {
    pages?: Record<string, {
      title?: string;
      extract?: string;
      pageid?: number;
      missing?: string;
      thumbnail?: { source?: string };
    }>;
  };
}

export interface WikipediaGamePage {
  title: string;
  summary: string;
  pageUrl: string;
  thumbnailUrl?: string;
}

/** Build a canonical English Wikipedia article URL from an article title. */
export function wikipediaArticleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export class WikipediaMetadataClient {
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { fetchImpl?: typeof fetch } = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async searchGame(name: string, opts: { signal?: AbortSignal } = {}): Promise<IGDBMetadata | null> {
    if (opts.signal?.aborted) return null;
    const normQuery = normalizeRomName(name);
    if (!normQuery) return null;

    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `${normQuery} video game`,
      gsrlimit: "4",
      prop: "extracts",
      exintro: "1",
      explaintext: "1",
      redirects: "1",
      format: "json",
      origin: "*",
    });

    try {
      const resp = await this.fetchImpl(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
        signal: opts.signal,
      });
      if (!resp.ok) return null;
      const body = (await resp.json()) as WikipediaQueryResponse;
      const pages = Object.values(body.query?.pages ?? {});
      const best = pages
        .map((page) => {
          const title = typeof page.title === "string" ? page.title : "";
          const summary = typeof page.extract === "string" ? page.extract.trim() : "";
          const titleScore = normalizeRomName(title) === normQuery ? 1 : 0;
          const gameScore = /video game|arcade game|console game/i.test(summary) ? 0.2 : 0;
          return { title, summary, score: titleScore + gameScore };
        })
        .filter((page) => page.title && page.summary)
        .sort((a, b) => b.score - a.score)[0];

      if (!best) return null;
      return { summary: best.summary };
    } catch {
      return null;
    }
  }

  /** Fetch summary and thumbnail for a known Wikipedia article title. */
  async fetchGameByTitle(
    title: string,
    opts: { signal?: AbortSignal } = {},
  ): Promise<WikipediaGamePage | null> {
    if (opts.signal?.aborted || !title.trim()) return null;

    const params = new URLSearchParams({
      action: "query",
      titles: title.trim(),
      prop: "extracts|pageimages",
      piprop: "thumbnail",
      pithumbsize: "240",
      exintro: "1",
      explaintext: "1",
      redirects: "1",
      format: "json",
      origin: "*",
    });

    try {
      const resp = await this.fetchImpl(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
        signal: opts.signal,
      });
      if (!resp.ok) return null;
      const body = (await resp.json()) as WikipediaQueryResponse;
      const page = Object.values(body.query?.pages ?? {}).find((p) => !p.missing && p.title);
      if (!page?.title) return null;
      const summary = typeof page.extract === "string" ? page.extract.trim() : "";
      if (!summary) return null;
      return {
        title: page.title,
        summary,
        pageUrl: wikipediaArticleUrl(page.title),
        thumbnailUrl: page.thumbnail?.source,
      };
    } catch {
      return null;
    }
  }
}
