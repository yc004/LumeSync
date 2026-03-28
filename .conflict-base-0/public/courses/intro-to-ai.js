// ========================================================
// 🎨 课程内容：AI 基础导论
// ========================================================

const { useState, useEffect, useRef } = React;

// ================= SLIDE COMPONENTS =================

function Slide1() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 space-y-8 bg-gradient-to-br from-green-50 via-white to-teal-50">
            <div className="w-32 md:w-40 h-32 md:h-40 bg-green-100 rounded-full flex items-center justify-center shadow-inner border-4 border-white">
                <i className="fas fa-brain text-green-600 text-6xl md:text-[80px] drop-shadow-md"></i>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-teal-600 tracking-tight">
                人工智能基础导论
            </h1>
            <h2 className="text-xl md:text-3xl font-bold text-slate-600 mt-4 tracking-wide">
                开启 AI 学习之旅
            </h2>
            <p className="max-w-3xl text-lg md:text-xl text-slate-500 mt-6 leading-relaxed bg-white/80 p-6 rounded-2xl shadow-sm">
                人工智能正在改变我们的世界。<br/>
                让我们一起探索这个令人兴奋的领域！
            </p>
        </div>
    );
}

function Slide2() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 flex items-center">
                <i className="fas fa-lightbulb mr-4 text-yellow-500"></i> 什么是人工智能？
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                    <h3 className="text-xl font-bold text-blue-800 mb-4">🎯 定义</h3>
                    <p className="text-slate-600 leading-relaxed">
                        人工智能（AI）是计算机科学的一个分支，致力于创造能够执行通常需要人类智能的任务的系统。
                    </p>
                </div>
                
                <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                    <h3 className="text-xl font-bold text-green-800 mb-4">💡 应用</h3>
                    <ul className="text-slate-600 space-y-2">
                        <li><i className="fas fa-check text-green-500 mr-2"></i>语音识别</li>
                        <li><i className="fas fa-check text-green-500 mr-2"></i>图像识别</li>
                        <li><i className="fas fa-check text-green-500 mr-2"></i>自然语言处理</li>
                        <li><i className="fas fa-check text-green-500 mr-2"></i>自动驾驶</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

function Slide3() {
    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-8 flex items-center">
                <i className="fas fa-robot mr-4 text-purple-500"></i> AI 的发展历史
            </h2>
            
            <div className="space-y-4">
                <div className="flex items-start space-x-4 p-4 bg-slate-50 rounded-xl">
                    <div className="w-20 text-center font-bold text-slate-500">1950s</div>
                    <div>
                        <h4 className="font-bold text-slate-800">图灵测试</h4>
                        <p className="text-slate-600 text-sm">艾伦·图灵提出了判断机器是否具有智能的标准</p>
                    </div>
                </div>
                
                <div className="flex items-start space-x-4 p-4 bg-slate-50 rounded-xl">
                    <div className="w-20 text-center font-bold text-slate-500">1980s</div>
                    <div>
                        <h4 className="font-bold text-slate-800">专家系统</h4>
                        <p className="text-slate-600 text-sm">基于规则的人工智能系统开始商业化应用</p>
                    </div>
                </div>
                
                <div className="flex items-start space-x-4 p-4 bg-slate-50 rounded-xl">
                    <div className="w-20 text-center font-bold text-slate-500">2010s</div>
                    <div>
                        <h4 className="font-bold text-slate-800">深度学习革命</h4>
                        <p className="text-slate-600 text-sm">神经网络和大数据推动了 AI 的爆发式发展</p>
                    </div>
                </div>
                
                <div className="flex items-start space-x-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="w-20 text-center font-bold text-blue-600">2020s</div>
                    <div>
                        <h4 className="font-bold text-blue-800">大模型时代</h4>
                        <p className="text-slate-600 text-sm">GPT、ChatGPT 等大语言模型引领新一轮 AI 浪潮</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Slide4() {
    return (
        <div className="flex flex-col items-center justify-center min-h-full text-center p-8 md:p-12 bg-gradient-to-br from-purple-50 via-white to-pink-50">
            <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mb-6">
                <i className="fas fa-rocket text-purple-600 text-4xl"></i>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-800 mb-6">
                开始你的 AI 之旅
            </h2>
            <p className="max-w-2xl text-lg md:text-xl text-slate-600 mb-8">
                人工智能的未来由你创造！<br/>
                继续学习，探索无限可能。
            </p>
            <div className="flex space-x-4">
                <span className="px-6 py-3 bg-purple-500 text-white rounded-full font-bold">
                    <i className="fas fa-star mr-2"></i>加油！
                </span>
            </div>
        </div>
    );
}

// ================= COURSE DATA =================

const mySlides = [
    { id: 's1', component: <Slide1 /> },
    { id: 's2', component: <Slide2 /> },
    { id: 's3', component: <Slide3 /> },
    { id: 's4', component: <Slide4 /> }
];

window.CourseData = {
    title: "人工智能基础导论",
    icon: "🌟",
    desc: "AI 入门第一课，了解人工智能的基本概念和发展历程",
    color: "from-green-500 to-teal-600",
    dependencies: [],
    slides: mySlides
};
