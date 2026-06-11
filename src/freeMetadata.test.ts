import { describe, expect, it } from "vitest";
import { WikipediaMetadataClient } from "./freeMetadata.js";

describe("WikipediaMetadataClient", () => {
  it("returns no-key summary metadata for likely game pages", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("origin=*");
      expect(url).toContain("generator=search");
      return new Response(JSON.stringify({
        query: {
          pages: {
            "1": {
              title: "Portal",
              extract: "Portal is a puzzle-platform video game developed by Valve.",
            },
          },
        },
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const data = await new WikipediaMetadataClient({ fetchImpl }).searchGame("Portal.iso");
    expect(data?.summary).toContain("puzzle-platform video game");
  });

  it("returns null on network failures", async () => {
    const fetchImpl = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(new WikipediaMetadataClient({ fetchImpl }).searchGame("Portal")).resolves.toBeNull();
  });

  it("fetchGameByTitle loads summary and thumbnail for a known article", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toMatch(/titles=Super(\+|%20)Mario(\+|%20)Bros\./);
      return new Response(JSON.stringify({
        query: {
          pages: {
            "42": {
              title: "Super Mario Bros.",
              extract: "Super Mario Bros. is a platform game published by Nintendo.",
              thumbnail: { source: "https://upload.wikimedia.org/thumb.jpg" },
            },
          },
        },
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const page = await new WikipediaMetadataClient({ fetchImpl }).fetchGameByTitle("Super Mario Bros.");
    expect(page?.summary).toContain("platform game");
    expect(page?.thumbnailUrl).toContain("wikimedia.org");
    expect(page?.pageUrl).toContain("Super_Mario_Bros.");
  });
});
