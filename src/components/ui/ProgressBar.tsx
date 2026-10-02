export function ProgressBar({
  current,
  total
}: {
  current: number;
  total: number;
}) {
  const percent = Math.min(100, Math.round((current / total) * 100));
  return (
    <div
      role="progressbar"
      aria-label={`Question ${current} of ${total}`}
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="mb-2 flex justify-between font-sans text-xs uppercase tracking-[0.08em] text-ink-500">
        <span>
          Question {current} of {total}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-paper-200">
        <div
          className="h-1.5 rounded-full bg-oxblood transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
