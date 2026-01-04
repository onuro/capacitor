'use client';

interface UsageBarChartProps {
  /** Current usage percentage (0-100) */
  value: number;
  /** Total number of bars to display */
  totalBars?: number;
  /** Height of the chart in pixels */
  height?: number;
}

export function UsageBarChart({
  value,
  totalBars = 40,
  height = 31
}: UsageBarChartProps) {
  // Calculate how many bars should be filled based on percentage
  const percentage = Math.min(100, Math.max(0, value));
  const filledBars = Math.round((percentage / 100) * totalBars);

  return (
    <div
      className="flex gap-0.5 w-full items-end"
      style={{ height }}
    >
      {Array.from({ length: totalBars }, (_, index) => (
        <div
          key={index}
          className="flex-1 rounded-xs"
          style={{
            height: '100%',
            backgroundColor: index < filledBars
              ? 'var(--primary)'
              : 'color-mix(in oklab, var(--primary) 10%, transparent)',
          }}
        />
      ))}
    </div>
  );
}
