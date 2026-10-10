export default function OrderCheck() {
  const checks = [
    "manifest.json 被正确读取",
    "页面顺序来自 manifest.pages",
    "独立 TSX 页面被动态编译",
    "CourseData.slides 兼容原播放器"
  ];

  return (
    <div className="w-full h-full bg-[#f8fafc] text-slate-900 p-14">
      <div className="h-full grid grid-rows-[auto_1fr] gap-10">
        <header>
          <div className="text-sm font-black uppercase tracking-wide text-cyan-700 mb-3">
            Page 2 / Manifest order
          </div>
          <h1 className="text-5xl font-black">页面顺序测试</h1>
          <p className="text-xl text-slate-600 mt-4">
            当前页文件名不是 Slide02.tsx，播放器仍应按 manifest 中的第二项展示它。
          </p>
        </header>

        <main className="grid grid-cols-2 gap-6 content-center">
          {checks.map((item, index) => (
            <div
              key={item}
              className="rounded-2xl border border-slate-200 bg-white p-7 shadow-lg"
            >
              <div className="w-12 h-12 rounded-full bg-cyan-600 text-white flex items-center justify-center text-xl font-black mb-5">
                {index + 1}
              </div>
              <div className="text-2xl font-bold">{item}</div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
