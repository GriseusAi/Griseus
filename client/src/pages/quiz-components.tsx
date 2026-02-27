import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";

/* ─── QuizShell ────────────────────────────────────────────────
   Fixed full-screen container that covers the dark body.
   All quiz pages wrap their content in this.
──────────────────────────────────────────────────────────────── */
export function QuizShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: "#F5F5F5" }}
    >
      <div className="min-h-full flex flex-col">
        {/* Logo */}
        <div className="pt-6 pb-2 px-6 flex items-center justify-center">
          <span className="text-xl font-bold tracking-tight text-gray-900">
            Griseus
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── ProgressDots ─────────────────────────────────────────────
   Horizontal dot indicator. Active = wide blue pill, past = small
   blue circle, future = small gray circle.
──────────────────────────────────────────────────────────────── */
export function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? "w-8 h-2 bg-blue-500"
              : i < current
                ? "w-2 h-2 bg-blue-500"
                : "w-2 h-2 bg-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── StepCard ─────────────────────────────────────────────────
   White rounded card with optional back button, title, subtitle.
──────────────────────────────────────────────────────────────── */
export function StepCard({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 flex items-start justify-center px-4 pb-8">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{title}</h2>
          {subtitle && (
            <p className="text-gray-500 text-sm mb-6">{subtitle}</p>
          )}
          {!subtitle && <div className="mb-6" />}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── StepTransition ───────────────────────────────────────────
   AnimatePresence wrapper for slide-left/right transitions.
   `direction` 1 = forward (slide left), -1 = backward (slide right).
──────────────────────────────────────────────────────────────── */
export function StepTransition({
  stepKey,
  direction,
  children,
}: {
  stepKey: number;
  direction: number;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: direction * 60 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -60 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex-1 flex flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── SelectableCard ───────────────────────────────────────────
   Single-select option card. Blue border + bg-blue-50 when selected.
──────────────────────────────────────────────────────────────── */
export function SelectableCard({
  label,
  sublabel,
  selected,
  onClick,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-150 ${
        selected
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <span className="text-base font-medium text-gray-900">{label}</span>
      {sublabel && (
        <span className="block text-sm text-gray-500 mt-0.5">{sublabel}</span>
      )}
    </button>
  );
}

/* ─── CheckableCard ────────────────────────────────────────────
   Multi-select checkbox card with check indicator.
──────────────────────────────────────────────────────────────── */
export function CheckableCard({
  label,
  sublabel,
  checked,
  onClick,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-150 flex items-center gap-3 ${
        checked
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          checked
            ? "bg-blue-500 border-blue-500"
            : "border-gray-300 bg-white"
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <div>
        <span className="text-base font-medium text-gray-900">{label}</span>
        {sublabel && (
          <span className="block text-sm text-gray-500 mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── QuizInput ────────────────────────────────────────────────
   Plain input with light styling, no CSS variable dependencies.
──────────────────────────────────────────────────────────────── */
export function QuizInput({
  label,
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        {...props}
        className={`w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors text-base ${props.className || ""}`}
      />
    </div>
  );
}

/* ─── QuizButton ───────────────────────────────────────────────
   Primary (blue) and secondary (white border) variants.
──────────────────────────────────────────────────────────────── */
export function QuizButton({
  variant = "primary",
  disabled,
  children,
  ...props
}: {
  variant?: "primary" | "secondary";
  disabled?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "w-full rounded-xl px-6 py-3 text-base font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
  const variants = {
    primary: disabled
      ? "bg-blue-300 text-white cursor-not-allowed"
      : "bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700",
    secondary: disabled
      ? "bg-white border border-gray-200 text-gray-400 cursor-not-allowed"
      : "bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50",
  };

  return (
    <button
      {...props}
      disabled={disabled}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}
