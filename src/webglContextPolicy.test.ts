import { describe, it, expect, afterEach, vi } from "vitest";
import type { DeviceCapabilities } from "./performance.js";
import {
  resolveWebGlPowerPreferenceForShell,
  installWebGlContextPolicy,
  __resetWebGlContextPolicyForTests,
} from "./webglContextPolicy.js";

function caps(partial: Partial<DeviceCapabilities>): Pick<DeviceCapabilities, "isLowSpec" | "isChromOS"> & Partial<DeviceCapabilities> {
  return {
    isLowSpec: false,
    isChromOS: false,
    ...partial,
  };
}

describe("resolveWebGlPowerPreferenceForShell", () => {
  it("performance mode always requests low-power", () => {
    expect(resolveWebGlPowerPreferenceForShell("performance", caps({ isLowSpec: false, isChromOS: false }))).toBe("low-power");
    expect(resolveWebGlPowerPreferenceForShell("performance", caps({ isLowSpec: true, isChromOS: true }))).toBe("low-power");
  });

  it("quality mode uses high-performance unless device is constrained", () => {
    expect(resolveWebGlPowerPreferenceForShell("quality", caps({ isLowSpec: false, isChromOS: false }))).toBe("high-performance");
    expect(resolveWebGlPowerPreferenceForShell("quality", caps({ isLowSpec: true, isChromOS: false }))).toBe("low-power");
    expect(resolveWebGlPowerPreferenceForShell("quality", caps({ isLowSpec: false, isChromOS: true }))).toBe("low-power");
  });

  it("auto defaults to low-power only on low-spec or Chrome OS", () => {
    expect(resolveWebGlPowerPreferenceForShell("auto", caps({ isLowSpec: false, isChromOS: false }))).toBe("default");
    expect(resolveWebGlPowerPreferenceForShell("auto", caps({ isLowSpec: true, isChromOS: false }))).toBe("low-power");
    expect(resolveWebGlPowerPreferenceForShell("auto", caps({ isLowSpec: false, isChromOS: true }))).toBe("low-power");
  });
});

describe("installWebGlContextPolicy", () => {
  afterEach(() => {
    __resetWebGlContextPolicyForTests();
    vi.restoreAllMocks();
  });

  it("applies GL policy to experimental-webgl the same as webgl2", () => {
    const glStub = {} as WebGLRenderingContext;
    const native = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((id: string) => {
        if (id === "experimental-webgl") return glStub;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext,
    );

    installWebGlContextPolicy(() => ({
      performanceMode: "performance",
      deviceCaps: { ...caps({}), tier: "medium" } as DeviceCapabilities,
    }));

    document.createElement("canvas").getContext("experimental-webgl");

    const last = native.mock.calls[native.mock.calls.length - 1] as unknown as [
      string,
      WebGLContextAttributes | undefined,
    ];
    expect(last[1]).toMatchObject({ powerPreference: "low-power" });
  });

  it("injects powerPreference for webgl2 when state says low-power", () => {
    const glStub = {} as WebGL2RenderingContext;
    const native = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((id: string, opts?: WebGLContextAttributes) => {
        void opts;
        if (id === "webgl2") return glStub;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext,
    );

    installWebGlContextPolicy(() => ({
      performanceMode: "performance",
      deviceCaps: { ...caps({}), tier: "medium" } as DeviceCapabilities,
    }));

    const canvas = document.createElement("canvas");
    canvas.getContext("webgl2");

    expect(native).toHaveBeenCalled();
    const last = native.mock.calls[native.mock.calls.length - 1] as unknown as [
      string,
      WebGLContextAttributes | undefined,
    ];
    expect(last[1]).toMatchObject({ powerPreference: "low-power" });
  });

  it("does not override caller-provided powerPreference", () => {
    const glStub = {} as WebGL2RenderingContext;
    const native = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((id: string) => {
        if (id === "webgl2") return glStub;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext,
    );

    installWebGlContextPolicy(() => ({
      performanceMode: "performance",
      deviceCaps: { ...caps({}), tier: "low" } as DeviceCapabilities,
    }));

    const canvas = document.createElement("canvas");
    canvas.getContext("webgl2", { powerPreference: "high-performance" });

    const last = native.mock.calls[native.mock.calls.length - 1] as unknown as [
      string,
      WebGLContextAttributes | undefined,
    ];
    expect(last[1]).toMatchObject({ powerPreference: "high-performance" });
  });

  it("merges preserveDrawingBuffer when policy requests it and caller omits it", () => {
    const glStub = {} as WebGL2RenderingContext;
    const native = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((id: string) => {
        if (id === "webgl2") return glStub;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext,
    );

    let forcePreserve = false;
    const uninstall = installWebGlContextPolicy(() => ({
      performanceMode: "performance",
      deviceCaps: { ...caps({}), tier: "medium" } as import("./performance.js").DeviceCapabilities,
      forcePreserveDrawingBuffer: forcePreserve,
    }));

    document.createElement("canvas").getContext("webgl2");
    let last = native.mock.calls[native.mock.calls.length - 1] as unknown as [
      string,
      WebGLContextAttributes | undefined,
    ];
    expect(last[1]?.preserveDrawingBuffer).toBeUndefined();

    forcePreserve = true;
    document.createElement("canvas").getContext("webgl2");
    last = native.mock.calls[native.mock.calls.length - 1] as unknown as [
      string,
      WebGLContextAttributes | undefined,
    ];
    expect(last[1]).toMatchObject({ preserveDrawingBuffer: true });

    uninstall();
  });

  it("does not force preserveDrawingBuffer when the caller sets it explicitly to false", () => {
    const glStub = {} as WebGL2RenderingContext;
    const native = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((id: string) => {
        if (id === "webgl2") return glStub;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext,
    );

    installWebGlContextPolicy(() => ({
      performanceMode: "performance",
      deviceCaps: { ...caps({}), tier: "medium" } as DeviceCapabilities,
      forcePreserveDrawingBuffer: true,
    }));

    document.createElement("canvas").getContext("webgl2", { preserveDrawingBuffer: false });

    const last = native.mock.calls[native.mock.calls.length - 1] as unknown as [
      string,
      WebGLContextAttributes | undefined,
    ];
    expect(last[1]).toMatchObject({ preserveDrawingBuffer: false });
  });

  it("is idempotent — second install does not nest wrappers", () => {
    const native = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((_id: string) => null) as typeof HTMLCanvasElement.prototype.getContext,
    );

    const u1 = installWebGlContextPolicy(() => ({
      performanceMode: "auto",
      deviceCaps: { ...caps({ isLowSpec: true }), tier: "low" } as DeviceCapabilities,
    }));
    const u2 = installWebGlContextPolicy(() => ({
      performanceMode: "auto",
      deviceCaps: { ...caps({ isLowSpec: true }), tier: "low" } as DeviceCapabilities,
    }));
    expect(u1).toBe(u2);

    document.createElement("canvas").getContext("webgl2");

    expect(native.mock.calls.length).toBe(1);
  });
});
