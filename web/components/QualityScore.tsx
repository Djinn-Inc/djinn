"use client";

interface QualityScoreProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

function scoreColor(score: number): string {
  if (score > 5) return "text-green-600";
  if (score > 0) return "text-green-500";
  if (score === 0) return "text-slate-500";
  if (score > -5) return "text-genius-500";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score > 5) return "bg-green-100 border-green-200";
  if (score > 0) return "bg-green-50 border-green-100";
  if (score === 0) return "bg-slate-100 border-slate-200";
  if (score > -5) return "bg-orange-50 border-orange-100";
  return "bg-red-100 border-red-200";
}

function sizeClasses(size: "sm" | "md" | "lg"): string {
  switch (size) {
    case "sm":
      return "text-lg px-3 py-1";
    case "md":
      return "text-2xl px-4 py-2";
    case "lg":
      return "text-4xl px-6 py-3";
  }
}

export default function QualityScore({ score, size = "md" }: QualityScoreProps) {
  const sign = score > 0 ? "+" : "";
  return (
    <div
      className={`inline-flex items-center rounded-xl border font-mono font-bold ${scoreColor(score)} ${scoreBg(score)} ${sizeClasses(size)}`}
    >
      <span className="mr-1 text-xs font-normal uppercase tracking-wide opacity-60">
        QS
      </span>
      {sign}
      {score}
    </div>
  );
}
