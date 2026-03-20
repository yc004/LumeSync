// ========================================================
// 学生等待界面组件
// ========================================================
function StudentWaitingRoom({ message }) {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white select-none">
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
    );
}
