"use client";

interface QualityScoreProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

function scoreColor(score: number): string {
  if (score > 5) return "text-green-400";
  if (score > 0) return "text-green-300";
  if (score === 0) return "text-gray-400";
  if (score > -5) return "text-orange-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score > 5) return "bg-green-500/10 border-green-500/20";
  if (score > 0) return "bg-green-500/5 border-green-500/10";
  if (score === 0) return "bg-gray-500/10 border-gray-500/20";
  if (score > -5) return "bg-orange-500/10 border-orange-500/20";
  return "bg-red-500/10 border-red-500/20";
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
