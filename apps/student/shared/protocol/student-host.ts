// 学生端原生桥类型现在来自共享契约 @lumesync/native-contract。
// 保留本文件是为了维持 `shared/protocol/student-host` 这个既有引用路径，
// 并集中声明 window 上的桥对象与协议全局。
export type {
  ClassStartOptions,
  BridgeEventMessage,
  BridgeMessage,
  BridgeRpcMessage,
  BridgeRpcResult,
  NativeActionRisk,
  NativeActionSpec,
  PowerControlResult,
  SaveAutostartResult,
  StudentConfig,
  StudentDeviceInfo,
  StudentHostApi,
  StudentSession,
  VerifyPasswordResult
} from "@lumesync/native-contract";

import type { StudentHostApi } from "@lumesync/native-contract";

declare global {
  interface Window {
    studentHost: StudentHostApi;
    electronAPI?: Partial<StudentHostApi>;
    /** 由服务端生成的 /protocol-client.js 注入；缺失时按 legacy 客户端处理。 */
    LumeSyncProtocol?: {
      protocolVersion: number;
      supportedVersions: number[];
      handshake: { client: string; accepted: string; rejected: string; snapshot: string };
    };
    __LumeSyncIdentity?: {
      role: "viewer";
      token: string;
      clientId: string;
      protocolVersion?: number;
    };
  }
}

export {};
