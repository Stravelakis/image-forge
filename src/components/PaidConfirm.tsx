import type { PaidRunCheck } from "../lib/paidGuard";
import { WHY_MANUAL_DATE } from "../lib/paidGuard";
import { Btn, IX } from "./ui";

/**
 * The question asked before anything costs money.
 *
 * Deliberately a real question, not a shrug: it says what will be spent, which
 * credit it comes out of, when that credit ends, and offers every free engine
 * you have set up as a one-click alternative.
 */
export default function PaidConfirm({
  check,
  onApprove,
  onUseFree,
  onCancel,
}: {
  check: PaidRunCheck;
  onApprove: () => void;
  onUseFree: (engineId: string) => void;
  onCancel: () => void;
}) {
  const tone = check.credit?.expired
    ? "border-blood/50 bg-blood/10 text-blood"
    : check.credit?.endingSoon
      ? "border-ember/50 bg-ember/10 text-ember"
      : "border-line bg-[var(--color-field)] text-parch";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-ember/40 bg-panel shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="font-display text-[17px] tracking-wide text-cream">This one costs money</p>
            <p className="font-mono text-[10.5px] text-dust">everything else in the forge is free</p>
          </div>
          <button data-tip="Closes this question. Nothing is spent." onClick={onCancel} className="btn-press rounded-lg p-2 text-dust hover:bg-raise hover:text-cream">
            <IX size={16} />
          </button>
        </div>

        <div className="space-y-3.5 p-5">
          <p className="text-[14px] leading-relaxed text-cream">{check.headline}</p>

          {check.creditWarning && (
            <p className={`rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed ${tone}`}>{check.creditWarning}</p>
          )}

          {!check.credit?.endsOn && (
            <p className="text-[11px] leading-relaxed text-dust">{WHY_MANUAL_DATE}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            <Btn data-tip="This spends real money from your account, the amount shown above. Press it only if you agree to pay." variant="primary" onClick={onApprove}>
              Spend it — go ahead
            </Btn>
            <Btn data-tip="Does not spend anything and does not make the pictures." onClick={onCancel}>Cancel</Btn>
          </div>

          {check.freeAlternatives.length > 0 && (
            <div className="rounded-lg border border-moss/30 bg-moss/5 p-3">
              <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-moss uppercase">or use one of these, free</p>
              <div className="flex flex-wrap gap-2">
                {check.freeAlternatives.map((a) => (
                  <button data-tip={`Uses ${a.label} instead. It is free, so no money is spent.`}
                    key={a.id}
                    onClick={() => onUseFree(a.id)}
                    className="btn-press rounded-lg border border-line bg-[var(--color-field)] px-3 py-1.5 text-[12px] text-parch hover:border-moss/50 hover:text-moss"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-dust">
                Picking one of these switches the forge over and runs straight away.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
