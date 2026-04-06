import React from "react";
import { ChevronRight } from "lucide-react";

type RubricCriterion = {
  id?: string;
  name?: string;
  description?: string;
  weight?: number;
  points?: number;
  levels?: Array<{ label?: string; description?: string }>;
};

type RubricShape = {
  totalPoints?: number;
  criteria?: RubricCriterion[];
};

type CriteriaScore = {
  criterionId?: string;
  criterionName?: string;
  score?: number;
  maxScore?: number;
  level?: string;
  feedback?: string;
  quotes?: string[];
};

type GradingShape = {
  criteriaScores?: CriteriaScore[];
};

function findScoreForCriterion(scores: CriteriaScore[] | undefined, c: RubricCriterion, idx: number): CriteriaScore | undefined {
  if (!scores?.length) return undefined;
  const byId = c.id ? scores.find((s) => s.criterionId === c.id) : undefined;
  if (byId) return byId;
  const byName = c.name ? scores.find((s) => s.criterionName === c.name) : undefined;
  if (byName) return byName;
  return scores[idx];
}

export function criterionPerformance(
  score: number,
  maxScore: number,
): { label: string; className: string } {
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { label: "—", className: "text-slate-500" };
  }
  const pct = score / maxScore;
  if (pct >= 0.7) return { label: "Met", className: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (pct >= 0.4) return { label: "Partial", className: "text-amber-800 bg-amber-50 border-amber-200" };
  return { label: "Not met", className: "text-red-700 bg-red-50 border-red-200" };
}

type Props = {
  rubric: RubricShape | null | undefined;
  grading: GradingShape | null | undefined;
  className?: string;
};

export function WritingRubricGradeView({ rubric, grading, className = "" }: Props) {
  const criteria = rubric?.criteria?.length ? rubric.criteria : [];
  const scores = grading?.criteriaScores ?? [];

  if (criteria.length === 0 && scores.length === 0) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 ${className}`}>
        No rubric criteria were stored for this submission.
      </div>
    );
  }

  const rows =
    criteria.length > 0
      ? criteria.map((c, idx) => {
          const cs = findScoreForCriterion(scores, c, idx);
          const maxPts =
            cs != null && Number.isFinite(cs.maxScore)
              ? Number(cs.maxScore)
              : Number(c.points) || 0;
          const sc =
            cs != null && Number.isFinite(cs.score) ? Number(cs.score) : null;
          const perf =
            sc != null && maxPts > 0 ? criterionPerformance(sc, maxPts) : { label: "—", className: "text-slate-500 bg-slate-50 border-slate-200" };
          return { key: String(c.id ?? `c-${idx}`), criterion: c, cs, maxPts, sc, perf };
        })
      : scores.map((cs, idx) => {
          const maxPts = Number.isFinite(cs.maxScore) ? Number(cs.maxScore) : 0;
          const sc = Number.isFinite(cs.score) ? Number(cs.score) : 0;
          const perf = maxPts > 0 ? criterionPerformance(sc, maxPts) : { label: "—", className: "text-slate-500 bg-slate-50 border-slate-200" };
          return {
            key: String(cs.criterionId ?? `s-${idx}`),
            criterion: {
              name: cs.criterionName ?? `Criterion ${idx + 1}`,
              description: "",
              points: maxPts,
            } as RubricCriterion,
            cs,
            maxPts,
            sc,
            perf,
          };
        });

  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${className}`}>
      <table className="min-w-[720px] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <th className="p-3 w-[26%]">Criterion</th>
            <th className="p-3 w-[38%]">Rubric (levels)</th>
            <th className="p-3 w-28 text-center">Score</th>
            <th className="p-3 w-24 text-center">Level</th>
            <th className="p-3 w-32 text-center">Met rubric?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, criterion, cs, maxPts, sc, perf }) => {
            const quotes = Array.isArray(cs?.quotes) ? cs!.quotes!.filter((q) => typeof q === "string" && q.trim().length > 0) : [];
            const note = typeof cs?.feedback === "string" ? cs.feedback.trim() : "";
            const hasJustification = quotes.length > 0 || note.length > 0;

            return (
              <React.Fragment key={key}>
                <tr className="border-b border-slate-100 align-top">
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{criterion.name ?? "—"}</div>
                    {criterion.description ? (
                      <div className="mt-1 text-xs text-slate-500">{criterion.description}</div>
                    ) : null}
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {(criterion.levels || []).length > 0 ? (
                      <ul className="space-y-1">
                        {(criterion.levels || []).map((lv, i) => (
                          <li key={i}>
                            <span className="font-medium text-slate-700">{lv.label ?? "—"}:</span>{" "}
                            <span className="text-slate-600">{(lv.description ?? "").slice(0, 160)}{(lv.description?.length ?? 0) > 160 ? "…" : ""}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-medium text-slate-900">
                    {sc != null && maxPts > 0 ? `${sc} / ${maxPts}` : sc != null ? String(sc) : "—"}
                  </td>
                  <td className="p-3 text-center text-slate-700">{cs?.level ?? "—"}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`inline-flex min-w-22 justify-center rounded-lg border px-2 py-1 text-xs font-semibold ${perf.className}`}
                    >
                      {perf.label}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/40">
                  <td colSpan={5} className="p-0">
                    <details className="group border-t border-slate-100">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100/90 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-90" />
                        <span>
                          Evidence from student response
                          {quotes.length > 0 ? (
                            <span className="ml-1 font-normal text-slate-500">({quotes.length} snippet{quotes.length === 1 ? "" : "s"})</span>
                          ) : null}
                        </span>
                      </summary>
                      <div className="space-y-3 border-t border-slate-100 px-3 pb-3 pt-1">
                        {hasJustification ? (
                          <>
                            {quotes.length > 0 ? (
                              <ul className="space-y-2">
                                {quotes.map((quote, qi) => (
                                  <li
                                    key={qi}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-800"
                                  >
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                      Quote {qi + 1}
                                    </span>
                                    <blockquote className="border-l-4 border-slate-300 pl-2 font-serif text-slate-900 not-italic">
                                      {quote}
                                    </blockquote>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {note ? (
                              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-slate-700">
                                <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-blue-700">
                                  AI rationale
                                </span>
                                <p className="whitespace-pre-wrap leading-relaxed">{note}</p>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-xs italic text-slate-500">
                            No quoted lines or rationale were returned for this criterion. Try re-running grading if the model omitted evidence.
                          </p>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {rubric?.totalPoints != null ? (
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          Rubric total points: {rubric.totalPoints}
        </div>
      ) : null}
    </div>
  );
}
