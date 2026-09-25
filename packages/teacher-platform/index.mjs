// ESM 入口。
import cjs from './index.js';

export const {
    PLATFORM_REQUESTS,
    PLATFORM_EVENTS,
    PLATFORM_METHODS,
    PLATFORM_ERROR_CODES,
    ok,
    fail,
    runPlatformCall,
    ELECTRON_CHANNEL_PREFIX,
    createWebView2Adapter,
    createElectronAdapter,
    createNullAdapter,
    validateAdapter,
    withCapabilities
} = cjs;

export default cjs;
