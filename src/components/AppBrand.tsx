export default function AppBrand() {
  return (
    <div className="flex items-center gap-3 px-5 py-6">
      <img
        src="/brand/lamayne-emblem.png"
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 shrink-0 rounded-xl object-contain"
      />
      <div className="min-w-0">
        <p className="text-sm font-bold tracking-[0.12em] text-white">
          LAMAYNE
        </p>
        <p className="mt-1 text-[10px] font-medium tracking-[0.16em] text-zinc-400">
          IPTV
        </p>
      </div>
    </div>
  );
}