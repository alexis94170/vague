export default function TaskSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden bg-[var(--bg-elev)] sm:rounded-xl sm:border sm:border-[var(--border)]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-[var(--border)]/40 px-4 py-3.5 last:border-b-0">
          <div className="skeleton mt-0.5 h-5 w-5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 rounded" style={{ width: `${40 + ((i * 17) % 50)}%` }} />
            <div className="flex gap-2">
              <div className="skeleton h-3 w-12 rounded-full" />
              <div className="skeleton h-3 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
