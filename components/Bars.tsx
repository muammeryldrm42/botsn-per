import { BREAKDOWN_META } from "@/lib/labels";
import type { ScoreBreakdown } from "@/lib/types";

export function Bars({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <div>
      {BREAKDOWN_META.map((item) => {
        const value = breakdown[item.key];
        const width = Math.max(0, Math.min(100, (value / item.max) * 100));
        return (
          <div className="bar" key={item.key}>
            <div className="bar-label">
              <span>
                {item.label}
                <span className="hint"> · {item.hint}</span>
              </span>
              <span className="mono">
                {value}/{item.max}
              </span>
            </div>
            <div className="track" aria-hidden>
              <div className="fill" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
