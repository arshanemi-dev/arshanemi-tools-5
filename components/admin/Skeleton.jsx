export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-surface rounded-lg ${className}`} />
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="bg-card rounded-2xl border border-divider shadow-sm overflow-hidden">
      <div className="p-4 border-b border-divider flex items-center justify-between">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="divide-y divide-divider">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function LoadError({ onRetry }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm text-subtle mb-3">Failed to load data. Please check your connection.</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
      >
        Retry
      </button>
    </div>
  )
}
