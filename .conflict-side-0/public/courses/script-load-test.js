// ========================================================
// 🚀 多脚本加载压力测试课件
// 测试服务器从网络拉取多个不同来源脚本的能力
// ========================================================

const { useState, useEffect, useRef } = React;

const SCRIPTS_TO_TEST = [
    { name: 'Chart.js',      varName: 'Chart',       desc: '图表库 (jsdelivr)' },
    { name: 'KaTeX',         varName: 'katex',        desc: '数学公式 (jsdelivr)' },
    { name: 'Lodash',        varName: '_',            desc: '工具函数库 (jsdelivr)' },
    { name: 'Marked',        varName: 'marked',       desc: 'Markdown 渲染 (jsdelivr)' },
    { name: 'DayJS',         varName: 'dayjs',        desc: '日期处理库 (jsdelivr)' },
    { name: 'Anime.js',      varName: 'anime',        desc: '动画库 (jsdelivr)' },
];

// ================= SLIDES =================

function IntroSlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 space-y-6 bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
            <div className="w-32 h-32 bg-indigo-100 rounded-full flex items-center justify-center shadow-inner">
                <i className="fas fa-rocket text-indigo-600 text-6xl"></i>
            </div>
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-600">
                多脚本加载压力测试
            </h1>
            <p className="max-w-2xl text-lg text-slate-500 bg-white/80 p-6 rounded-2xl border border-slate-100">
                本课件将同时请求 <strong className="text-indigo-600">{SCRIPTS_TO_TEST.length} 个</strong> 外部脚本，
                测试服务器缓存代理的并发拉取能力。<br/>
                翻到下一页查看加载结果。
            </p>
        </div>
    );
}

function StatusSlide() {
    const [results, setResults] = useState([]);

    useEffect(() => {
        const check = () => {
            setResults(SCRIPTS_TO_TEST.map(s => ({
                ...s,
                loaded: typeof window[s.varName] !== 'undefined'
            })));
        };
        check();
        const t1 = setTimeout(check, 1500);
        const t2 = setTimeout(check, 4000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    const loaded = results.filter(r => r.loaded).length;

    return (
        <div className="flex flex-col min-h-full p-8 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-2 flex items-center">
                <i className="fas fa-tasks mr-3 text-indigo-500"></i> 加载状态检测
            </h2>
            <p className="text-slate-500 mb-6">
                {loaded}/{SCRIPTS_TO_TEST.length} 个脚本已加载
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                {results.map(r => (
                    <div key={r.name} className={`p-4 rounded-xl border flex items-center gap-4 ${r.loaded ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${r.loaded ? 'bg-green-500' : 'bg-red-400'}`}>
                            <i className={`fas ${r.loaded ? 'fa-check' : 'fa-times'} text-white`}></i>
                        </div>
                        <div>
                            <div className="font-bold text-slate-800">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.desc}</div>
                            <div className="text-xs font-mono text-slate-400">window.{r.varName}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ChartSlide() {
    const ref = useRef(null);
    const [ok, setOk] = useState(null);

    useEffect(() => {
        if (typeof window.Chart === 'undefined') { setOk(false); return; }
        setOk(true);
        const ctx = ref.current.getContext('2d');
        new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','May','Jun'],
                datasets: [{
                    label: '加载速度 (ms)',
                    data: [320, 280, 190, 150, 120, 90],
                    borderColor: 'rgba(99,102,241,1)',
                    backgroundColor: 'rgba(99,102,241,0.1)',
                    tension: 0.4, fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }, []);

    return (
        <div className="flex flex-col min-h-full p-8 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 flex items-center">
                <i className="fas fa-chart-line mr-3 text-indigo-500"></i> Chart.js 渲染测试
            </h2>
            {ok === false
                ? <div className="flex-1 flex items-center justify-center text-red-500 text-xl"><i className="fas fa-times-circle mr-2"></i> Chart.js 未加载</div>
                : <div className="flex-1 relative min-h-[300px]"><canvas ref={ref}></canvas></div>
            }
        </div>
    );
}

function MarkdownSlide() {
    const [ok, setOk] = useState(null);
    const [html, setHtml] = useState('');

    useEffect(() => {
        if (typeof window.marked === 'undefined') { setOk(false); return; }
        setOk(true);
        const md = `# Marked.js 渲染成功 🎉\n\n这是一段 **Markdown** 文本，由 \`marked.js\` 实时渲染。\n\n- 列表项 1\n- 列表项 2\n- 列表项 3\n\n> 引用块：服务器缓存代理工作正常！`;
        setHtml(window.marked.parse(md));
    }, []);

    return (
        <div className="flex flex-col min-h-full p-8 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 flex items-center">
                <i className="fab fa-markdown mr-3 text-cyan-500"></i> Marked.js 渲染测试
            </h2>
            {ok === false
                ? <div className="flex-1 flex items-center justify-center text-red-500 text-xl"><i className="fas fa-times-circle mr-2"></i> Marked.js 未加载</div>
                : <div className="prose max-w-none p-6 bg-slate-50 rounded-2xl border" dangerouslySetInnerHTML={{ __html: html }} />
            }
        </div>
    );
}

function UtilsSlide() {
    const [ok, setOk] = useState(null);
    const [date, setDate] = useState('');
    const [chunk, setChunk] = useState([]);

    useEffect(() => {
        const lodashOk = typeof window._ !== 'undefined';
        const dayjsOk = typeof window.dayjs !== 'undefined';
        setOk(lodashOk && dayjsOk);
        if (dayjsOk) setDate(window.dayjs().format('YYYY年MM月DD日 HH:mm:ss'));
        if (lodashOk) setChunk(window._.chunk([1,2,3,4,5,6,7,8], 3));
    }, []);

    return (
        <div className="flex flex-col min-h-full p-8 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 flex items-center">
                <i className="fas fa-tools mr-3 text-amber-500"></i> Lodash + Day.js 测试
            </h2>
            {ok === false
                ? <div className="flex-1 flex items-center justify-center text-red-500 text-xl"><i className="fas fa-times-circle mr-2"></i> 库未加载</div>
                : (
                    <div className="space-y-4">
                        <div className="p-5 bg-amber-50 rounded-xl border border-amber-200">
                            <div className="font-bold text-slate-700 mb-1">Day.js — 当前时间</div>
                            <div className="text-2xl font-mono text-amber-700">{date}</div>
                        </div>
                        <div className="p-5 bg-slate-50 rounded-xl border">
                            <div className="font-bold text-slate-700 mb-2">Lodash _.chunk([1..8], 3)</div>
                            <div className="flex gap-2 flex-wrap">
                                {chunk.map((group, i) => (
                                    <div key={i} className="px-4 py-2 bg-indigo-100 rounded-lg font-mono text-indigo-700">
                                        [{group.join(', ')}]
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}

function AnimeSlide() {
    const boxRef = useRef(null);
    const [ok, setOk] = useState(null);

    useEffect(() => {
        if (typeof window.anime === 'undefined') { setOk(false); return; }
        setOk(true);
        window.anime({
            targets: boxRef.current,
            translateX: [0, 200, 0],
            rotate: '1turn',
            backgroundColor: ['#6366f1', '#06b6d4', '#6366f1'],
            duration: 2000,
            loop: true,
            easing: 'easeInOutSine'
        });
    }, []);

    return (
        <div className="flex flex-col min-h-full p-8 bg-white">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 flex items-center">
                <i className="fas fa-magic mr-3 text-purple-500"></i> Anime.js 动画测试
            </h2>
            {ok === false
                ? <div className="flex-1 flex items-center justify-center text-red-500 text-xl"><i className="fas fa-times-circle mr-2"></i> Anime.js 未加载</div>
                : (
                    <div className="flex-1 flex items-center justify-center">
                        <div ref={boxRef} className="w-20 h-20 rounded-2xl bg-indigo-500 shadow-lg"></div>
                    </div>
                )
            }
        </div>
    );
}

// ================= COURSE DATA =================

window.CourseData = {
    title: "多脚本加载压力测试",
    icon: "🚀",
    desc: "测试服务器并发拉取多个外部脚本的能力",
    color: "from-indigo-500 to-cyan-600",
    dependencies: [
        { name: "chartjs",  localSrc: "/lib/chart.umd.min.js",  publicSrc: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" },
        { name: "katex",    localSrc: "/lib/katex.min.js",       publicSrc: "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" },
        { name: "lodash",   localSrc: "/lib/lodash.min.js",      publicSrc: "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js" },
        { name: "marked",   localSrc: "/lib/marked.min.js",      publicSrc: "https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js" },
        { name: "dayjs",    localSrc: "/lib/dayjs.min.js",       publicSrc: "https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js" },
        { name: "animejs",  localSrc: "/lib/anime.min.js",       publicSrc: "https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js" },
    ],
    slides: [
        { id: 'intro',    component: <IntroSlide /> },
        { id: 'status',   component: <StatusSlide /> },
        { id: 'chart',    component: <ChartSlide /> },
        { id: 'markdown', component: <MarkdownSlide /> },
        { id: 'utils',    component: <UtilsSlide /> },
        { id: 'anime',    component: <AnimeSlide /> },
    ]
};
