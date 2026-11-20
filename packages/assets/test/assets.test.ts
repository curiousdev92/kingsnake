import { describe, expect, it } from "vitest";
import { getSkinArt, manifest, resolveSrc } from "../src";

describe("manifest lookups", () => {
  it("returns undefined for missing skin art so callers fall back", () => {
    expect(getSkinArt("ember")).toBeUndefined();
    expect(manifest.skins).toEqual({});
  });
});

describe("resolveSrc", () => {
  const src = { 1: "a@1x.png", 2: "a@2x.png" };

  it("picks the scale for the pixel ratio", () => {
    expect(resolveSrc(src, 1)).toBe("a@1x.png");
    expect(resolveSrc(src, 1.5)).toBe("a@2x.png");
  });

  it("falls back to the nearest smaller scale", () => {
    expect(resolveSrc(src, 3)).toBe("a@2x.png");
  });

  it("passes plain strings through", () => {
    expect(resolveSrc("x.png", 2)).toBe("x.png");
  });
});
