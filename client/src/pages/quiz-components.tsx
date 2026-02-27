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
      style={{ backgroundColor: "#EEE7DD" }}
    >
      <div className="min-h-full flex flex-col">
        {/* Logo */}
        <div className="pt-6 pb-2 px-6 flex items-center justify-center">
          <span className="text-xl font-bold tracking-tight text-[#2D2D2D]">
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
              ? "w-8 h-2 bg-[#92ABBB]"
              : i < current
                ? "w-2 h-2 bg-[#92ABBB]"
                : "w-2 h-2 bg-[#CEB298]/40"
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
        <div className="bg-white rounded-2xl shadow-sm border border-[#CEB298]/20 p-6 sm:p-8">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-[#5A5A5A] hover:text-[#2D2D2D] transition-colors mb-5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <h2 className="text-2xl font-bold text-[#2D2D2D] mb-1">{title}</h2>
          {subtitle && (
            <p className="text-[#5A5A5A] text-sm mb-6">{subtitle}</p>
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
          ? "border-[#92ABBB] bg-[#92ABBB]/10"
          : "border-[#CEB298]/20 bg-white hover:border-[#CEB298]/40"
      }`}
    >
      <span className="text-base font-medium text-[#2D2D2D]">{label}</span>
      {sublabel && (
        <span className="block text-sm text-[#5A5A5A] mt-0.5">{sublabel}</span>
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
          ? "border-[#92ABBB] bg-[#92ABBB]/10"
          : "border-[#CEB298]/20 bg-white hover:border-[#CEB298]/40"
      }`}
    >
      <div
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          checked
            ? "bg-[#92ABBB] border-[#92ABBB]"
            : "border-[#CEB298]/50 bg-white"
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <div>
        <span className="text-base font-medium text-[#2D2D2D]">{label}</span>
        {sublabel && (
          <span className="block text-sm text-[#5A5A5A] mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── QuizInput ────────────────────────────────────────────────
   Plain input with warm light styling.
──────────────────────────────────────────────────────────────── */
export function QuizInput({
  label,
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[#2D2D2D]">
          {label}
        </label>
      )}
      <input
        {...props}
        className={`w-full rounded-xl border border-[#CEB298]/30 bg-[#F5F0EA] px-4 py-3 text-[#2D2D2D] placeholder:text-[#5A5A5A]/50 focus:border-[#92ABBB] focus:ring-2 focus:ring-[#92ABBB]/20 focus:outline-none transition-colors text-base ${props.className || ""}`}
      />
    </div>
  );
}

/* ─── QuizButton ───────────────────────────────────────────────
   Primary (muted blue) and secondary (sand outline) variants.
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
    "w-full rounded-xl px-6 py-3 text-base font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#92ABBB]/30";
  const variants = {
    primary: disabled
      ? "bg-[#92ABBB]/50 text-white cursor-not-allowed"
      : "bg-[#92ABBB] text-white hover:bg-[#839dae] active:bg-[#748e9f]",
    secondary: disabled
      ? "bg-white border border-[#CEB298]/30 text-[#5A5A5A]/50 cursor-not-allowed"
      : "bg-white border border-[#CEB298]/40 text-[#2D2D2D] hover:border-[#CEB298] hover:bg-[#F5F0EA]",
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
