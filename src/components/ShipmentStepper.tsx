import { Box, PackageCheck, Truck, Warehouse, Navigation, CheckCircle2, Check, AlertTriangle, XCircle, type LucideIcon } from 'lucide-react';

/** Main happy-path stages, in order. Delayed/Exception/Voided are off this
 * line by design — they're surfaced as a banner above the stepper instead,
 * frozen at whichever main stage was last reached. */
const STEPS: { label: string; icon: LucideIcon }[] = [
  { label: 'Booked', icon: Box },
  { label: 'Picked Up', icon: PackageCheck },
  { label: 'In Transit', icon: Truck },
  { label: 'Arrived at Hub', icon: Warehouse },
  { label: 'Out for Delivery', icon: Navigation },
  { label: 'Delivered', icon: CheckCircle2 },
];

interface Checkpoint {
  status: string;
  datetime: string;
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** The synthetic booking checkpoint reads "Shipment booked & LR issued",
 * not the bare enum label "Booked" — match it loosely so the first step
 * still gets a real timestamp. */
function findStamp(label: string, checkpoints: Checkpoint[]): string | undefined {
  if (label === 'Booked') {
    return checkpoints.slice().reverse().find((cp) => /book/i.test(cp.status))?.datetime;
  }
  return checkpoints.find((cp) => cp.status === label)?.datetime;
}

export function ShipmentStepper({ status, checkpoints }: { status: string; checkpoints: Checkpoint[] }) {
  const isVoided = status === 'Voided';
  const isDelayed = status === 'Delayed';
  const isException = status === 'Exception';

  // Checkpoints arrive newest-first; find the latest one that maps to a
  // main-path stage so a Delayed/Exception status doesn't blank the stepper.
  const lastMainStage = checkpoints.find((cp) => STEPS.some((s) => s.label === cp.status))?.status;
  const currentIndex = isVoided
    ? -1
    : Math.max(0, STEPS.findIndex((s) => s.label === (lastMainStage ?? (status === 'Delivered' ? 'Delivered' : 'Booked'))));

  return (
    <div className="space-y-4">
      {(isDelayed || isException || isVoided) && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold ${
            isVoided
              ? 'bg-[#FDECEC] text-[#D14343] border border-red-200/60'
              : 'bg-[#FEF6E7] text-[#B45309] border border-amber-200/60'
          }`}
        >
          {isVoided ? <XCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>
            {isVoided
              ? 'This shipment has been voided.'
              : isDelayed
              ? 'This shipment is currently delayed.'
              : 'An exception was reported on this shipment.'}
          </span>
        </div>
      )}

      {/* Desktop: horizontal stepper */}
      <div className="hidden sm:flex items-start bg-slate-50/80 rounded-2xl p-5">
        {STEPS.map((step, idx) => {
          const done = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const reached = idx <= currentIndex;
          const Icon = step.icon;
          const stamp = findStamp(step.label, checkpoints);
          return (
            <div key={step.label} className="flex-1 flex flex-col items-center text-center relative">
              {idx !== 0 && (
                <div
                  className={`absolute top-4 right-1/2 w-full h-0.5 ${
                    idx <= currentIndex ? 'bg-[#2563EB]' : 'bg-slate-200'
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  reached
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : 'bg-white border-slate-300 text-slate-400'
                } ${isCurrent && !isVoided ? 'ring-4 ring-blue-100' : ''}`}
              >
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span
                className={`mt-2 text-[10px] font-semibold leading-tight max-w-[90px] ${
                  reached ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
              <span className="mt-0.5 text-[9px] font-mono text-slate-400 max-w-[90px]">
                {stamp ? formatStamp(stamp) : 'Waiting...'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical stepper */}
      <div className="sm:hidden relative pl-5 space-y-5 bg-slate-50/80 rounded-2xl p-5">
        <div className="absolute left-[35px] top-7 bottom-7 w-0.5 bg-slate-200" />
        {STEPS.map((step, idx) => {
          const done = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const reached = idx <= currentIndex;
          const Icon = step.icon;
          const stamp = findStamp(step.label, checkpoints);
          return (
            <div key={step.label} className="relative flex items-center gap-3">
              <div
                className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0 ${
                  reached
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : 'bg-white border-slate-300 text-slate-400'
                } ${isCurrent && !isVoided ? 'ring-4 ring-blue-100' : ''}`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              </div>
              <div className="flex flex-col">
                <span className={`text-xs font-semibold ${reached ? 'text-slate-900' : 'text-slate-400'}`}>
                  {step.label}
                </span>
                <span className="text-[9px] font-mono text-slate-400">{stamp ? formatStamp(stamp) : 'Waiting...'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
