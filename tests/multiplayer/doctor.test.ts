import { describe, it, expect, vi, beforeEach } from "vitest";
import { LanemuConnectionDoctor } from "../../src/multiplayer/lanemu/LanemuConnectionDoctor";
import { LanemuService } from "../../src/multiplayer/lanemu/LanemuService";

describe("LanemuConnectionDoctor", () => {
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getStatus: vi.fn().mockResolvedValue({
        javaDetected: true,
        lanemuJarDetected: true,
        running: true,
        virtualIp: "10.6.10.10",
        accessFileLoaded: true
      })
    };
  });

  it("should report pass for all checks when service is healthy", async () => {
    const doctor = new LanemuConnectionDoctor(mockService);
    const results = await doctor.runChecks({ roomId: "test-room" });

    const failed = results.filter(r => r.status === "fail");
    expect(failed.length).toBe(0);
    
    const vip = results.find(r => r.id === "vip");
    expect(vip?.message).toContain("10.6.10.10");
  });

  it("should report failure when LANemu is not running", async () => {
    mockService.getStatus.mockResolvedValue({
      javaDetected: true,
      lanemuJarDetected: true,
      running: false,
    });

    const doctor = new LanemuConnectionDoctor(mockService);
    const results = await doctor.runChecks({ roomId: "test-room" });

    const running = results.find(r => r.id === "running");
    expect(running?.status).toBe("fail");
    expect(running?.fix).toContain("Start LANemu");
  });
});
