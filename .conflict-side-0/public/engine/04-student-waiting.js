// ========================================================
// 学生等待界面组件
// ========================================================
function StudentWaitingRoom({ message, forceFullscreen = true }) {
    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white select-none">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-8 py-5 bg-slate-800 border-b border-slate-700" style={{WebkitAppRegion:'drag'}}>
                <div className="flex items-center space-x-3">
                    <i className="fas fa-graduation-cap text-blue-400 text-2xl"></i>
                    <h1 className="text-2xl font-bold">学生端</h1>
                </div>
                <div className="flex items-center space-x-3" style={{WebkitAppRegion:'no-drag'}}>
                    <span className="px-4 py-2 bg-green-500/20 text-green-400 rounded-full text-sm font-bold border border-green-500/30">
                        学生端 (观看)
                    </span>
                    <WindowControls forceFullscreen={forceFullscreen} />
                </div>
            </div>

            {/* 等待内容 */}
            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-center">
                    <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i className="fas fa-graduation-cap text-blue-400 text-4xl"></i>
                    </div>
                    <h2 className="text-3xl font-bold mb-4">等待老师选择课程...</h2>
                    <p className="text-slate-400 max-w-md mx-auto">老师正在准备课程内容，请稍候。课程开始后您将自动进入课堂。</p>
                    <div className="mt-8 flex items-center justify-center space-x-2">
                        <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></span>
                        <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></span>
                        <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                    </div>
                </div>
            </div>
        </div>
    );
}
