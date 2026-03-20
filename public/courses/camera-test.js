// Camera diagnostic test course
const { useState, useEffect, useRef } = React;

function CameraTestSlide() {
    const videoRef = useRef(null);
    const [log, setLog] = useState([]);
    const [devices, setDevices] = useState([]);
    const [activeDevice, setActiveDevice] = useState(null);
    const streamRef = useRef(null);

    const addLog = (msg, type = 'info') =>
        setLog(prev => [...prev, { msg, type, t: new Date().toLocaleTimeString() }]);

    const stopStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setActiveDevice(null);
    };

    const tryDevice = async (deviceId, label) => {
        stopStream();
        addLog('Trying: ' + (label || 'default') + '...');
        try {
            const constraint = deviceId
                ? { video: { deviceId: { exact: deviceId } } }
                : { video: true };
            const stream = await navigator.mediaDevices.getUserMedia(constraint);
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            const track = stream.getVideoTracks()[0];
            addLog('[OK] ' + track.label, 'ok');
            setActiveDevice(label || 'default');
        } catch (err) {
            addLog('[FAIL] ' + err.name + ': ' + err.message, 'error');
            if (err.name === 'NotReadableError') {
                addLog('Waiting 500ms then trying all devices...', 'info');
                await new Promise(r => setTimeout(r, 500));
                const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
                for (const d of all.filter(x => x.kind === 'videoinput')) {
                    try {
                        const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: d.deviceId } } });
                        streamRef.current = s;
                        if (videoRef.current) videoRef.current.srcObject = s;
                        addLog('[OK] fallback: ' + s.getVideoTracks()[0].label, 'ok');
                        setActiveDevice('fallback: ' + (d.label || d.deviceId.slice(0,16)));
                        return;
                    } catch (e2) {
                        addLog('  skip: ' + (d.label || d.deviceId.slice(0,16)) + ' -> ' + e2.name, 'error');
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
                addLog('All devices failed.', 'error');
            }
        }
    };

    const enumerate = async () => {
        addLog('Enumerating video devices...');
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            const vids = all.filter(d => d.kind === 'videoinput');
            setDevices(vids);
            addLog('Found ' + vids.length + ' device(s):');
            vids.forEach((d, i) =>
                addLog('  [' + i + '] ' + (d.label || '(no label)') + ' | ' + d.deviceId.slice(0, 20) + '...')
            );
        } catch (err) {
            addLog('enumerateDevices error: ' + err.message, 'error');
        }
    };

    useEffect(() => {
        addLog('Ready. Click "Enumerate" then try each device.');
        return () => stopStream();
    }, []);

    const btn = (label, onClick, color) => (
        <button onClick={onClick} style={{
            background: color, color: '#fff', border: 'none', borderRadius: 6,
            padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace', margin: 2
        }}>{label}</button>
    );

    const logColor = { info: '#94a3b8', ok: '#4ade80', error: '#f87171' };

    return (
        <div style={{ fontFamily: 'monospace', background: '#0f172a', color: '#e2e8f0', height: '100%', display: 'flex', flexDirection: 'column', padding: 16, gap: 10, boxSizing: 'border-box' }}>
            <div style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: 16 }}>Camera Diagnostic</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {btn('Enumerate Devices', enumerate, '#0369a1')}
                {btn('Try Default', () => tryDevice(null, 'default'), '#7c3aed')}
                {devices.map((d, i) =>
                    btn('Try [' + i + '] ' + (d.label || 'Device ' + i).slice(0, 25), () => tryDevice(d.deviceId, d.label || 'Device ' + i), '#065f46')
                )}
                {btn('Stop', stopStream, '#991b1b')}
            </div>

            {activeDevice && <div style={{ color: '#4ade80', fontSize: 12 }}>Active: {activeDevice}</div>}

            <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
                <video ref={videoRef} autoPlay playsInline muted
                    style={{ width: '50%', background: '#1e293b', borderRadius: 8, border: '2px solid #334155', objectFit: 'contain' }}
                />
                <div style={{ flex: 1, background: '#1e293b', borderRadius: 8, padding: 10, overflowY: 'auto', fontSize: 11, border: '2px solid #334155' }}>
                    {log.map((l, i) => (
                        <div key={i} style={{ color: logColor[l.type] || '#94a3b8', marginBottom: 3 }}>
                            <span style={{ color: '#475569' }}>[{l.t}] </span>{l.msg}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

const mySlides = [
    { id: 'camera-test', component: <CameraTestSlide /> }
];

window.CourseData = {
    title: "Camera Test",
    icon: "📷",
    desc: "Diagnose camera access in Electron",
    color: "from-slate-500 to-slate-700",
    slides: mySlides
};
