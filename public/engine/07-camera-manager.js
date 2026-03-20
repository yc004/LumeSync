// ========================================================
// CameraManager — 引擎层摄像头单例
// 负责：设备枚举、流获取（含 VCam fallback）、设备切换
// 课件只需调用 window.CourseGlobalContext.getCamera(onStream)
// 引擎会在画面上叠加摄像头选择器，用户可随时切换设备
// ========================================================
window.CameraManager = (() => {
    const STORAGE_KEY = 'syncclassroom_camera_deviceid';

    let _stream = null;
    let _deviceId = localStorage.getItem(STORAGE_KEY) || null; // 读取上次选择
    let _devices = [];             // 已枚举的视频设备列表
    let _acquiring = null;         // 正在进行的获取 Promise
    let _streamCallbacks = [];     // 课件注册的 onStream 回调

    // 通知所有课件新的 stream
    const _notify = (stream) => {
        _streamCallbacks.forEach(cb => { try { cb(stream); } catch(e) {} });
    };

    // 枚举设备（获取 stream 后标签才可见）
    const _enumerate = async () => {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            _devices = all.filter(d => d.kind === 'videoinput');
        } catch(e) {
            _devices = [];
        }
        return _devices;
    };

    // 用指定 deviceId 获取流（null = 默认）
    const _openDevice = async (deviceId) => {
        const constraint = deviceId
            ? { video: { deviceId: { exact: deviceId } }, audio: false }
            : { video: true, audio: false };
        return await navigator.mediaDevices.getUserMedia(constraint);
    };

    // 核心获取逻辑：先试默认，失败后枚举逐个尝试（VCam fallback）
    const _acquire = async (preferDeviceId) => {
        // 先试指定/默认设备
        try {
            const s = await _openDevice(preferDeviceId || null);
            _enumerate(); // 不 await，后台枚举更新标签，不阻塞流返回
            return s;
        } catch (e) {
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'NotFoundError') {
                throw e;
            }
            console.warn('[CameraManager] default failed (' + e.name + '), trying all devices...');
        }

        await new Promise(r => setTimeout(r, 500));
        await _enumerate();

        for (const device of _devices) {
            if (device.deviceId === preferDeviceId) continue; // 已经试过了
            try {
                const s = await _openDevice(device.deviceId);
                console.log('[CameraManager] fallback OK: ' + (device.label || device.deviceId.slice(0, 20)));
                _deviceId = device.deviceId;
                return s;
            } catch (e2) {
                console.warn('[CameraManager] skip ' + (device.label || device.deviceId.slice(0, 20)) + ': ' + e2.name);
                await new Promise(r => setTimeout(r, 300));
            }
        }
        throw new Error('[CameraManager] No working camera found');
    };

    // 停止当前流
    const _stopCurrent = () => {
        if (_stream) {
            _stream.getTracks().forEach(t => t.stop());
            _stream = null;
        }
    };

    return {
        // 课件调用：注册 onStream 回调，立即返回当前 stream（或等待获取）
        // onStream(stream) 会在首次获取成功和每次切换设备后被调用
        getStream: async (onStream) => {
            if (onStream) {
                _streamCallbacks.push(onStream);
                // 如果已有活跃流，立即回调
                if (_stream && _stream.active) {
                    try { onStream(_stream); } catch(e) {}
                    return _stream;
                }
            }

            if (_stream && _stream.active) return _stream;
            if (_acquiring) return _acquiring;

            _acquiring = _acquire(_deviceId).then(s => {
                _stream = s;
                _acquiring = null;
                _notify(s);
                return s;
            }).catch(e => {
                _acquiring = null;
                throw e;
            });
            return _acquiring;
        },

        // 切换到指定设备（快速路径：不走 fallback，不重新枚举）
        switchDevice: async (deviceId) => {
            if (deviceId === _deviceId && _stream && _stream.active) return _stream;
            _stopCurrent();
            _deviceId = deviceId;
            _acquiring = _openDevice(deviceId).then(s => {
                _stream = s;
                _acquiring = null;
                localStorage.setItem(STORAGE_KEY, deviceId); // 记住选择
                _notify(s);
                return s;
            }).catch(e => {
                _acquiring = null;
                throw e;
            });
            return _acquiring;
        },

        // 课件卸载时注销回调（不停止流）
        unregister: (onStream) => {
            _streamCallbacks = _streamCallbacks.filter(cb => cb !== onStream);
        },

        // 课程结束时释放
        release: () => {
            _stopCurrent();
            _acquiring = null;
            _streamCallbacks = [];
            // _deviceId 保留，下次进入摄像头页面自动沿用上次选择
        },

        getDevices: () => _devices,
        getCurrentDeviceId: () => _deviceId,
        isActive: () => !!(_stream && _stream.active),
    };
})();
