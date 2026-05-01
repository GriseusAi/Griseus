import { useMemo } from "react";
import { CT, CT_FONT, CT_MONO } from "@/lib/claude-theme";
import type { ReactionResult, Scenario } from "./reaction-flask";

/* ════════════════════════════════════════════════════════════════════
   GANTT SCENARIO PANEL — S1 vs S2 yan yana
   ──────────────────────────────────────────────────────────────────── */

const MONTH_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const fmtDate = (d: Date) => `${d.getDate()} ${MONTH_TR[d.getMonth()]}`;

export function ReactionGantt({
  result,
  onClose,
}: {
  result: ReactionResult;
  onClose: () => void;
}) {
  const start = useMemo(() => new Date(result.startDate), [result.startDate]);

  // Find max horizon across both scenarios for shared X axis
  const maxDay = useMemo(() => {
    const ends: number[] = [];
    for (const sc of result.scenarios) {
      for (const seg of sc.segments) ends.push(seg.endDay);
      for (const sup of sc.supplySegments) ends.push(sup.endDay);
      for (const o of sc.outcomes) ends.push(o.deadlineDay);
    }
    return Math.max(30, Math.ceil((Math.max(...ends, 30) + 4) / 5) * 5);
  }, [result]);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 95,
        background: CT.surface,
        borderTop: `1px solid ${CT.borderStrong}`,
        boxShadow: "0 -10px 28px rgba(20,20,19,0.14)",
        fontFamily: CT_FONT,
        color: CT.ink,
        maxHeight: "62vh",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${CT.border}`,
          background: CT.bgAlt,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              color: CT.accent,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontFamily: CT_MONO,
            }}
          >
            ◇ TEPKIME SONUCU
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
            İki senaryo karşılaştırması · başlangıç {fmtDate(start)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {result.sharedComponents.length > 0 && (
            <div
              style={{
                fontSize: 10,
                color: CT.inkSub,
                background: CT.surfaceMuted,
                padding: "5px 9px",
                borderRadius: 6,
                fontFamily: CT_MONO,
              }}
            >
              paylaşılan bileşen:{" "}
              <span style={{ color: CT.accent, fontWeight: 600 }}>
                {result.sharedComponents.slice(0, 3).join(", ")}
                {result.sharedComponents.length > 3 ? ` +${result.sharedComponents.length - 3}` : ""}
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: `1px solid ${CT.border}`,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 11,
              color: CT.inkSub,
              fontFamily: CT_FONT,
            }}
          >
            kapat
          </button>
        </div>
      </div>

      {/* Context banner */}
      {result.contextSummary.length > 0 && (
        <div
          style={{
            padding: "8px 24px",
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            borderBottom: `1px solid ${CT.border}`,
            fontSize: 11,
            color: CT.inkSub,
            background: CT.surface,
          }}
        >
          {result.contextSummary.map((c) => (
            <div key={c.sku} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: CT_MONO, color: CT.ink, fontWeight: 600 }}>{c.sku}</span>
              <span>·</span>
              <span>istek {c.requested}</span>
              <span>·</span>
              <span>depo {c.inWarehouse}</span>
              <span style={{ color: CT.accent }}>→</span>
              <span style={{ color: c.toProduce > 0 ? CT.ink : CT.ok, fontWeight: 600 }}>
                üret {c.toProduce}
              </span>
            </div>
          ))}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div style={{ padding: "8px 24px", background: CT.warnSoft, borderBottom: `1px solid ${CT.border}` }}>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: CT.warn, fontFamily: CT_MONO }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* Scenarios — yan yana */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
          borderBottom: `1px solid ${CT.border}`,
        }}
      >
        {result.scenarios.map((sc, i) => (
          <ScenarioCard
            key={sc.id}
            sc={sc}
            start={start}
            maxDay={maxDay}
            isRight={i === 1}
          />
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({
  sc,
  start,
  maxDay,
  isRight,
}: {
  sc: Scenario;
  start: Date;
  maxDay: number;
  isRight: boolean;
}) {
  const ok = sc.ontime;
  return (
    <div
      style={{
        padding: 18,
        borderLeft: isRight ? `1px solid ${CT.border}` : "none",
        background: ok ? CT.surface : CT.surface,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: ok ? CT.okSoft : CT.errSoft,
            border: `1px solid ${ok ? CT.ok : CT.err}`,
            color: ok ? CT.ok : CT.err,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {sc.id}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{sc.label}</div>
          <div style={{ fontSize: 10, color: CT.inkSub, marginTop: 1 }}>
            {ok ? (
              <span style={{ color: CT.ok }}>✓ tüm teslimler zamanında</span>
            ) : (
              <span style={{ color: CT.err }}>✗ en kötü gecikme {sc.worstLateDays} gün</span>
            )}
          </div>
        </div>
      </div>

      <GanttTrack sc={sc} start={start} maxDay={maxDay} />

      {/* Outcomes */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        {sc.outcomes.map((o) => (
          <div
            key={o.sku}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              fontFamily: CT_MONO,
            }}
          >
            <span style={{ width: 80, color: CT.ink, fontWeight: 600 }}>{o.sku}</span>
            <span style={{ color: CT.inkSub }}>×{o.requested}</span>
            <span style={{ color: CT.inkMuted }}>(depo {o.fromStock} + üret {o.toProduce})</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: o.ontime ? CT.ok : CT.err, fontWeight: 600 }}>
              {o.ontime
                ? `✓ ${Math.round(o.finishesDay)}. günde biter (deadline ${o.deadlineDay})`
                : `✗ ${Math.round(o.finishesDay)}. gün biter, ${o.daysLate} gün geç`}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          background: CT.surfaceMuted,
          borderRadius: 6,
          fontSize: 11,
          color: CT.inkSub,
          lineHeight: 1.55,
        }}
      >
        {sc.rationale}
      </div>
    </div>
  );
}

function GanttTrack({
  sc,
  start,
  maxDay,
}: {
  sc: Scenario;
  start: Date;
  maxDay: number;
}) {
  // Group segments per SKU for swim lanes
  const lanes = useMemo(() => {
    const m: Record<string, typeof sc.segments> = {};
    for (const s of sc.segments) {
      (m[s.sku] ??= []).push(s);
    }
    return Object.entries(m);
  }, [sc.segments]);

  const TICKS = 6;
  const tickDays = Array.from({ length: TICKS + 1 }, (_, i) => Math.round((maxDay * i) / TICKS));

  return (
    <div style={{ position: "relative", marginTop: 8 }}>
      {/* X-axis ticks */}
      <div
        style={{
          position: "relative",
          height: 16,
          marginLeft: 92,
          borderBottom: `1px dashed ${CT.border}`,
        }}
      >
        {tickDays.map((d, i) => {
          const date = new Date(start.getTime() + d * 86400000);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${(d / maxDay) * 100}%`,
                top: 0,
                fontSize: 9,
                color: CT.inkMuted,
                fontFamily: CT_MONO,
                transform: "translateX(-50%)",
              }}
            >
              {fmtDate(date)}
            </div>
          );
        })}
      </div>

      {/* Supply lane (top, ifaccess) */}
      {sc.supplySegments.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", marginTop: 6, gap: 6 }}>
          <div
            style={{
              width: 86,
              fontSize: 10,
              color: CT.warn,
              fontFamily: CT_MONO,
              fontWeight: 600,
              textAlign: "right",
              paddingRight: 6,
            }}
          >
            tedarik
          </div>
          <div
            style={{
              flex: 1,
              position: "relative",
              height: 16,
              background: CT.surfaceMuted,
              borderRadius: 4,
            }}
          >
            {sc.supplySegments.map((sup, i) => (
              <div
                key={i}
                title={`${sup.code} ×${sup.qty} · ${sup.endDay}g`}
                style={{
                  position: "absolute",
                  left: `${(sup.startDay / maxDay) * 100}%`,
                  width: `${((sup.endDay - sup.startDay) / maxDay) * 100}%`,
                  top: 2,
                  height: 12,
                  background: CT.warnSoft,
                  borderLeft: `2px solid ${CT.warn}`,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 4,
                  fontSize: 9,
                  color: CT.warn,
                  fontFamily: CT_MONO,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                {sup.code} ×{sup.qty}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lanes per SKU */}
      {lanes.map(([sku, segs]) => (
        <div key={sku} style={{ display: "flex", alignItems: "center", marginTop: 4, gap: 6 }}>
          <div
            style={{
              width: 86,
              fontSize: 10,
              color: CT.ink,
              fontFamily: CT_MONO,
              fontWeight: 600,
              textAlign: "right",
              paddingRight: 6,
            }}
          >
            {sku}
          </div>
          <div
            style={{
              flex: 1,
              position: "relative",
              height: 22,
              background: CT.surfaceMuted,
              borderRadius: 4,
            }}
          >
            {segs.map((seg, i) => {
              const widthPct = Math.max(0.4, ((seg.endDay - seg.startDay) / maxDay) * 100);
              const leftPct = (seg.startDay / maxDay) * 100;
              const fill = seg.color ?? CT.accent;
              return (
                <div
                  key={i}
                  title={seg.label + (seg.note ? ` · ${seg.note}` : "")}
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: 3,
                    height: 16,
                    background: seg.blocked ? CT.errSoft : fill,
                    border: seg.blocked ? `1px dashed ${CT.err}` : `1px solid ${fill}`,
                    borderRadius: 3,
                    color: seg.blocked ? CT.err : "#fff",
                    fontSize: 9,
                    fontFamily: CT_MONO,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textShadow: seg.blocked ? "none" : "0 1px 2px rgba(0,0,0,0.25)",
                  }}
                >
                  {seg.label}
                </div>
              );
            })}
            {/* Deadline marker */}
            {sc.outcomes
              .filter((o) => o.sku === sku)
              .map((o, i) => (
                <div
                  key={`dl-${i}`}
                  title={`teslim · ${o.deadlineDay}. gün`}
                  style={{
                    position: "absolute",
                    left: `${(o.deadlineDay / maxDay) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: o.ontime ? CT.ok : CT.err,
                    boxShadow: `0 0 0 1px ${o.ontime ? CT.okSoft : CT.errSoft}`,
                  }}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
