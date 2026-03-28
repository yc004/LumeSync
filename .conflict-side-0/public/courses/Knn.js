// ========================================================
// 🎨 课程内容：特征分类的秘密 —— KNN 与 K-means
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= SLIDE COMPONENTS =================

// ---- 1. 标题页 ----
function IntroSlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 md:space-y-10 bg-gradient-to-br from-green-50 via-white to-teal-50">
            <div className="w-32 md:w-40 h-32 md:h-40 bg-green-100 rounded-full flex items-center justify-center shadow-inner border-4 border-white shrink-0">
                <i className="fas fa-project-diagram text-green-600 text-6xl md:text-[80px] drop-shadow-md"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-teal-600 tracking-tight">
                特征分类的秘密
            </h1>
            <h2 className="text-xl md:text-3xl font-bold text-slate-600 mt-4 md:mt-6 tracking-wide">
                KNN 与 K-means —— 找邻居 vs 找圆心
            </h2>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500 mt-6 md:mt-8 leading-relaxed bg-white/80 p-6 md:p-8 rounded-2xl shadow-sm backdrop-blur-md border border-slate-100">
                上节课，AI 已经把人脸变成了 128 个数字。<br /><br />
                但有了这些数字后，计算机怎么判断<strong className="text-green-600">「这是谁」</strong>，或者把陌生人<strong className="text-teal-600">「自动分堆」</strong>呢？
            </p>
        </div>
    );
}

// ---- 2. 回顾衔接 ----
function ReviewSlide() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 md:mb-8 flex items-center shrink-0">
                <i className="fas fa-history mr-4 text-orange-500"></i> 回顾：上节课的终点，就是今天的起点
            </h2>

            <div className="bg-blue-50 p-6 md:p-8 rounded-2xl border border-blue-100 shadow-sm mb-6 shrink-0">
                <h3 className="text-xl md:text-2xl font-bold text-blue-800 mb-4 flex items-center">
                    <i className="fas fa-microchip mr-3 text-blue-600"></i> 上节课：深度学习把人脸变成了数字
                </h3>
                <div className="flex flex-wrap md:flex-nowrap items-center justify-center gap-4 md:gap-6 text-base md:text-lg text-slate-700 font-medium">
                    <div className="flex flex-col items-center bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                        <i className="fas fa-user text-4xl text-blue-400 mb-2"></i>
                        <span>人脸图像</span>
                    </div>
                    <i className="fas fa-arrow-right text-blue-300 text-2xl hidden md:block"></i>
                    <div className="flex flex-col items-center bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                        <i className="fas fa-layer-group text-4xl text-purple-400 mb-2"></i>
                        <span>CNN 深度神经网络</span>
                    </div>
                    <i className="fas fa-arrow-right text-blue-300 text-2xl hidden md:block"></i>
                    <div className="flex flex-col items-center bg-blue-600 text-white p-4 rounded-xl shadow-md">
                        <i className="fas fa-list-ol text-4xl mb-2"></i>
                        <span className="font-bold">128 个特征数字</span>
                        <span className="text-xs mt-1 opacity-80">（"人脸身份证"）</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-green-50 p-6 md:p-8 rounded-2xl border border-green-100 shadow-sm flex flex-col justify-center">
                <h3 className="text-xl md:text-2xl font-bold text-green-800 mb-4 flex items-center">
                    <i className="fas fa-question-circle mr-3 text-green-600"></i> 今天的新问题：有了数字，然后呢？
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
                    <div className="bg-white p-5 rounded-xl border-l-4 border-green-500 shadow-sm">
                        <p className="font-bold text-green-700 text-lg mb-2">场景一：认出已知的人</p>
                        <p className="text-slate-600">班级打卡系统：来了一个同学，判断他是<strong>班里的哪位同学</strong>？<br />→ 需要一个「<strong>有标签</strong>」的方法</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border-l-4 border-teal-500 shadow-sm">
                        <p className="font-bold text-teal-700 text-lg mb-2">场景二：把陌生人自动分组</p>
                        <p className="text-slate-600">商场摄像头：从没见过的顾客，自动按面孔把他们<strong>归为几类人群</strong>？<br />→ 需要一个「<strong>无标签</strong>」的方法</p>
                    </div>
                </div>
                <p className="text-center text-xl md:text-2xl font-bold text-slate-700">
                    今天登场的两位主角：<span className="text-green-600">KNN</span> 和 <span className="text-teal-600">K-means</span>，正好分别解决这两个问题！
                </p>
            </div>
        </div>
    );
}

// ---- 3. 特征空间概念 ----
function FeatureSpaceSlide() {
    const [showLabels, setShowLabels] = useState(true);

    const points = [
        { x: 22, y: 28, color: 'bg-blue-500', label: '小明', bg: '#3b82f6' },
        { x: 28, y: 22, color: 'bg-blue-500', label: '小华', bg: '#3b82f6' },
        { x: 18, y: 33, color: 'bg-blue-500', label: '小军', bg: '#3b82f6' },
        { x: 72, y: 25, color: 'bg-rose-500', label: '小美', bg: '#f43f5e' },
        { x: 78, y: 30, color: 'bg-rose-500', label: '小红', bg: '#f43f5e' },
        { x: 68, y: 20, color: 'bg-rose-500', label: '小芳', bg: '#f43f5e' },
        { x: 45, y: 72, color: 'bg-amber-500', label: '老李', bg: '#f59e0b' },
        { x: 52, y: 78, color: 'bg-amber-500', label: '王老师', bg: '#f59e0b' },
    ];

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4 flex items-center shrink-0">
                <i className="fas fa-map-marker-alt mr-4 text-green-500"></i> 先理解「特征空间」：把数字画成地图
            </h2>
            <p className="text-slate-600 mb-6 text-lg md:text-xl shrink-0">
                128 个数字太抽象？我们用<strong>最简单的 2 个特征</strong>打个比方。<br />
                假设每个人的脸可以用「眼睛大小」和「脸型宽度」两个数字描述，把每个人画在坐标图上 →
            </p>

            <div className="flex-1 flex flex-col md:flex-row gap-6 items-center">
                <div className="relative bg-slate-50 rounded-2xl border-2 border-slate-200 shadow-inner w-full md:flex-1 aspect-square max-w-[380px] mx-auto md:mx-0">
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs md:text-sm font-bold text-slate-400 select-none">眼睛大小 →</div>
                    <div className="absolute top-1/2 left-1 -translate-y-1/2 -rotate-90 text-xs md:text-sm font-bold text-slate-400 select-none whitespace-nowrap">脸型宽度 →</div>
                    {points.map((p, i) => (
                        <div key={i} className="absolute" style={{ left: `${p.x}%`, bottom: `${p.y}%`, transform: 'translate(-50%, 50%)' }}>
                            <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full ${p.color} border-2 border-white shadow-md hover:scale-125 transition-transform`}></div>
                            {showLabels && (
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] md:text-xs font-bold text-slate-700 whitespace-nowrap bg-white/80 px-1 rounded">{p.label}</div>
                            )}
                        </div>
                    ))}
                    <div className="absolute rounded-full border-2 border-dashed border-blue-300 opacity-70" style={{ left: '9%', bottom: '14%', width: '30%', height: '30%' }}></div>
                    <div className="absolute rounded-full border-2 border-dashed border-rose-300 opacity-70" style={{ left: '57%', bottom: '12%', width: '30%', height: '30%' }}></div>
                    <div className="absolute rounded-full border-2 border-dashed border-amber-300 opacity-70" style={{ left: '33%', bottom: '60%', width: '30%', height: '30%' }}></div>
                </div>

                <div className="flex flex-col gap-4 w-full md:w-64 shrink-0">
                    <button
                        onClick={() => setShowLabels(v => !v)}
                        className="bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-600 transition-colors"
                    >
                        {showLabels ? '隐藏姓名标签' : '显示姓名标签'}
                    </button>
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                        <p className="font-bold text-green-800 mb-2 text-sm md:text-base">💡 你发现了什么？</p>
                        <p className="text-slate-700 text-sm md:text-base leading-relaxed">
                            即使没有告诉计算机任何标签，特征相似的人在「地图」上会自然<strong>聚集在一起</strong>！<br /><br />
                            这就是特征分类算法能工作的根本原因。
                        </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-sm md:text-base text-slate-600 leading-relaxed">
                        🔑 真实情况中这张地图有 <strong>128 维</strong>，人类无法直接看到，但计算机可以在高维空间里做同样的计算。
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---- 4. KNN 介绍 ----
function KNNIntroSlide() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-users mr-4 text-green-500"></i> KNN：「问问我的邻居是谁」
            </h2>

            <div className="flex-1 flex flex-col gap-5">
                <div className="bg-green-50 p-6 md:p-8 rounded-2xl border border-green-100 shadow-sm shrink-0">
                    <h3 className="text-xl md:text-2xl font-bold text-green-800 mb-3">🏫 生活中你早就用过 KNN！</h3>
                    <p className="text-slate-700 text-base md:text-xl leading-relaxed">
                        你转学来到一个新班级，放学后，班里离你家最近的 <strong className="text-green-600">3 位同学</strong>（你的「邻居」），有 2 个喜欢踢足球，1 个喜欢打篮球。<br /><br />
                        那你大概率是个<strong>足球爱好者</strong>！—— 这就是 KNN 的核心思想：<strong>少数服从多数，看邻居投票</strong>。
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { n: '1', icon: 'fa-user-plus', title: '出现新人脸', desc: '把它的 128 个数字放进特征空间，找到它的「位置」' },
                        { n: '2', icon: 'fa-ruler-combined', title: '找 K 个最近邻', desc: '计算它和所有已知人脸的「距离」，取最近的 K 个' },
                        { n: '3', icon: 'fa-vote-yea', title: '投票决定！', desc: 'K 个邻居中票数最多的那类，就是新人脸的身份' },
                    ].map(item => (
                        <div key={item.n} className="bg-white p-5 rounded-2xl border-2 border-green-200 shadow-sm flex flex-col items-center text-center hover:-translate-y-1 transition-transform">
                            <div className="bg-green-500 text-white w-11 h-11 rounded-full flex items-center justify-center font-black text-lg mb-3 shadow border-4 border-white shrink-0">{item.n}</div>
                            <i className={`fas ${item.icon} text-2xl text-green-400 mb-2`}></i>
                            <h4 className="font-bold text-green-800 text-base mb-1">{item.title}</h4>
                            <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
                        </div>
                    ))}
                </div>

                <div className="bg-slate-100 p-4 md:p-5 rounded-xl border border-slate-200 flex items-center gap-4 shrink-0">
                    <i className="fas fa-tag text-2xl text-green-600 shrink-0"></i>
                    <p className="text-slate-700 text-sm md:text-base leading-relaxed">
                        <strong>KNN = 有监督学习</strong>（Supervised Learning）：需要提前告诉计算机每个点「是谁」（打好标签），才能让它判断新来者。就像先给它看<strong>有答案的例题</strong>。
                    </p>
                </div>
            </div>
        </div>
    );
}

// ---- 5. KNN 互动演示 ----
function KNNDemoSlide() {
    const knownPoints = [
        { x: 20, y: 75, label: '小明', color: '#3b82f6', grp: '蓝组(男生)' },
        { x: 30, y: 65, label: '小华', color: '#3b82f6', grp: '蓝组(男生)' },
        { x: 15, y: 85, label: '小军', color: '#3b82f6', grp: '蓝组(男生)' },
        { x: 75, y: 70, label: '小美', color: '#f43f5e', grp: '红组(女生)' },
        { x: 82, y: 78, label: '小红', color: '#f43f5e', grp: '红组(女生)' },
        { x: 68, y: 62, label: '小芳', color: '#f43f5e', grp: '红组(女生)' },
        { x: 48, y: 20, label: '老李', color: '#f59e0b', grp: '黄组(老师)' },
        { x: 55, y: 28, label: '王老师', color: '#f59e0b', grp: '黄组(老师)' },
        { x: 40, y: 15, label: '张老师', color: '#f59e0b', grp: '黄组(老师)' },
    ];

    const [newPoint, setNewPoint] = useState(null);
    const [k, setK] = useState(3);
    const [result, setResult] = useState(null);
    const containerRef = useRef(null);

    const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const handleClick = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        const np = { x: xPct, y: yPct };
        setNewPoint(np);

        const sorted = [...knownPoints].sort((a, b) => dist(a, np) - dist(b, np));
        const neighbors = sorted.slice(0, k);
        const votes = {};
        neighbors.forEach(n => { votes[n.grp] = (votes[n.grp] || 0) + 1; });
        const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
        setResult({ neighbors, winner, votes });
    };

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3 flex items-center shrink-0">
                <i className="fas fa-hand-pointer mr-4 text-green-500"></i> KNN 互动演示：点击放一个新人进来
            </h2>
            <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
                <span className="text-slate-600 font-bold text-sm md:text-base">K 值（找几个邻居）：</span>
                {[1, 3, 5].map(val => (
                    <button key={val} onClick={() => { setK(val); setNewPoint(null); setResult(null); }}
                        className={`px-4 py-1.5 rounded-xl font-bold text-sm border-2 transition-colors ${k === val ? 'bg-green-500 text-white border-green-500' : 'bg-white text-slate-600 border-slate-300 hover:border-green-400'}`}>
                        K={val}
                    </button>
                ))}
                <button onClick={() => { setNewPoint(null); setResult(null); }} className="px-3 py-1.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 transition-colors">清除</button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-4">
                <div ref={containerRef} onClick={handleClick}
                    className="relative bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 shadow-inner flex-1 cursor-crosshair min-h-[260px] md:min-h-0">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-slate-400 font-bold select-none pointer-events-none">👆 点击任意位置放置新人脸</div>

                    {result && newPoint && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none">
                            {result.neighbors.map((n, i) => (
                                <line key={i} x1={`${newPoint.x}%`} y1={`${newPoint.y}%`} x2={`${n.x}%`} y2={`${n.y}%`}
                                    stroke="#86efac" strokeWidth="2" strokeDasharray="5,3" />
                            ))}
                        </svg>
                    )}

                    {knownPoints.map((p, i) => {
                        const isNeighbor = result?.neighbors.some(n => n.label === p.label);
                        return (
                            <div key={i} className="absolute" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}>
                                <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 border-white shadow-md transition-all duration-300 ${isNeighbor ? 'scale-150 ring-2 ring-green-400 ring-offset-1' : ''}`}
                                    style={{ backgroundColor: p.color }}></div>
                                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] md:text-[10px] font-bold text-slate-600 whitespace-nowrap">{p.label}</div>
                            </div>
                        );
                    })}

                    {newPoint && (
                        <div className="absolute" style={{ left: `${newPoint.x}%`, top: `${newPoint.y}%`, transform: 'translate(-50%, -50%)' }}>
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-purple-500 border-4 border-white shadow-xl animate-bounce flex items-center justify-center">
                                <i className="fas fa-question text-white text-xs font-black"></i>
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-full md:w-56 shrink-0 flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-2">
                        {[['#3b82f6', 'bg-blue-500', '蓝组(男生)'], ['#f43f5e', 'bg-rose-500', '红组(女生)'], ['#f59e0b', 'bg-amber-500', '黄组(老师)']].map(([c, bg, name]) => (
                            <div key={name} className="bg-white p-2 rounded-lg text-center border border-slate-200">
                                <div className={`w-4 h-4 ${bg} rounded-full mx-auto mb-1`}></div>
                                <span className="text-[10px] font-bold text-slate-600">{name.split('(')[1].replace(')', '')}</span>
                            </div>
                        ))}
                    </div>

                    {result ? (
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200 flex-1">
                            <p className="font-bold text-green-800 text-sm mb-2">✅ K={k} 个最近邻居：</p>
                            <ul className="text-xs text-slate-700 space-y-1 mb-3">
                                {result.neighbors.map((n, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: n.color }}></div>
                                        {n.label}（{n.grp.split('(')[0]}）
                                    </li>
                                ))}
                            </ul>
                            <div className="bg-green-600 text-white p-2.5 rounded-lg text-center font-bold text-xs md:text-sm">
                                🗳 投票结果：<br />{result.winner}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center text-slate-400 text-sm flex-1 flex flex-col items-center justify-center">
                            <i className="fas fa-mouse-pointer text-2xl mb-2 text-slate-300"></i>
                            点击左侧画布<br />放置新人脸
                        </div>
                    )}
                    <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200 text-xs text-yellow-800 font-bold leading-relaxed">
                        💡 试试在不同位置点击，对比 K=1 和 K=5 的结果有什么不同！
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---- 6. K-means 介绍 ----
function KMeansIntroSlide() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-bullseye mr-4 text-teal-500"></i> K-means：「自动找圆心来分堆」
            </h2>

            <div className="flex-1 flex flex-col gap-5">
                <div className="bg-teal-50 p-6 md:p-8 rounded-2xl border border-teal-100 shadow-sm shrink-0">
                    <h3 className="text-xl md:text-2xl font-bold text-teal-800 mb-3">🍬 想象一袋混在一起的糖果</h3>
                    <p className="text-slate-700 text-base md:text-xl leading-relaxed">
                        一袋糖果里有草莓味、柠檬味、薄荷味的，但<strong>包装一模一样</strong>，你不知道哪个是哪种。<br />
                        你只能按颜色把它们<strong>自己分成 3 堆</strong>，不需要提前知道「正确答案」。<br /><br />
                        K-means 就是干这件事：<strong className="text-teal-600">不需要任何标签，自动把数据分成 K 堆</strong>。
                    </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    {[
                        { n: '1', icon: 'fa-random', title: '随机扔 K 个圆心', desc: '在特征空间里随机选 K 个位置，作为初始「组长」' },
                        { n: '2', icon: 'fa-ruler', title: '每个点归队', desc: '每个数据点找离自己最近的圆心，加入它那组' },
                        { n: '3', icon: 'fa-crosshairs', title: '更新圆心位置', desc: '重新计算每组成员的平均位置，圆心移到那里' },
                        { n: '4', icon: 'fa-redo', title: '重复直到稳定', desc: '反复第 2、3 步，直到圆心不再移动为止' },
                    ].map(item => (
                        <div key={item.n} className="bg-white p-4 rounded-2xl border-2 border-teal-200 shadow-sm flex flex-col items-center text-center hover:-translate-y-1 transition-transform">
                            <div className="bg-teal-500 text-white w-10 h-10 rounded-full flex items-center justify-center font-black text-lg mb-3 shadow border-4 border-white shrink-0">{item.n}</div>
                            <i className={`fas ${item.icon} text-2xl text-teal-400 mb-2`}></i>
                            <h4 className="font-bold text-teal-800 text-sm mb-1">{item.title}</h4>
                            <p className="text-slate-600 text-xs leading-relaxed">{item.desc}</p>
                        </div>
                    ))}
                </div>

                <div className="bg-slate-100 p-4 md:p-5 rounded-xl border border-slate-200 flex items-center gap-4 shrink-0">
                    <i className="fas fa-unlock text-2xl text-teal-600 shrink-0"></i>
                    <p className="text-slate-700 text-sm md:text-base leading-relaxed">
                        <strong>K-means = 无监督学习</strong>（Unsupervised Learning）：不需要任何标签，计算机自己探索数据中的规律。就像给它一堆<strong>没有答案的题目，让它自己发现规律</strong>。
                    </p>
                </div>
            </div>
        </div>
    );
}

// ---- 7. K-means 互动演示 ----
function KMeansDemoSlide() {
    const COLORS = [
        { bg: '#3b82f6', cls: 'bg-blue-500', name: '第1组' },
        { bg: '#f43f5e', cls: 'bg-rose-500', name: '第2组' },
        { bg: '#10b981', cls: 'bg-emerald-500', name: '第3组' },
    ];

    const makePoints = () => [
        { x: 18, y: 22 }, { x: 25, y: 30 }, { x: 20, y: 28 }, { x: 28, y: 20 }, { x: 22, y: 35 },
        { x: 72, y: 20 }, { x: 78, y: 28 }, { x: 65, y: 22 }, { x: 80, y: 18 }, { x: 70, y: 30 },
        { x: 46, y: 74 }, { x: 52, y: 80 }, { x: 55, y: 70 }, { x: 42, y: 72 }, { x: 58, y: 78 },
    ].map(p => ({ ...p, cluster: -1 }));

    const makeCentroids = () => [{ x: 50, y: 50 }, { x: 55, y: 45 }, { x: 45, y: 55 }];

    const [points, setPoints] = useState(makePoints);
    const [centroids, setCentroids] = useState(makeCentroids);
    const [iter, setIter] = useState(0);
    const [phase, setPhase] = useState(0);
    const [done, setDone] = useState(false);
    const [msg, setMsg] = useState('3 个圆心（⭐）已随机放置，点击「下一步」开始！');

    const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const nextStep = () => {
        if (done) return;
        if (phase === 0 || phase === 2) {
            const newPts = points.map(p => ({
                ...p, cluster: centroids.reduce((best, c, i) => dist(p, c) < dist(p, centroids[best]) ? i : best, 0)
            }));
            setPoints(newPts);
            setPhase(1);
            setMsg(`第 ${iter + 1} 轮：每个点找到最近的圆心，完成归队！现在更新圆心位置 →`);
        } else {
            const newCents = centroids.map((_, ci) => {
                const m = points.filter(p => p.cluster === ci);
                if (!m.length) return centroids[ci];
                return { x: m.reduce((s, p) => s + p.x, 0) / m.length, y: m.reduce((s, p) => s + p.y, 0) / m.length };
            });
            const moved = newCents.some((c, i) => Math.abs(c.x - centroids[i].x) > 0.1 || Math.abs(c.y - centroids[i].y) > 0.1);
            setCentroids(newCents);
            setIter(v => v + 1);
            if (!moved) {
                setDone(true);
                setMsg('✅ 圆心不再移动！K-means 完成，分组稳定！');
            } else {
                setPhase(2);
                setMsg(`圆心已移到新位置（⭐），继续下一轮归队 →`);
            }
        }
    };

    const reset = () => {
        setPoints(makePoints());
        setCentroids(makeCentroids());
        setIter(0);
        setPhase(0);
        setDone(false);
        setMsg('3 个圆心（⭐）已随机放置，点击「下一步」开始！');
    };

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3 flex items-center shrink-0">
                <i className="fas fa-play-circle mr-4 text-teal-500"></i> K-means 分步演示：看圆心怎么「找到家」
            </h2>

            <div className="flex-1 flex flex-col md:flex-row gap-4">
                <div className="relative bg-slate-50 rounded-2xl border-2 border-slate-200 shadow-inner flex-1 min-h-[260px] md:min-h-0">
                    {points.map((p, i) => (
                        <div key={i} className="absolute transition-all duration-500" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}>
                            <div className="w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-white shadow-md"
                                style={{ backgroundColor: p.cluster >= 0 ? COLORS[p.cluster].bg : '#94a3b8' }}></div>
                        </div>
                    ))}
                    {centroids.map((c, i) => (
                        <div key={i} className="absolute transition-all duration-700" style={{ left: `${c.x}%`, top: `${c.y}%`, transform: 'translate(-50%, -50%)' }}>
                            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white text-sm font-black"
                                style={{ backgroundColor: COLORS[i].bg }}>⭐</div>
                        </div>
                    ))}
                </div>

                <div className="w-full md:w-60 shrink-0 flex flex-col gap-3">
                    <div className="flex gap-2">
                        <button onClick={nextStep} disabled={done}
                            className="flex-1 bg-teal-500 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-teal-600 transition-colors">
                            {done ? '已完成 ✅' : '下一步 →'}
                        </button>
                        <button onClick={reset} className="px-3 py-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 font-bold text-sm">重置</button>
                    </div>

                    <div className="bg-teal-50 p-3 rounded-xl border border-teal-200 text-sm text-teal-800 font-bold leading-relaxed">
                        📍 {msg}
                    </div>

                    <div className="flex flex-col gap-2">
                        {COLORS.map((c, i) => {
                            const count = points.filter(p => p.cluster === i).length;
                            return (
                                <div key={i} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 text-xs md:text-sm">
                                    <div className="w-4 h-4 rounded-full border-2 border-white shadow shrink-0" style={{ backgroundColor: c.bg }}></div>
                                    <span className="font-bold text-slate-700">{c.name}</span>
                                    <span className="ml-auto text-slate-500">{count} 个点</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
                        <strong>第 {iter} 轮迭代</strong><br />
                        灰色 = 未分配；⭐ = 圆心（组长）<br />
                        💡 注意圆心是如何逐步漂移到每组中心的！
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---- 8. 对比 ----
function CompareSlide() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-balance-scale mr-4 text-purple-500"></i> 两招对比：什么时候用哪个？
            </h2>

            <div className="flex-1 overflow-x-auto flex items-start justify-center no-scrollbar">
                <table className="w-full min-w-[600px] max-w-5xl text-left border-collapse rounded-xl overflow-hidden shadow-xl border border-slate-200 text-sm md:text-base">
                    <thead>
                        <tr className="text-white text-base md:text-lg">
                            <th className="p-4 md:p-5 bg-slate-600 w-1/4">对比项</th>
                            <th className="p-4 md:p-5 bg-green-600">KNN（找邻居）</th>
                            <th className="p-4 md:p-5 bg-teal-600 border-l border-white/20">K-means（找圆心）</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {[
                            ['学习方式', '有监督（需要标签）', '无监督（不需要标签）'],
                            ['做什么', '给新数据判断它属于哪个已知类别', '把一堆数据自动分成 K 堆'],
                            ['需要提前准备', '带标签的训练数据（例题+答案）', '只需原始数据，指定 K 值'],
                            ['人脸应用场景', '认出「这是哪位同学」', '把陌生顾客自动分成「几类人群」'],
                            ['生活比喻', '新同学问周围邻座：你们喜欢啥？', '老师把全班按兴趣自动分成学习小组'],
                        ].map(([item, knn, km], i) => (
                            <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/60'} transition-colors`}>
                                <td className="p-4 font-bold text-slate-700">{item}</td>
                                <td className="p-4 text-slate-600 border-l border-slate-100 bg-green-50/40">{knn}</td>
                                <td className="p-4 text-slate-600 border-l border-slate-100 bg-teal-50/40">{km}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-5 bg-purple-50 p-4 md:p-5 rounded-xl border border-purple-100 text-center shrink-0">
                <p className="text-purple-800 font-bold text-base md:text-xl">
                    🔗 两者都在「特征空间」里计算「距离」——这就是为什么上节课 CNN 输出的 128 个数字那么关键！<br />
                    <span className="font-normal text-slate-600 text-sm md:text-base">数字代表了位置，距离近 = 越相似。</span>
                </p>
            </div>
        </div>
    );
}

// ---- 9. 总结页 ----
function SummarySlide() {
    return (
        <div className="flex flex-col h-full p-8 md:p-12 bg-gradient-to-br from-slate-50 via-white to-green-50 overflow-y-auto no-scrollbar">
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-800 mb-8 md:mb-10 text-center mt-4 tracking-wide">知识大丰收</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto w-full">
                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border-l-8 border-green-500 hover:-translate-y-2 transition-transform">
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 flex items-center">
                        <i className="fas fa-users mr-3 text-green-500 text-2xl md:text-3xl"></i> KNN
                    </h3>
                    <ul className="list-disc list-inside text-slate-600 space-y-3 leading-relaxed text-base md:text-xl">
                        <li>有监督学习，需要<strong>提前打好标签</strong>。</li>
                        <li>找 K 个最近邻居，<strong>投票决定分类</strong>。</li>
                        <li>适合：认出已知的人或类别。</li>
                    </ul>
                </div>

                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border-l-8 border-teal-500 hover:-translate-y-2 transition-transform">
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 flex items-center">
                        <i className="fas fa-bullseye mr-3 text-teal-500 text-2xl md:text-3xl"></i> K-means
                    </h3>
                    <ul className="list-disc list-inside text-slate-600 space-y-3 leading-relaxed text-base md:text-xl">
                        <li>无监督学习，<strong>不需要任何标签</strong>。</li>
                        <li>迭代更新圆心，直到分组<strong>自然稳定</strong>。</li>
                        <li>适合：对陌生数据自动分堆探索。</li>
                    </ul>
                </div>

                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border-l-8 border-purple-500 hover:-translate-y-2 transition-transform lg:col-span-2">
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 flex items-center">
                        <i className="fas fa-link mr-3 text-purple-500 text-2xl md:text-3xl"></i> 两节课的完整 AI 视觉流程
                    </h3>
                    <div className="flex flex-wrap md:flex-nowrap items-center justify-center gap-3 text-sm md:text-base font-bold text-slate-700">
                        <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-200 text-center">📷<br />图像输入</div>
                        <i className="fas fa-arrow-right text-slate-300 text-xl hidden md:block"></i>
                        <div className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-200 text-center">🧠<br />CNN 提取<br />128个特征</div>
                        <i className="fas fa-arrow-right text-slate-300 text-xl hidden md:block"></i>
                        <div className="bg-green-50 px-4 py-2 rounded-xl border border-green-200 text-center">👥<br />KNN 识别<br />已知身份</div>
                        <span className="text-slate-400 font-normal text-sm">或</span>
                        <div className="bg-teal-50 px-4 py-2 rounded-xl border border-teal-200 text-center">🎯<br />K-means<br />自动分群</div>
                    </div>
                </div>
            </div>

            <div className="mt-8 md:mt-10 text-center max-w-4xl mx-auto bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 md:p-8 rounded-2xl shadow-2xl">
                <h3 className="text-2xl md:text-3xl font-extrabold mb-3 flex items-center justify-center">
                    课后思考 <i className="fas fa-brain ml-3 text-yellow-300"></i>
                </h3>
                <p className="opacity-95 text-lg md:text-xl leading-relaxed font-medium">
                    K-means 可以在没有人告诉它「正确答案」的情况下自动发现规律。<br />
                    除了人脸分群，你觉得这种「自动发现规律」的能力还能用在生活中的哪些地方？
                </p>
            </div>
        </div>
    );
}

// ========================================================
// 🎯 课程配置
// ========================================================

const mySlides = [
    { id: 'intro',         component: <IntroSlide /> },
    { id: 'review',        component: <ReviewSlide /> },
    { id: 'feature-space', component: <FeatureSpaceSlide /> },
    { id: 'knn-intro',     component: <KNNIntroSlide /> },
    { id: 'knn-demo',      component: <KNNDemoSlide /> },
    { id: 'kmeans-intro',  component: <KMeansIntroSlide /> },
    { id: 'kmeans-demo',   component: <KMeansDemoSlide /> },
    { id: 'compare',       component: <CompareSlide /> },
    { id: 'summary',       component: <SummarySlide /> },
];

window.CourseData = {
    title: "KNN 与 K-means 特征分类",
    icon: "🎯",
    desc: "从特征空间出发，理解有监督的 KNN 与无监督的 K-means 分类算法",
    color: "from-green-500 to-teal-600",
    dependencies: [],
    slides: mySlides
};
