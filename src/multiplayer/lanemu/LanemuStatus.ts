export interface LanemuStatus {
  javaDetected: boolean;
  lanemuJarDetected: boolean;
  running: boolean;
  virtualIp?: string;
  adapterName?: string;
  accessFileLoaded?: boolean;
  error?: string;
  warning?: string;
}
