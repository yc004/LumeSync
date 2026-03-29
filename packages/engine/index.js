// ========================================================
// LumeSync 渲染引擎入口
// 提供全局函数、hooks 和共享组件
// ========================================================

// 导出全局工具函数（如果有）
if (typeof module !== 'undefined' && module.exports) {
    // Node.js 环境
    module.exports = {
        // 导出工具函数供其他模块使用
    };
}

// 浏览器环境下，引擎通过 <script> 标签加载
// 所有功能挂载到 window 对象上

console.log('[LumeSync Engine] Engine loaded');
