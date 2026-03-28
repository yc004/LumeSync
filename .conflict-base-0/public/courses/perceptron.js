// ========================================================
// 🎨 课程内容：感知机 - 人工智能的"神经元"
// ========================================================

const { useState, useEffect, useRef } = React;

// ========================================================
// 幻灯片 1: 标题页
// ========================================================
function IntroSlide() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-blue-50 via-white to-purple-50">
            <div className="w-32 md:w-40 h-32 md:h-40 bg-blue-100 rounded-full flex items-center justify-center shadow-inner border-4 border-white">
                <i className="fas fa-brain text-blue-600 text-6xl md:text-[80px] drop-shadow-md"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 tracking-tight">
                感知机
            </h1>
            <h2 className="text-xl md:text-3xl font-bold text-slate-600 mt-4 tracking-wide">
                人工智能的"神经元"
            </h2>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500 mt-6 leading-relaxed bg-white/80 p-6 rounded-2xl shadow-sm">
                你知道吗？人工智能的基础竟然和我们的神经元很像！
                <br />今天，让我们一起探索这个神奇的"小开关"是如何帮助机器"思考"的。
            </p>
            <div className="flex items-center gap-4 mt-4">
                <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    <i className="fas fa-user-graduate mr-2"></i>八年级信息科技
                </span>
                <span className="px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                    <i className="fas fa-clock mr-2"></i>约 25 分钟
                </span>
            </div>
        </div>
    );
}

// ========================================================
// 幻灯片 2: 目录页
// ========================================================
function OutlineSlide() {
    const topics = [
        { icon: "fa-question-circle", title: "什么是感知机", desc: "从生活中的例子理解感知机" },
        { icon: "fa-cogs", title: "工作原理", desc: "权重、阈值与决策过程" },
        { icon: "fa-hands", title: "动手实践", desc: "手工模拟感知机决策" },
        { icon: "fa-laptop-code", title: "互动演示", desc: "在线调整参数看效果" },
        { icon: "fa-rocket", title: "实际应用", desc: "感知机在AI中的应用" },
    ];

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 flex items-center shrink-0">
                <i className="fas fa-list-check mr-4 text-blue-500"></i> 课程导航
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
                {topics.map((topic, index) => (
                    <div key={index} className="bg-gradient-to-br from-blue-50 to-purple-50 p-5 rounded-2xl border border-blue-100 hover:shadow-lg transition-all duration-300 hover:scale-105">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
                                <i className={`fas ${topic.icon} text-white text-xl`}></i>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{index + 1}. {topic.title}</h3>
                                <p className="text-slate-500 text-sm mt-1">{topic.desc}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <p className="text-amber-700 text-center">
                    <i className="fas fa-lightbulb mr-2"></i>
                    <strong>学习目标：</strong>理解感知机的基本原理，能够用感知机解决简单的分类问题
                </p>
            </div>
        </div>
    );
}

// ========================================================
// 幻灯片 3: 什么是感知机
// ========================================================
function WhatIsSlide() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-question-circle mr-4 text-blue-500"></i> 什么是感知机？
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 flex-1">
                {/* 左侧：生活例子 */}
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                    <h3 className="text-xl font-bold text-blue-700 mb-4 flex items-center">
                        <i className="fas fa-lightbulb mr-2"></i>生活中的"感知机"
                    </h3>
                    
                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm">
                            <h4 className="font-bold text-slate-700 mb-2">🎬 周末去看电影吗？</h4>
                            <p className="text-slate-600 text-sm">
                                你会考虑：<strong>天气好不好？</strong> <strong>作业写完没？</strong> <strong>有朋友一起吗？</strong>
                                <br />如果"好处"加起来够多，就去看电影！
                            </p>
                        </div>
                        
                        <div className="bg-white p-4 rounded-xl shadow-sm">
                            <h4 className="font-bold text-slate-700 mb-2">🗳️ 班级投票</h4>
                            <p className="text-slate-600 text-sm">
                                每个人投一票，<strong>超过半数</strong>就通过！
                                <br />这就是最简单的"感知"决策。
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* 右侧：感知机定义 */}
                <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
                    <h3 className="text-xl font-bold text-purple-700 mb-4 flex items-center">
                        <i className="fas fa-robot mr-2"></i>感知机的定义
                    </h3>
                    
                    <div className="bg-white p-5 rounded-xl shadow-sm mb-4">
                        <p className="text-slate-700 leading-relaxed">
                            <strong>感知机（Perceptron）</strong>是一种最简单的<strong>人工神经网络</strong>，
                            由美国科学家弗兰克·罗森布拉特在1957年发明。
                        </p>
                        <p className="text-slate-600 mt-3 text-sm">
                            它就像一个"电子开关"，接收多个信号，经过计算后输出一个结果：
                            <strong className="text-blue-600">是</strong> 或 <strong className="text-red-600">否</strong>。
                        </p>
                    </div>
                    
                    <div className="flex items-center justify-center gap-4">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
                                <i className="fas fa-signature text-white text-2xl"></i>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">输入信号</p>
                        </div>
                        <i className="fas fa-arrow-right text-slate-400"></i>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto">
                                <i className="fas fa-calculator text-white text-2xl"></i>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">计算判断</p>
                        </div>
                        <i className="fas fa-arrow-right text-slate-400"></i>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                                <i className="fas fa-check text-white text-2xl"></i>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">输出结果</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-green-700 text-center">
                    <i className="fas fa-brain mr-2"></i>
                    <strong>关键理解：</strong>感知机就是一个"加权投票"系统，每个输入都有"话语权"（权重）！
                </p>
            </div>
        </div>
    );
}

// ========================================================
// 幻灯片 4: 工作原理
// ========================================================
function HowItWorksSlide() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-cogs mr-4 text-blue-500"></i> 感知机如何工作？
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 flex-1">
                {/* 左侧：公式解释 */}
                <div className="space-y-4">
                    <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                        <h3 className="text-lg font-bold text-blue-700 mb-3">
                            <i className="fas fa-calculator mr-2"></i>核心公式
                        </h3>
                        <div className="bg-white p-4 rounded-xl text-center">
                            <p className="text-2xl font-mono text-slate-800">
                                输出 = <span className="text-blue-600">加权和</span> ≥ <span className="text-purple-600">阈值</span> ?
                            </p>
                        </div>
                    </div>
                    
                    <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                        <h3 className="text-lg font-bold text-purple-700 mb-3">
                            <i className="fas fa-balance-scale mr-2"></i>三个关键概念
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3 bg-white p-3 rounded-xl">
                                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
                                    <span className="text-white font-bold">x</span>
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700">输入 (Input)</p>
                                    <p className="text-sm text-slate-500">外界传来的信号，比如：天气=1(好)，作业=0(没写完)</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 bg-white p-3 rounded-xl">
                                <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center shrink-0">
                                    <span className="text-white font-bold">w</span>
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700">权重 (Weight)</p>
                                    <p className="text-sm text-slate-500">每个输入的"重要程度"，权重越大影响越大</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 bg-white p-3 rounded-xl">
                                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center shrink-0">
                                    <span className="text-white font-bold">θ</span>
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700">阈值 (Threshold)</p>
                                    <p className="text-sm text-slate-500">触发"是"的最低分数，就像及格线</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* 右侧：图解 */}
                <div className="bg-gradient-to-br from-slate-50 to-blue-50 p-5 rounded-2xl border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-700 mb-4 text-center">
                        <i className="fas fa-project-diagram mr-2"></i>感知机结构图
                    </h3>
                    
                    {/* SVG 图示 */}
                    <div className="bg-white p-4 rounded-xl">
                        <svg viewBox="0 0 300 200" className="w-full h-auto">
                            {/* 输入节点 */}
                            <circle cx="50" cy="50" r="20" fill="#3b82f6" />
                            <text x="50" y="55" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">x₁</text>
                            
                            <circle cx="50" cy="100" r="20" fill="#3b82f6" />
                            <text x="50" y="105" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">x₂</text>
                            
                            <circle cx="50" cy="150" r="20" fill="#3b82f6" />
                            <text x="50" y="155" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">x₃</text>
                            
                            {/* 权重标签 */}
                            <text x="100" y="45" fill="#8b5cf6" fontSize="12" fontWeight="bold">w₁</text>
                            <text x="100" y="95" fill="#8b5cf6" fontSize="12" fontWeight="bold">w₂</text>
                            <text x="100" y="145" fill="#8b5cf6" fontSize="12" fontWeight="bold">w₃</text>
                            
                            {/* 连接线 */}
                            <line x1="70" y1="50" x2="150" y2="100" stroke="#8b5cf6" strokeWidth="2" />
                            <line x1="70" y1="100" x2="150" y2="100" stroke="#8b5cf6" strokeWidth="2" />
                            <line x1="70" y1="150" x2="150" y2="100" stroke="#8b5cf6" strokeWidth="2" />
                            
                            {/* 神经元 */}
                            <circle cx="170" cy="100" r="30" fill="#8b5cf6" />
                            <text x="170" y="95" textAnchor="middle" fill="white" fontSize="10">Σ wx</text>
                            <text x="170" y="110" textAnchor="middle" fill="white" fontSize="10">≥ θ?</text>
                            
                            {/* 输出 */}
                            <line x1="200" y1="100" x2="250" y2="100" stroke="#10b981" strokeWidth="3" />
                            <circle cx="270" cy="100" r="20" fill="#10b981" />
                            <text x="270" y="105" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">y</text>
                            
                            {/* 标签 */}
                            <text x="50" y="180" textAnchor="middle" fill="#64748b" fontSize="11">输入层</text>
                            <text x="170" y="180" textAnchor="middle" fill="#64748b" fontSize="11">计算层</text>
                            <text x="270" y="180" textAnchor="middle" fill="#64748b" fontSize="11">输出</text>
                        </svg>
                    </div>
                    
                    <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                        <p className="text-sm text-amber-700">
                            <i className="fas fa-info-circle mr-1"></i>
                            <strong>计算过程：</strong>
                            y = 1 如果 (w₁×x₁ + w₂×x₂ + w₃×x₃) ≥ θ
                            <br />否则 y = 0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ========================================================
// 幻灯片 5: 动手实践 - 手工模拟
// ========================================================
function HandsOnSlide() {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState({});
    
    const scenario = {
        title: "🎯 场景：要不要去游乐园？",
        inputs: [
            { name: "天气晴朗", value: 1, weight: 0.4 },
            { name: "作业完成", value: 1, weight: 0.3 },
            { name: "零花钱够", value: 0, weight: 0.3 },
        ],
        threshold: 0.5
    };
    
    const calculation = scenario.inputs.reduce((sum, input) => sum + input.value * input.weight, 0);
    const result = calculation >= scenario.threshold;
    
    const steps = [
        { title: "第一步：列出输入", content: "看看每个条件是否满足（满足=1，不满足=0）" },
        { title: "第二步：乘以权重", content: "每个输入值乘以它对应的权重" },
        { title: "第三步：求和", content: "把所有乘积加起来得到总分" },
        { title: "第四步：比较阈值", content: "总分是否达到或超过阈值？" },
    ];

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4 flex items-center shrink-0">
                <i className="fas fa-hands mr-4 text-blue-500"></i> 动手实践：手工模拟感知机
            </h2>
            
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-xl border border-amber-200 mb-4">
                <p className="text-amber-800">
                    <i className="fas fa-pencil-alt mr-2"></i>
                    <strong>任务：</strong>拿出纸笔，跟着步骤一起计算！
                </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 flex-1">
                {/* 左侧：场景和计算 */}
                <div className="space-y-4">
                    <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                        <h3 className="text-lg font-bold text-blue-700 mb-3">{scenario.title}</h3>
                        <div className="space-y-2">
                            {scenario.inputs.map((input, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-xl">
                                    <span className="font-medium text-slate-700">{input.name}</span>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${input.value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            值: {input.value}
                                        </span>
                                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-bold">
                                            权重: {input.weight}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 p-3 bg-purple-100 rounded-xl text-center">
                            <span className="text-purple-700 font-bold">阈值 θ = {scenario.threshold}</span>
                        </div>
                    </div>
                    
                    {/* 计算过程 */}
                    <div className="bg-green-50 p-5 rounded-2xl border border-green-100">
                        <h3 className="text-lg font-bold text-green-700 mb-3">
                            <i className="fas fa-calculator mr-2"></i>计算过程
                        </h3>
                        <div className="bg-white p-4 rounded-xl font-mono text-sm space-y-2">
                            <p className="text-slate-600">加权和 = </p>
                            {scenario.inputs.map((input, idx) => (
                                <p key={idx} className="text-blue-600 ml-4">
                                    {input.weight} × {input.value} = <strong>{(input.weight * input.value).toFixed(2)}</strong>
                                    {idx < scenario.inputs.length - 1 && ' + '}
                                </p>
                            ))}
                            <p className="text-slate-800 border-t pt-2 mt-2">
                                总分 = <strong className="text-purple-600">{calculation.toFixed(2)}</strong>
                            </p>
                            <p className="text-slate-800">
                                比较: {calculation.toFixed(2)} {result ? '≥' : '<'} {scenario.threshold}
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* 右侧：步骤引导 */}
                <div className="space-y-4">
                    <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                        <h3 className="text-lg font-bold text-purple-700 mb-4">
                            <i className="fas fa-list-ol mr-2"></i>计算步骤
                        </h3>
                        <div className="space-y-3">
                            {steps.map((s, idx) => (
                                <div 
                                    key={idx} 
                                    className={`p-3 rounded-xl transition-all cursor-pointer ${
                                        step === idx 
                                            ? 'bg-purple-500 text-white shadow-lg scale-105' 
                                            : 'bg-white text-slate-700 hover:bg-purple-100'
                                    }`}
                                    onClick={() => setStep(idx)}
                                >
                                    <p className="font-bold">{s.title}</p>
                                    <p className={`text-sm ${step === idx ? 'text-purple-100' : 'text-slate-500'}`}>
                                        {s.content}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* 结果 */}
                    <div className={`p-5 rounded-2xl border-2 ${result ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                        <div className="text-center">
                            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${result ? 'bg-green-500' : 'bg-red-500'}`}>
                                <i className={`fas ${result ? 'fa-check' : 'fa-times'} text-white text-3xl`}></i>
                            </div>
                            <h4 className={`text-xl font-bold mt-3 ${result ? 'text-green-700' : 'text-red-700'}`}>
                                决策结果：{result ? '去游乐园！' : '不去游乐园'}
                            </h4>
                            <p className="text-slate-600 mt-2">
                                因为 {calculation.toFixed(2)} {result ? '≥' : '<'} {scenario.threshold}（阈值）
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ========================================================
// 幻灯片 6: 互动演示 - 在线感知机
// ========================================================
function InteractiveDemoSlide() {
    const [inputs, setInputs] = useState([
        { name: "条件A", value: 1, weight: 0.4 },
        { name: "条件B", value: 1, weight: 0.3 },
        { name: "条件C", value: 0, weight: 0.3 },
    ]);
    const [threshold, setThreshold] = useState(0.5);
    
    const updateInput = (idx, field, newValue) => {
        const newInputs = [...inputs];
        newInputs[idx][field] = newValue;
        setInputs(newInputs);
    };
    
    const addInput = () => {
        if (inputs.length < 5) {
            setInputs([...inputs, { name: `条件${String.fromCharCode(65 + inputs.length)}`, value: 0, weight: 0.2 }]);
        }
    };
    
    const removeInput = (idx) => {
        if (inputs.length > 2) {
            setInputs(inputs.filter((_, i) => i !== idx));
        }
    };
    
    const totalWeight = inputs.reduce((sum, input) => sum + input.value * input.weight, 0);
    const result = totalWeight >= threshold;
    
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4 flex items-center shrink-0">
                <i className="fas fa-laptop-code mr-4 text-blue-500"></i> 互动演示：调整参数看效果
            </h2>
            
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 rounded-xl border border-blue-200 mb-4">
                <p className="text-blue-700 text-center">
                    <i className="fas fa-hand-pointer mr-2"></i>
                    <strong>动手试试：</strong>拖动滑块调整权重和阈值，观察决策结果的变化！
                </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 flex-1">
                {/* 左侧：控制面板 */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center justify-between">
                        <span><i className="fas fa-sliders-h mr-2"></i>参数调整</span>
                        <button 
                            onClick={addInput}
                            disabled={inputs.length >= 5}
                            className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className="fas fa-plus mr-1"></i>添加输入
                        </button>
                    </h3>
                    
                    <div className="space-y-4">
                        {inputs.map((input, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-xl shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <input 
                                        type="text" 
                                        value={input.name}
                                        onChange={(e) => updateInput(idx, 'name', e.target.value)}
                                        className="font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none"
                                    />
                                    {inputs.length > 2 && (
                                        <button 
                                            onClick={() => removeInput(idx)}
                                            className="text-red-400 hover:text-red-600"
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    )}
                                </div>
                                
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-slate-500 w-12">输入值:</span>
                                        <div className="flex gap-1">
                                            {[0, 1].map(v => (
                                                <button
                                                    key={v}
                                                    onClick={() => updateInput(idx, 'value', v)}
                                                    className={`px-4 py-1 rounded-lg font-bold transition-all ${
                                                        input.value === v 
                                                            ? (v ? 'bg-green-500 text-white' : 'bg-red-500 text-white')
                                                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                    }`}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-slate-500 w-12">权重:</span>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="1" 
                                            step="0.1"
                                            value={input.weight}
                                            onChange={(e) => updateInput(idx, 'weight', parseFloat(e.target.value))}
                                            className="flex-1 accent-purple-500"
                                        />
                                        <span className="text-purple-600 font-bold w-10 text-right">{input.weight.toFixed(1)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {/* 阈值调整 */}
                    <div className="mt-4 p-4 bg-purple-100 rounded-xl">
                        <div className="flex items-center gap-3">
                            <span className="text-purple-700 font-bold">阈值 θ:</span>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.1"
                                value={threshold}
                                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                className="flex-1 accent-purple-600"
                            />
                            <span className="text-purple-700 font-bold w-10 text-right">{threshold.toFixed(1)}</span>
                        </div>
                    </div>
                </div>
                
                {/* 右侧：可视化结果 */}
                <div className="space-y-4">
                    <div className="bg-white p-5 rounded-2xl border-2 border-slate-200">
                        <h3 className="text-lg font-bold text-slate-700 mb-4">
                            <i className="fas fa-chart-bar mr-2"></i>计算可视化
                        </h3>
                        
                        {/* 条形图 */}
                        <div className="space-y-3">
                            {inputs.map((input, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <span className="w-20 text-sm text-slate-600 truncate">{input.name}</span>
                                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300"
                                            style={{ width: `${input.value * input.weight * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-sm font-mono text-slate-600 w-16 text-right">
                                        {(input.value * input.weight).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                        
                        {/* 总分和阈值线 */}
                        <div className="mt-4 relative h-8 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-300 ${result ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`}
                                style={{ width: `${Math.min(totalWeight * 100, 100)}%` }}
                            ></div>
                            <div 
                                className="absolute top-0 bottom-0 w-1 bg-yellow-500"
                                style={{ left: `${threshold * 100}%` }}
                            >
                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-yellow-600 font-bold">阈值</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* 结果显示 */}
                    <div className={`p-6 rounded-2xl text-center ${result ? 'bg-green-100 border-2 border-green-400' : 'bg-red-100 border-2 border-red-400'}`}>
                        <div className="text-4xl mb-2">
                            {result ? '✅' : '❌'}
                        </div>
                        <h4 className={`text-2xl font-bold ${result ? 'text-green-700' : 'text-red-700'}`}>
                            输出: {result ? '1 (是)' : '0 (否)'}
                        </h4>
                        <p className="text-slate-600 mt-2">
                            总分 {totalWeight.toFixed(2)} {result ? '≥' : '<'} 阈值 {threshold.toFixed(1)}
                        </p>
                    </div>
                    
                    {/* 思考题 */}
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                        <p className="text-amber-700">
                            <i className="fas fa-question-circle mr-2"></i>
                            <strong>思考：</strong>如何调整参数让结果从"否"变成"是"？
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ========================================================
// 幻灯片 7: 实际应用
// ========================================================
function ApplicationsSlide() {
    const applications = [
        {
            icon: "fa-envelope",
            title: "垃圾邮件过滤",
            desc: "分析邮件特征（发件人、关键词等），判断是否为垃圾邮件",
            color: "blue"
        },
        {
            icon: "fa-hand-paper",
            title: "手写数字识别",
            desc: "识别手写数字0-9，是早期AI的重要应用",
            color: "purple"
        },
        {
            icon: "fa-heartbeat",
            title: "医疗诊断辅助",
            desc: "根据症状和检查结果，辅助判断疾病风险",
            color: "red"
        },
        {
            icon: "fa-credit-card",
            title: "信用卡欺诈检测",
            desc: "分析交易模式，识别可疑的刷卡行为",
            color: "green"
        },
    ];

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 flex items-center shrink-0">
                <i className="fas fa-rocket mr-4 text-blue-500"></i> 感知机的实际应用
            </h2>
            
            <div className="grid md:grid-cols-2 gap-4 flex-1">
                {applications.map((app, idx) => (
                    <div key={idx} className={`bg-${app.color}-50 p-5 rounded-2xl border border-${app.color}-100 hover:shadow-lg transition-all`}>
                        <div className="flex items-start gap-4">
                            <div className={`w-14 h-14 bg-${app.color}-500 rounded-xl flex items-center justify-center shrink-0`}>
                                <i className={`fas ${app.icon} text-white text-2xl`}></i>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{app.title}</h3>
                                <p className="text-slate-600 text-sm mt-1">{app.desc}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-4 grid md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                    <h3 className="font-bold text-blue-700 mb-3 flex items-center">
                        <i className="fas fa-history mr-2"></i>历史意义
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed">
                        感知机是人工智能发展史上的里程碑。虽然单个感知机能力有限，
                        但它奠定了现代深度学习的基础。今天的ChatGPT、图像识别等技术，
                        都是由成千上万个"感知机"组成的神经网络实现的！
                    </p>
                </div>
                
                <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                    <h3 className="font-bold text-purple-700 mb-3 flex items-center">
                        <i className="fas fa-layer-group mr-2"></i>从感知机到深度学习
                    </h3>
                    <div className="flex items-center justify-center gap-2 text-sm">
                        <div className="px-3 py-2 bg-white rounded-lg shadow-sm">
                            <p className="font-bold text-slate-700">感知机</p>
                            <p className="text-xs text-slate-500">1层</p>
                        </div>
                        <i className="fas fa-arrow-right text-slate-400"></i>
                        <div className="px-3 py-2 bg-white rounded-lg shadow-sm">
                            <p className="font-bold text-slate-700">神经网络</p>
                            <p className="text-xs text-slate-500">多层</p>
                        </div>
                        <i className="fas fa-arrow-right text-slate-400"></i>
                        <div className="px-3 py-2 bg-purple-500 text-white rounded-lg shadow-sm">
                            <p className="font-bold">深度学习</p>
                            <p className="text-xs text-purple-200">数十层</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ========================================================
// 幻灯片 8: 总结
// ========================================================
function SummarySlide() {
    const keyPoints = [
        { icon: "fa-brain", text: "感知机是一种简单的\"决策机器\"，接收输入，输出是或否" },
        { icon: "fa-balance-scale", text: "权重决定每个输入的重要程度，阈值决定触发条件" },
        { icon: "fa-calculator", text: "计算公式：加权和 ≥ 阈值 → 输出1，否则输出0" },
        { icon: "fa-rocket", text: "感知机是现代AI的基础，深度学习由大量感知机组成" },
    ];

    return (
        <div className="flex flex-col items-center justify-center min-h-full p-8 md:p-12 bg-gradient-to-br from-blue-50 via-white to-purple-50">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg mb-6">
                <i className="fas fa-graduation-cap text-white text-4xl"></i>
            </div>
            
            <h2 className="text-3xl md:text-5xl font-bold text-slate-800 mb-8 text-center">
                课程总结
            </h2>
            
            <div className="max-w-3xl w-full space-y-4">
                {keyPoints.map((point, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-all">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                            <i className={`fas ${point.icon} text-blue-600 text-xl`}></i>
                        </div>
                        <p className="text-slate-700">{point.text}</p>
                    </div>
                ))}
            </div>
            
            <div className="mt-8 p-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl text-white text-center max-w-2xl">
                <h3 className="text-xl font-bold mb-2">
                    <i className="fas fa-lightbulb mr-2"></i>课后思考
                </h3>
                <p className="text-blue-100">
                    如果让你设计一个感知机来判断"今天适合运动吗？"，
                    你会设置哪些输入条件？每个条件的权重应该是多少？
                </p>
            </div>
            
            <div className="mt-6 flex items-center gap-4">
                <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    <i className="fas fa-check-circle mr-2"></i>课程完成
                </span>
                <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    <i className="fas fa-redo mr-2"></i>可以重新学习
                </span>
            </div>
        </div>
    );
}

// ========================================================
// 导出课程数据
// ========================================================
const mySlides = [
    { id: 'intro', component: <IntroSlide /> },
    { id: 'outline', component: <OutlineSlide /> },
    { id: 'what-is', component: <WhatIsSlide /> },
    { id: 'how-it-works', component: <HowItWorksSlide /> },
    { id: 'hands-on', component: <HandsOnSlide /> },
    { id: 'interactive', component: <InteractiveDemoSlide /> },
    { id: 'applications', component: <ApplicationsSlide /> },
    { id: 'summary', component: <SummarySlide /> },
];

window.CourseData = {
    title: "感知机：人工智能的神经元",
    icon: "🧠",
    desc: "探索AI基础单元，理解感知机的工作原理",
    color: "from-blue-500 to-purple-600",
    dependencies: [],
    slides: mySlides
};
