import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";

/* ─── QuizShell ────────────────────────────────────────────────
   Fixed full-screen container that covers the body.
──────────────────────────────────────────────────────────────── */
export function QuizShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: "#0F172A" }}
    >
      <div className="min-h-full flex flex-col">
        {/* Logo */}
        <div className="pt-6 pb-2 px-6 flex items-center justify-center">
          <span className="text-xl font-bold tracking-tight text-white">
            Griseus
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── ProgressDots ─────────────────────────────────────────────
   Horizontal dot indicator. Active = wide pill, past = small
   filled circle, future = small muted circle.
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
                : "w-2 h-2 bg-white/20"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── StepCard ─────────────────────────────────────────────────
   Glass-morphism rounded card with optional back button, title, subtitle.
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
        <div className="bg-[#1A1A2E]/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-8">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <h2 className="text-2xl font-bold text-white mb-1">{title}</h2>
          {subtitle && (
            <p className="text-slate-400 text-sm mb-6">{subtitle}</p>
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
   Single-select option card.
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
          ? "border-blue-500 bg-blue-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
    >
      <span className="text-base font-medium text-white">{label}</span>
      {sublabel && (
        <span className="block text-sm text-slate-400 mt-0.5">{sublabel}</span>
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
          ? "border-blue-500 bg-blue-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
    >
      <div
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          checked
            ? "bg-blue-500 border-blue-500"
            : "border-white/30 bg-transparent"
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <div>
        <span className="text-base font-medium text-white">{label}</span>
        {sublabel && (
          <span className="block text-sm text-slate-400 mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── QuizInput ────────────────────────────────────────────────
   Dark-themed input with blue focus ring.
──────────────────────────────────────────────────────────────── */
export function QuizInput({
  label,
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <input
        {...props}
        className={`w-full rounded-xl bg-[#1E293B] border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors text-base ${props.className || ""}`}
      />
    </div>
  );
}

/* ─── QuizButton ───────────────────────────────────────────────
   Primary (blue-to-emerald gradient) and secondary (outline) variants.
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
      ? "bg-slate-700 text-slate-500 cursor-not-allowed"
      : "bg-gradient-to-r from-blue-500 to-emerald-500 text-white hover:shadow-lg hover:shadow-blue-500/25",
    secondary: disabled
      ? "bg-transparent border border-white/5 text-slate-600 cursor-not-allowed"
      : "bg-transparent border border-white/10 text-white hover:border-white/20 hover:bg-white/5",
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
