function WebPageSlide({
    url,
    title = '网页',
    openLabel = '打开网页',
    allow = 'clipboard-read; clipboard-write',
    referrerPolicy = 'no-referrer',
}) {
    const safeUrl = typeof url === 'string' ? url.trim() : '';
    const [reloadKey, setReloadKey] = React.useState(0);

    if (!safeUrl) {
        return (
            <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4">{title}</h2>
                <div className="flex-1 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center p-6 text-red-700 font-bold">
                    缺少 url
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-full p-6 md:p-10 bg-white">
            <div className="flex items-center justify-between gap-4 mb-4 md:mb-6 shrink-0">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center min-w-0">
                    <i className="fas fa-globe mr-3 text-blue-500"></i>
                    <span className="truncate">{title}</span>
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        className="px-3 py-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors font-bold"
                        onClick={() => setReloadKey(v => v + 1)}
                        title="刷新内嵌页面"
                    >
                        <i className="fas fa-rotate-right"></i>
                    </button>
                    <button
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors"
                        onClick={() => window.open(safeUrl, '_blank')}
                    >
                        <i className="fas fa-up-right-from-square mr-2"></i>{openLabel}
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative">
                <iframe
                    key={reloadKey}
                    src={safeUrl}
                    title={title}
                    className="absolute inset-0 w-full h-full"
                    referrerPolicy={referrerPolicy}
                    allow={allow}
                />
            </div>

            <div className="mt-4 md:mt-6 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs md:text-sm text-slate-600 font-bold truncate">
                {safeUrl}
            </div>
        </div>
    );
}

window.CourseComponents = window.CourseComponents || {};
window.CourseComponents.WebPageSlide = WebPageSlide;
window.WebPageSlide = WebPageSlide;
