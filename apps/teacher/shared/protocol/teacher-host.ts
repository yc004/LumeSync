// 教师端原生桥类型现在来自共享契约 @lumesync/native-contract。
// 保留本文件是为了维持 `shared/protocol/teacher-host` 这个既有引用路径，
// 并集中声明 window 上的桥对象、协议全局与教师页面使用的身份对象。
export type {
  BridgeEventMessage,
  BridgeMessage,
  BridgeRpcMessage,
  BridgeRpcResult,
  NativeActionRisk,
  NativeActionSpec,
  TeacherConfig,
  TeacherHostApi,
  TeacherSession,
  TeacherWindowSettings,
  VerifyPasswordResult
} from "@lumesync/native-contract";

import type { TeacherHostApi } from "@lumesync/native-contract";

declare global {
  interface Window {
    teacherHost?: TeacherHostApi;
    electronAPI?: Partial<TeacherHostApi>;
    /** 由服务端生成的 /protocol-client.js 注入；缺失时按 legacy 客户端处理。 */
    LumeSyncProtocol?: {
      protocolVersion: number;
      supportedVersions: number[];
      handshake: { client: string; accepted: string; rejected: string; snapshot: string };
      inboundEvents: Array<{ name: string; roles: string[]; status: string }>;
    };
    /** 同源 /api/ 请求的凭证包装器，由 teacher-shell 的 api-fetch 安装。 */
    __LumeSyncApiFetch?: typeof fetch;
    __LumeSyncFetchInstalled?: boolean;
    /** 服务端权威课堂状态代次，由 session:accepted / classroom:snapshot 记录。 */
    __LumeSyncSessionId?: string;
    __LumeSyncRevision?: number;
    __LumeSyncIdentity?: {
      role: "host" | "viewer";
      token: string;
      clientId: string;
      protocolVersion?: number;
    };
  }
}

export {};
