import { useReducer, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Trade, Skill, Certification, TradeCertification } from "@shared/schema";
import {
  QuizShell,
  ProgressDots,
  StepCard,
  StepTransition,
  SelectableCard,
  CheckableCard,
  QuizInput,
  QuizButton,
} from "./quiz-components";

/* ─── State ────────────────────────────────────────────────── */

interface WorkerQuizState {
  step: number;
  direction: number;
  selectedTradeId: string;
  selectedTradeName: string;
  experienceRange: string;
  selectedCertificationIds: string[];
  selectedSkillIds: string[];
  location: string;
  name: string;
  email: string;
  password: string;
}

type Action =
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "SET_TRADE"; id: string; name: string }
  | { type: "SET_EXPERIENCE"; range: string }
  | { type: "TOGGLE_CERT"; id: string }
  | { type: "TOGGLE_SKILL"; id: string }
  | { type: "SET_FIELD"; field: "location" | "name" | "email" | "password"; value: string };

const initial: WorkerQuizState = {
  step: 0,
  direction: 1,
  selectedTradeId: "",
  selectedTradeName: "",
  experienceRange: "",
  selectedCertificationIds: [],
  selectedSkillIds: [],
  location: "",
  name: "",
  email: "",
  password: "",
};

function reducer(state: WorkerQuizState, action: Action): WorkerQuizState {
  switch (action.type) {
    case "NEXT":
      return { ...state, step: state.step + 1, direction: 1 };
    case "BACK":
      return { ...state, step: state.step - 1, direction: -1 };
    case "SET_TRADE":
      return { ...state, selectedTradeId: action.id, selectedTradeName: action.name, step: 1, direction: 1 };
    case "SET_EXPERIENCE":
      return { ...state, experienceRange: action.range, step: 2, direction: 1 };
    case "TOGGLE_CERT": {
      const ids = state.selectedCertificationIds;
      const next = ids.includes(action.id)
        ? ids.filter((x) => x !== action.id)
        : [...ids, action.id];
      return { ...state, selectedCertificationIds: next };
    }
    case "TOGGLE_SKILL": {
      const ids = state.selectedSkillIds;
      const next = ids.includes(action.id)
        ? ids.filter((x) => x !== action.id)
        : [...ids, action.id];
      return { ...state, selectedSkillIds: next };
    }
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    default:
      return state;
  }
}

/* ─── Experience ranges → numeric midpoint for API ─────────── */
function experienceToYears(range: string): number {
  switch (range) {
    case "0-2": return 1;
    case "3-5": return 4;
    case "6-10": return 8;
    case "10+": return 12;
    default: return 0;
  }
}

const TOTAL_STEPS = 6;

/* ─── Component ────────────────────────────────────────────── */

export default function WorkerQuiz() {
  const [, setLocation] = useLocation();
  const [state, dispatch] = useReducer(reducer, initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* ── Data fetching ──────────────────────────────────────── */

  const { data: trades } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const { data: allCertifications } = useQuery<Certification[]>({
    queryKey: ["/api/certifications"],
  });

  const { data: tradeCertJoins } = useQuery<TradeCertification[]>({
    queryKey: ["/api/trades", state.selectedTradeId, "certifications"],
    enabled: !!state.selectedTradeId,
  });

  const { data: tradeSkills } = useQuery<Skill[]>({
    queryKey: ["/api/skills", { tradeId: state.selectedTradeId }],
    queryFn: async () => {
      const res = await fetch(`/api/skills?tradeId=${state.selectedTradeId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch skills");
      return res.json();
    },
    enabled: !!state.selectedTradeId,
  });

  /* Resolve trade cert join records to full cert objects */
  const tradeCerts = (tradeCertJoins ?? [])
    .map((tc) => (allCertifications ?? []).find((c) => c.id === tc.certificationId))
    .filter((c): c is Certification => !!c);

  /* ── Navigation helpers ─────────────────────────────────── */

  function goBack() {
    if (state.step === 0) {
      setLocation("/");
    } else {
      dispatch({ type: "BACK" });
    }
  }

  /* ── Submit ─────────────────────────────────────────────── */

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      // 1. Register user
      const regRes = await apiRequest("POST", "/api/register", {
        role: "worker",
        name: state.name,
        email: state.email,
        password: state.password,
        trade: state.selectedTradeName,
        yearsExperience: experienceToYears(state.experienceRange),
        location: state.location,
      });
      await regRes.json();

      // 2. Create worker profile
      const workerRes = await apiRequest("POST", "/api/workers", {
        name: state.name,
        title: state.selectedTradeName,
        trade: state.selectedTradeName,
        email: state.email,
        location: state.location,
        experience: experienceToYears(state.experienceRange),
        available: true,
      });
      const worker = await workerRes.json();

      // 3. Save skills + certifications in parallel
      const skillPromises = state.selectedSkillIds.map((skillId) =>
        apiRequest("POST", "/api/worker-skills", {
          workerId: worker.id,
          skillId,
          proficiencyLevel: 3,
        })
      );
      const certPromises = state.selectedCertificationIds.map((certificationId) =>
        apiRequest("POST", "/api/worker-certifications", {
          workerId: worker.id,
          certificationId,
        })
      );
      await Promise.all([...skillPromises, ...certPromises]);

      // 4. Invalidate user cache and redirect
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setLocation("/mobile");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setSubmitting(false);
    }
  }

  /* ── Step renderers ─────────────────────────────────────── */

  function renderStep() {
    switch (state.step) {
      /* Step 0 — Trade selection */
      case 0:
        return (
          <StepCard
            title="What's your trade?"
            subtitle="Select the trade that best describes your work"
            onBack={goBack}
          >
            <div className="space-y-3">
              {trades?.map((t) => (
                <SelectableCard
                  key={t.id}
                  label={t.name}
                  sublabel={t.category}
                  selected={state.selectedTradeId === t.id}
                  onClick={() => dispatch({ type: "SET_TRADE", id: t.id, name: t.name })}
                />
              ))}
              {(!trades || trades.length === 0) && (
                <p className="text-gray-400 text-sm text-center py-8">Loading trades...</p>
              )}
            </div>
          </StepCard>
        );

      /* Step 1 — Experience */
      case 1:
        return (
          <StepCard
            title="How much experience do you have?"
            subtitle="In your selected trade"
            onBack={goBack}
          >
            <div className="space-y-3">
              {[
                { value: "0-2", label: "0 – 2 years", sublabel: "Just getting started" },
                { value: "3-5", label: "3 – 5 years", sublabel: "Solid foundation" },
                { value: "6-10", label: "6 – 10 years", sublabel: "Experienced professional" },
                { value: "10+", label: "10+ years", sublabel: "Seasoned veteran" },
              ].map((opt) => (
                <SelectableCard
                  key={opt.value}
                  label={opt.label}
                  sublabel={opt.sublabel}
                  selected={state.experienceRange === opt.value}
                  onClick={() => dispatch({ type: "SET_EXPERIENCE", range: opt.value })}
                />
              ))}
            </div>
          </StepCard>
        );

      /* Step 2 — Certifications */
      case 2:
        return (
          <StepCard
            title="Certifications you hold?"
            subtitle="Select all that apply — you can skip this step"
            onBack={goBack}
          >
            <div className="space-y-3">
              {tradeCerts.length > 0 ? (
                tradeCerts.map((c) => (
                  <CheckableCard
                    key={c.id}
                    label={c.name}
                    sublabel={c.issuingBody}
                    checked={state.selectedCertificationIds.includes(c.id)}
                    onClick={() => dispatch({ type: "TOGGLE_CERT", id: c.id })}
                  />
                ))
              ) : (
                <p className="text-gray-400 text-sm text-center py-4">
                  {state.selectedTradeId ? "No certifications found for this trade" : "Loading..."}
                </p>
              )}
            </div>
            <div className="mt-6">
              <QuizButton onClick={() => dispatch({ type: "NEXT" })}>
                {state.selectedCertificationIds.length > 0 ? "Continue" : "Skip"}
              </QuizButton>
            </div>
          </StepCard>
        );

      /* Step 3 — Skills */
      case 3:
        return (
          <StepCard
            title="Your strongest skills?"
            subtitle="Select all that apply — you can skip this step"
            onBack={goBack}
          >
            <div className="space-y-3">
              {(tradeSkills ?? []).length > 0 ? (
                (tradeSkills ?? []).map((s) => (
                  <CheckableCard
                    key={s.id}
                    label={s.name}
                    sublabel={s.description ?? undefined}
                    checked={state.selectedSkillIds.includes(s.id)}
                    onClick={() => dispatch({ type: "TOGGLE_SKILL", id: s.id })}
                  />
                ))
              ) : (
                <p className="text-gray-400 text-sm text-center py-4">
                  {state.selectedTradeId ? "No skills found for this trade" : "Loading..."}
                </p>
              )}
            </div>
            <div className="mt-6">
              <QuizButton onClick={() => dispatch({ type: "NEXT" })}>
                {state.selectedSkillIds.length > 0 ? "Continue" : "Skip"}
              </QuizButton>
            </div>
          </StepCard>
        );

      /* Step 4 — Location */
      case 4:
        return (
          <StepCard
            title="Where are you based?"
            subtitle="City and state"
            onBack={goBack}
          >
            <QuizInput
              label="Location"
              placeholder="e.g. Dallas, TX"
              value={state.location}
              onChange={(e) =>
                dispatch({ type: "SET_FIELD", field: "location", value: e.target.value })
              }
            />
            <div className="mt-6">
              <QuizButton
                disabled={!state.location.trim()}
                onClick={() => dispatch({ type: "NEXT" })}
              >
                Continue
              </QuizButton>
            </div>
          </StepCard>
        );

      /* Step 5 — Account */
      case 5:
        return (
          <StepCard
            title="Create your account"
            subtitle="Almost done — just a few details"
            onBack={goBack}
          >
            <div className="space-y-4">
              <QuizInput
                label="Full Name"
                placeholder="Marcus Johnson"
                value={state.name}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "name", value: e.target.value })
                }
              />
              <QuizInput
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={state.email}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "email", value: e.target.value })
                }
              />
              <QuizInput
                label="Password"
                type="password"
                placeholder="At least 6 characters"
                value={state.password}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "password", value: e.target.value })
                }
              />
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <div className="mt-6">
              <QuizButton
                disabled={
                  submitting ||
                  !state.name.trim() ||
                  !state.email.trim() ||
                  state.password.length < 6
                }
                onClick={handleSubmit}
              >
                {submitting ? "Creating account..." : "Create Account"}
              </QuizButton>
            </div>
          </StepCard>
        );

      default:
        return null;
    }
  }

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <QuizShell>
      <ProgressDots total={TOTAL_STEPS} current={state.step} />
      <StepTransition stepKey={state.step} direction={state.direction}>
        {renderStep()}
      </StepTransition>
    </QuizShell>
  );
}
