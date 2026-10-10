// ========================================================
// 课程内容：摄像头引擎测试
// 测试 window.CourseGlobalContext 摄像头 API
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= 类型定义 =================

interface LogEntry {
    msg: string;
    type: 'info' | 'ok' | 'error' | 'warn';
    t: string;
}

// ================= 子组件 =================

function LogPanel({ entries }: { entries: LogEntry[] }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries]);

    const colors: Record<string, string> = {
        info: 'text-slate-400',
        ok:   'text-green-400',
        error:'text-red-400',
        warn: 'text-yellow-400',
    };

    return (
        <div className="flex-1 bg-slate-950 rounded-xl border border-slate-700 p-3 overflow-y-auto font-mono text-xs leading-relaxed min-h-0">
            {entries.length === 0 && (
                <span className="text-slate-600">等待操作...</span>
            )}
            {entries.map((e, i) => (
                <div key={i} className={colors[e.type] || 'text-slate-400'}>
                    <span className="text-slate-600">[{e.t}] </span>{e.msg}
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
}

// ================= SLIDE 1: 引擎 API 测试 =================

function EngineApiSlide() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [streamActive, setStreamActive] = useState<boolean>(false);
    const [currentDevice, setCurrentDevice] = useState<string>('');

    const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
        setLog(prev => [...prev, { msg, type, t: new Date().toLocaleTimeString() }]);
    };

    // onStream 回调：每次设备切换都会被调用
    const onStream = (stream: MediaStream) => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
        const track = stream.getVideoTracks()[0];
        const label = track?.label || '(unknown)';
        setStreamActive(true);
        setCurrentDevice(label);
        addLog('[OK] stream received: ' + label, 'ok');
        addLog('    tracks: ' + stream.getTracks().length + ', active: ' + stream.active, 'info');
    };

    useEffect(() => {
        addLog('Calling CourseGlobalContext.getCamera(onStream)...', 'info');
        window.CourseGlobalContext.getCamera(onStream).catch((err: Error) => {
            addLog('[ERROR] ' + err.name + ': ' + err.message, 'error');
        });

        return () => {
            addLog('Slide unmounting — unregisterCamera', 'warn');
            window.CourseGlobalContext.unregisterCamera(onStream);
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, []);

    const handleCheckManager = () => {
        const cm = window.CameraManager;
        addLog('--- CameraManager state ---', 'info');
        addLog('isActive(): ' + cm.isActive(), cm.isActive() ? 'ok' : 'warn');
        addLog('getCurrentDeviceId(): ' + (cm.getCurrentDeviceId() || 'null (default)'), 'info');
        const devices = cm.getDevices();
        addLog('getDevices(): ' + devices.length + ' device(s)', 'info');
        devices.forEach((d: MediaDeviceInfo, i: number) => {
            addLog('  [' + i + '] ' + (d.label || '(no label)') + ' | ' + d.deviceId.slice(0, 20) + '...', 'info');
        });
    };

    return (
        <div className="flex flex-col h-full p-6 md:p-8 bg-white">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 flex items-center shrink-0">
                <i className="fas fa-camera mr-3 text-blue-500"></i>
                引擎摄像头 API 测试
            </h2>
            <p className="text-slate-500 text-sm mb-4 shrink-0">
                测试 <code className="bg-slate-100 px-1 rounded">CourseGlobalContext.getCamera(onStream)</code> 回调模式。
                切换摄像头时 <code className="bg-slate-100 px-1 rounded">onStream</code> 会自动被引擎重新调用。
            </p>

            <div className="flex flex-col md:flex-row flex-1 gap-4 min-h-0">
                {/* 左：视频预览 */}
                <div className="flex flex-col gap-3 md:w-1/2 shrink-0">
                    <div className="relative bg-black rounded-xl overflow-hidden border-2 border-slate-800 aspect-video flex items-center justify-center">
                        {!streamActive && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-slate-500 text-sm animate-pulse">等待摄像头...</span>
                            </div>
                        )}
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-contain"
                        />
                        {streamActive && (
                            <div className="absolute bottom-2 left-2 bg-black/70 text-green-400 text-xs font-mono px-2 py-1 rounded">
                                <i className="fas fa-circle text-green-500 mr-1 text-[8px]"></i>
                                {currentDevice.slice(0, 40)}{currentDevice.length > 40 ? '...' : ''}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleCheckManager}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-lg transition-colors"
                    >
                        <i className="fas fa-info-circle mr-2"></i>检查 CameraManager 状态
                    </button>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 leading-relaxed">
                        <strong>使用说明：</strong><br/>
                        1. 进入此页面后摄像头自动启动<br/>
                        2. 点击右下角摄像头按钮可切换设备<br/>
                        3. 切换后 <code>onStream</code> 回调自动触发，视频无缝更新<br/>
                        4. 翻页后摄像头自动释放
                    </div>
                </div>

                {/* 右：日志 */}
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="text-xs font-bold text-slate-500 mb-1 shrink-0">
                        <i className="fas fa-terminal mr-1"></i>运行日志
                    </div>
                    <LogPanel entries={log} />
                </div>
            </div>
        </div>
    );
}

// ================= SLIDE 2: 设备信息 =================

function DeviceInfoSlide() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [streamActive, setStreamActive] = useState<boolean>(false);
    const [info, setInfo] = useState<{
        label: string;
        width: number;
        height: number;
        frameRate: number;
        deviceId: string;
    } | null>(null);

    useEffect(() => {
        const onStream = (stream: MediaStream) => {
            if (videoRef.current) videoRef.current.srcObject = stream;
            setStreamActive(true);
            const track = stream.getVideoTracks()[0];
            if (track) {
                const settings = track.getSettings();
                setInfo({
                    label: track.label,
                    width: settings.width || 0,
                    height: settings.height || 0,
                    frameRate: Math.round(settings.frameRate || 0),
                    deviceId: settings.deviceId || '',
                });
            }
        };

        window.CourseGlobalContext.getCamera(onStream).catch(() => {});
        return () => {
            window.CourseGlobalContext.unregisterCamera(onStream);
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, []);

    return (
        <div className="flex flex-col h-full p-6 md:p-8 bg-white">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-microchip mr-3 text-purple-500"></i>
                当前摄像头设备信息
            </h2>

            <div className="flex flex-col md:flex-row flex-1 gap-6 min-h-0">
                <div className="md:w-1/2 bg-black rounded-2xl overflow-hidden border-2 border-slate-800 flex items-center justify-center aspect-video shrink-0">
                    {!streamActive && <span className="text-slate-500 text-sm animate-pulse">等待摄像头...</span>}
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
                </div>

                <div className="flex-1 flex flex-col justify-center gap-4">
                    {!info ? (
                        <div className="text-slate-400 text-sm animate-pulse">正在获取设备信息...</div>
                    ) : (
                        <>
                            {[
                                { label: '设备名称', value: info.label, icon: 'fa-camera', color: 'text-blue-600' },
                                { label: '分辨率', value: `${info.width} × ${info.height}`, icon: 'fa-expand', color: 'text-green-600' },
                                { label: '帧率', value: `${info.frameRate} fps`, icon: 'fa-film', color: 'text-orange-600' },
                                { label: 'Device ID', value: info.deviceId.slice(0, 32) + '...', icon: 'fa-fingerprint', color: 'text-purple-600' },
                            ].map((row, i) => (
                                <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <i className={`fas ${row.icon} ${row.color} text-xl w-6 shrink-0 mt-0.5`}></i>
                                    <div>
                                        <div className="text-xs text-slate-500 font-bold mb-1">{row.label}</div>
                                        <div className="text-sm font-mono text-slate-800 break-all">{row.value}</div>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides = [
    { id: 'engine-api', component: <EngineApiSlide /> },
    { id: 'device-info', component: <DeviceInfoSlide /> },
];

window.CourseData = {
    title: "摄像头引擎测试",
    icon: "📷",
    desc: "测试引擎摄像头 API：getCamera / unregisterCamera / switchDevice",
    color: "from-slate-600 to-slate-800",
    slides: mySlides,
};
