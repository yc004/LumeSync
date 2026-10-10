export default function AssetCheck() {
  return (
    <div className="w-full h-full bg-slate-950 text-white p-12 flex items-center justify-center">
      <div className="w-full max-w-5xl grid grid-cols-[1fr_1.2fr] gap-10 items-center">
        <div className="rounded-3xl bg-white/8 border border-white/15 p-8 shadow-2xl">
          <img
            src="assets/lumesync-test-logo.svg"
            alt="LumeSync test asset"
            className="w-full aspect-square object-contain rounded-2xl bg-white"
          />
        </div>

        <div>
          <div className="inline-flex px-4 py-2 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-emerald-200 text-sm font-bold mb-6">
            Page 1 / Asset resolver
          </div>
          <h1 className="text-6xl font-black leading-tight mb-6">
            Zip 格式课件测试
          </h1>
          <p className="text-2xl text-slate-200 leading-relaxed">
            这一页的图片使用静态路径
            <span className="font-mono text-emerald-200"> assets/lumesync-test-logo.svg</span>。
            如果图片能显示，说明 Zip 内资源已经被映射到可播放 URL。
          </p>
        </div>
      </div>
    </div>
  );
}
