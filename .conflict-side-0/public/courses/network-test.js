// ========================================================
// 🧪 网络脚本加载测试课件
// 用于测试外部依赖加载功能是否正常工作
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= 常量定义 =================

const TEST_SCRIPTS = [
    { name: 'Chart.js', varName: 'Chart', desc: '图表绘制库' },
    { name: 'KaTeX', varName: 'katex', desc: '数学公式渲染' }
];

// ================= SLIDE COMPONENTS =================

function IntroSlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-purple-50 via-white to-pink-50">
            <div className="w-32 md:w-40 h-32 md:h-40 bg-purple-100 rounded-full flex items-center justify-center shadow-inner border-4 border-white">
                <i className="fas fa-network-wired text-purple-600 text-6xl md:text-[80px] drop-shadow-md"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 tracking-tight">
                网络脚本加载测试
            </h1>
            <h2 className="text-xl md:text-3xl font-bold text-slate-600 mt-4 tracking-wide">
                验证外部依赖加载功能
            </h2>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500 mt-6 leading-relaxed bg-white/80 p-6 md:p-8 rounded-2xl shadow-sm backdrop-blur-md border border-slate-100">
                本课件用于测试 SyncClassroom 框架的<br/>
                <strong className="text-purple-600">外部脚本加载机制</strong>是否正常工作
            </p>
        </div>
    );
}

function TestResultsSlide() {
    const [results, setResults] = useState({});
    const [allLoaded, setAllLoaded] = useState(false);

    useEffect(() => {
        const checkScripts = () => {
            const newResults = {};
            let allSuccess = true;

            TEST_SCRIPTS.forEach(script => {
                const isLoaded = typeof window[script.varName] !== 'undefined';
                newResults[script.name] = {
                    loaded: isLoaded,
                    desc: script.desc,
                    varName: script.varName
                };
                if (!isLoaded) allSuccess = false;
            });

            setResults(newResults);
            setAllLoaded(allSuccess);
        };

        // 立即检查一次
        checkScripts();

        // 延迟再次检查，确保异步加载完成
        const timer = setTimeout(checkScripts, 1000);
        const timer2 = setTimeout(checkScripts, 3000);

        return () => {
            clearTimeout(timer);
            clearTimeout(timer2);
        };
    }, []);

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 md:mb-8 flex items-center shrink-0">
                <i className="fas fa-vial mr-4 text-purple-500"></i> 脚本加载检测结果
            </h2>

            {/* 总体状态 */}
            <div className={`p-6 rounded-2xl shadow-sm border mb-6 ${allLoaded ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${allLoaded ? 'bg-green-500' : 'bg-yellow-500'}`}>
                        <i className={`fas ${allLoaded ? 'fa-check' : 'fa-exclamation-triangle'} text-white text-xl`}></i>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">
                            {allLoaded ? '所有脚本加载成功' : '部分脚本未加载'}
                        </h3>
                        <p className="text-slate-600">
                            {allLoaded 
                                ? '外部依赖加载机制工作正常' 
                                : '请检查网络连接或脚本路径配置'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 详细结果 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(results).map(([name, result]) => (
                    <div key={name} className={`p-5 rounded-xl border ${result.loaded ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-slate-800">{name}</h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${result.loaded ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                {result.loaded ? '已加载' : '未加载'}
                            </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-1">{result.desc}</p>
                        <p className="text-xs text-slate-500 font-mono">window.{result.varName}</p>
                    </div>
                ))}
            </div>

            {/* 刷新按钮 */}
            <div className="mt-6 flex justify-center">
                <button 
                    onClick={() => window.location.reload()}
                    className="flex items-center px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold transition-colors"
                >
                    <i className="fas fa-sync-alt mr-2"></i> 刷新页面重新检测
                </button>
            </div>
        </div>
    );
}

function ChartTestSlide() {
    const chartRef = useRef(null);
    const [chartStatus, setChartStatus] = useState('checking');

    useEffect(() => {
        if (typeof window.Chart === 'undefined') {
            setChartStatus('not-loaded');
            return;
        }

        setChartStatus('loaded');

        // 创建示例图表
        const ctx = chartRef.current.getContext('2d');
        new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['局域网', '公网 CDN', '加载时间', '成功率'],
                datasets: [{
                    label: '性能指标',
                    data: [95, 85, 90, 98],
                    backgroundColor: [
                        'rgba(147, 51, 234, 0.8)',
                        'rgba(236, 72, 153, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(34, 197, 94, 0.8)'
                    ],
                    borderColor: [
                        'rgba(147, 51, 234, 1)',
                        'rgba(236, 72, 153, 1)',
                        'rgba(59, 130, 246, 1)',
                        'rgba(34, 197, 94, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: '脚本加载性能测试',
                        font: { size: 16 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }, []);

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center">
                <i className="fas fa-chart-bar mr-4 text-blue-500"></i> Chart.js 功能测试
            </h2>

            {chartStatus === 'not-loaded' ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-200">
                        <i className="fas fa-times-circle text-red-500 text-5xl mb-4"></i>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Chart.js 未加载</h3>
                        <p className="text-slate-600">无法创建图表，请检查脚本是否正确加载</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 relative min-h-[300px]">
                    <canvas ref={chartRef}></canvas>
                </div>
            )}
        </div>
    );
}

function KaTeXTestSlide() {
    const [katexStatus, setKatexStatus] = useState('checking');

    useEffect(() => {
        if (typeof window.katex === 'undefined') {
            setKatexStatus('not-loaded');
        } else {
            setKatexStatus('loaded');
        }
    }, []);

    const formulas = [
        { name: '二次方程', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
        { name: '欧拉公式', tex: 'e^{i\\pi} + 1 = 0' },
        { name: '勾股定理', tex: 'a^2 + b^2 = c^2' },
        { name: '求和公式', tex: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}' }
    ];

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center">
                <i className="fas fa-square-root-alt mr-4 text-pink-500"></i> KaTeX 公式渲染测试
            </h2>

            {katexStatus === 'not-loaded' ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-200">
                        <i className="fas fa-times-circle text-red-500 text-5xl mb-4"></i>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">KaTeX 未加载</h3>
                        <p className="text-slate-600">无法渲染数学公式，请检查脚本是否正确加载</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {formulas.map((formula, index) => (
                        <div key={index} className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                            <h4 className="font-bold text-slate-700 mb-3">{formula.name}</h4>
                            <div 
                                className="p-4 bg-white rounded-lg text-center"
                                dangerouslySetInnerHTML={{
                                    __html: window.katex ? window.katex.renderToString(formula.tex, {
                                        throwOnError: false,
                                        displayMode: true
                                    }) : ''
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SummarySlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 bg-gradient-to-br from-green-50 via-white to-blue-50">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <i className="fas fa-check-circle text-green-600 text-4xl"></i>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-800 mb-6">
                测试完成
            </h2>
            <div className="max-w-2xl text-left space-y-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border">
                    <h3 className="font-bold text-slate-800 mb-2 flex items-center">
                        <i className="fas fa-info-circle text-blue-500 mr-2"></i> 测试说明
                    </h3>
                    <p className="text-slate-600 text-sm">
                        本课件测试了 SyncClassroom 的外部脚本加载机制，包括：
                    </p>
                    <ul className="text-slate-600 text-sm mt-2 space-y-1 ml-5 list-disc">
                        <li>局域网优先加载策略</li>
                        <li>公网 CDN 兜底机制</li>
                        <li>脚本执行环境验证</li>
                        <li>功能可用性检测</li>
                    </ul>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border">
                    <h3 className="font-bold text-slate-800 mb-2 flex items-center">
                        <i className="fas fa-lightbulb text-yellow-500 mr-2"></i> 使用建议
                    </h3>
                    <p className="text-slate-600 text-sm">
                        如果测试失败，请检查：
                    </p>
                    <ul className="text-slate-600 text-sm mt-2 space-y-1 ml-5 list-disc">
                        <li>网络连接是否正常</li>
                        <li>防火墙是否阻止了外部请求</li>
                        <li>脚本 URL 是否正确配置</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides = [
    { id: 'intro', component: <IntroSlide /> },
    { id: 'test-results', component: <TestResultsSlide /> },
    { id: 'chart-test', component: <ChartTestSlide /> },
    { id: 'katex-test', component: <KaTeXTestSlide /> },
    { id: 'summary', component: <SummarySlide /> }
];

window.CourseData = {
    title: "网络脚本加载测试",
    icon: "🧪",
    desc: "测试外部依赖加载功能是否正常工作",
    color: "from-purple-500 to-pink-600",
    dependencies: [
        {
            name: "chartjs",
            localSrc: "/lib/chart.umd.min.js",
            publicSrc: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
        },
        {
            name: "katex",
            localSrc: "/lib/katex.min.js",
            publicSrc: "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
        }
    ],
    slides: mySlides
};
