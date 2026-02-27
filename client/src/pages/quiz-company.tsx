import { useReducer, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProjectPhase } from "@shared/schema";
import {
  QuizShell,
  ProgressDots,
  StepCard,
  StepTransition,
  SelectableCard,
  QuizInput,
  QuizButton,
} from "./quiz-components";

/* ─── State ────────────────────────────────────────────────── */

interface CompanyQuizState {
  step: number;
  direction: number;
  facilityType: string;
  selectedPhaseId: string;
  location: string;
  companyName: string;
  name: string;
  position: string;
  email: string;
  password: string;
}

type Action =
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "SET_FACILITY"; value: string }
  | { type: "SET_PHASE"; id: string }
  | { type: "SET_FIELD"; field: "location" | "companyName" | "name" | "position" | "email" | "password"; value: string };

const initial: CompanyQuizState = {
  step: 0,
  direction: 1,
  facilityType: "",
  selectedPhaseId: "",
  location: "",
  companyName: "",
  name: "",
  position: "",
  email: "",
  password: "",
};

function reducer(state: CompanyQuizState, action: Action): CompanyQuizState {
  switch (action.type) {
    case "NEXT":
      return { ...state, step: state.step + 1, direction: 1 };
    case "BACK":
      return { ...state, step: state.step - 1, direction: -1 };
    case "SET_FACILITY":
      return { ...state, facilityType: action.value, step: 1, direction: 1 };
    case "SET_PHASE":
      return { ...state, selectedPhaseId: action.id, step: 2, direction: 1 };
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    default:
      return state;
  }
}

const TOTAL_STEPS = 4;

/* ─── Component ────────────────────────────────────────────── */

export default function CompanyQuiz() {
  const [, setLocation] = useLocation();
  const [state, dispatch] = useReducer(reducer, initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* ── Data fetching ──────────────────────────────────────── */

  const { data: phases } = useQuery<ProjectPhase[]>({
    queryKey: ["/api/project-phases"],
  });

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
      await apiRequest("POST", "/api/register", {
        role: "company",
        name: state.name,
        email: state.email,
        password: state.password,
        companyName: state.companyName,
        industry: "Data Center Construction",
        position: state.position,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setSubmitting(false);
    }
  }

  /* ── Step renderers ─────────────────────────────────────── */

  function renderStep() {
    switch (state.step) {
      /* Step 0 — Facility type */
      case 0:
        return (
          <StepCard
            title="What type of facility?"
            subtitle="Select the type of project you're working on"
            onBack={goBack}
          >
            <div className="space-y-3">
              <SelectableCard
                label="Data Center"
                sublabel="Hyperscale, colocation, or edge facilities"
                selected={state.facilityType === "Data Center"}
                onClick={() => dispatch({ type: "SET_FACILITY", value: "Data Center" })}
              />
            </div>
          </StepCard>
        );

      /* Step 1 — Project phase */
      case 1:
        return (
          <StepCard
            title="What phase is your project in?"
            subtitle="Select the current stage of construction"
            onBack={goBack}
          >
            <div className="space-y-3">
              {(phases ?? [])
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((p) => (
                  <SelectableCard
                    key={p.id}
                    label={p.name}
                    sublabel={p.description ?? undefined}
                    selected={state.selectedPhaseId === p.id}
                    onClick={() => dispatch({ type: "SET_PHASE", id: p.id })}
                  />
                ))}
              {(!phases || phases.length === 0) && (
                <p className="text-gray-400 text-sm text-center py-8">Loading phases...</p>
              )}
            </div>
          </StepCard>
        );

      /* Step 2 — Location */
      case 2:
        return (
          <StepCard
            title="Where is your project?"
            subtitle="City and state"
            onBack={goBack}
          >
            <QuizInput
              label="Location"
              placeholder="e.g. Austin, TX"
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

      /* Step 3 — Account */
      case 3:
        return (
          <StepCard
            title="Set up your account"
            subtitle="Tell us about you and your company"
            onBack={goBack}
          >
            <div className="space-y-4">
              <QuizInput
                label="Company Name"
                placeholder="Acme Data Centers"
                value={state.companyName}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "companyName", value: e.target.value })
                }
              />
              <QuizInput
                label="Your Name"
                placeholder="John Smith"
                value={state.name}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "name", value: e.target.value })
                }
              />
              <QuizInput
                label="Your Position"
                placeholder="Project Manager"
                value={state.position}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "position", value: e.target.value })
                }
              />
              <QuizInput
                label="Email"
                type="email"
                placeholder="you@company.com"
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
                  !state.companyName.trim() ||
                  !state.name.trim() ||
                  !state.position.trim() ||
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
