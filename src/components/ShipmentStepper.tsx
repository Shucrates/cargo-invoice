import { Box, Truck, Navigation, CheckCircle2, Check, AlertTriangle, XCircle, Clock } from 'lucide-react';

interface Checkpoint {
  status: string;
  location?: string;
  datetime: string;
  description?: string;
}

const PRIMARY_STEPS = [
  { key: 'booked', label: 'Booked / Registered', matchPattern: /book|register|issue/i },
  { key: 'transit', label: 'In Transit', matchPattern: /transit|hub|picked|dispatch|linehaul|depart/i },
  { key: 'out_for_delivery', label: 'Out for Delivery', matchPattern: /out for delivery|arrived|destination/i },
  { key: 'delivered', label: 'Delivered', matchPattern: /delivered|completed/i },
];

function formatStepDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function ShipmentStepper({
  status,
  checkpoints = [],
  originCity,
  destCity,
}: {
  status: string;
  checkpoints: Checkpoint[];
  originCity?: string;
  destCity?: string;
}) {
  const isVoided = status === 'Voided';
  const isDelayed = status === 'Delayed';
  const isException = status === 'Exception';
  const isDelivered = status === 'Delivered';

  // Determine active step index
  let activeIndex = 0;
  if (isDelivered) {
    activeIndex = 3;
  } else if (/out for delivery/i.test(status)) {
    activeIndex = 2;
  } else if (/transit|hub|picked|depart/i.test(status)) {
    activeIndex = 1;
  } else {
    activeIndex = 0;
  }

  // Find corresponding checkpoint stamps
  const getCheckpointForStep = (idx: number) => {
    if (!checkpoints || checkpoints.length === 0) return null;
    if (idx === 0) {
      return (
        checkpoints.slice().reverse().find((c) => PRIMARY_STEPS[0].matchPattern.test(c.status)) ||
        checkpoints[checkpoints.length - 1]
      );
    }
    if (idx === 3 && isDelivered) {
      return checkpoints.find((c) => /deliver/i.test(c.status)) || checkpoints[0];
    }
    if (idx === 2 && activeIndex >= 2) {
      return checkpoints.find((c) => PRIMARY_STEPS[2].matchPattern.test(c.status));
    }
    if (idx === 1 && activeIndex >= 1) {
      return checkpoints.find((c) => PRIMARY_STEPS[1].matchPattern.test(c.status));
    }
    return null;
  };

  const getStepLocation = (idx: number, cp?: Checkpoint | null) => {
    if (cp?.location) return cp.location;
    if (idx === 0 && originCity) return `${originCity} Terminal`;
    if (idx === 3 && destCity) return `${destCity} Destination`;
    return null;
  };

  return (
    <div className="space-y-4">
      {(isDelayed || isException || isVoided) && (
        <div
          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-semibold ${
            isVoided
              ? 'bg-[#FDECEC] text-[#D14343] border border-red-200/80'
              : 'bg-[#FFF6DD] text-[#B7791F] border border-amber-200/80'
          }`}
        >
          {isVoided ? <XCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>
            {isVoided
              ? 'This consignment docket has been voided by audit.'
              : isDelayed
              ? 'Consignment is currently experiencing transit delay. Our operations desk is monitoring.'
              : 'Exception logged during transit inspection.'}
          </span>
        </div>
      )}

      {/* Desktop Stepper */}
      <div className="hidden sm:block bg-[#F8FAFC] border border-slate-200/80 rounded-2xl p-6">
        <div className="flex items-start justify-between relative">
          {/* Background Connecting Line */}
          <div className="absolute top-4 left-[12%] right-[12%] h-0.5 bg-slate-200 -z-0" />
          {/* Active Progress Connecting Line */}
          <div
            className="absolute top-4 left-[12%] h-0.5 bg-[#0A2030] transition-all duration-500 -z-0"
            style={{
              width:
                activeIndex === 0
                  ? '0%'
                  : activeIndex === 1
                  ? '38%'
                  : activeIndex === 2
                  ? '68%'
                  : '76%',
            }}
          />

          {PRIMARY_STEPS.map((step, idx) => {
            const isCompleted = idx < activeIndex || (idx === activeIndex && isDelivered);
            const isCurrent = idx === activeIndex && !isDelivered && !isVoided;
            const isPending = idx > activeIndex;
            const cp = getCheckpointForStep(idx);
            const locationText = getStepLocation(idx, cp);

            return (
              <div key={step.key} className="flex-1 flex flex-col items-center text-center relative z-10 px-2">
                {/* Node Circle */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-200 ${
                    isCompleted
                      ? 'bg-[#0A2030] text-white ring-4 ring-slate-200 shadow-xs'
                      : isCurrent
                      ? 'bg-amber-600 text-white ring-4 ring-amber-100 shadow-xs animate-pulse'
                      : 'bg-white border-2 border-slate-300 text-slate-400'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  ) : isCurrent ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  ) : (
                    <span className="text-[10px] font-mono text-slate-400">{idx + 1}</span>
                  )}
                </div>

                {/* Step Label */}
                <span
                  className={`mt-3 text-xs font-bold leading-snug tracking-tight ${
                    isCompleted || isCurrent ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>

                {/* Date & Location */}
                <div className="mt-1 space-y-0.5 min-h-[32px]">
                  {cp?.datetime ? (
                    <span className="text-[11px] font-mono font-medium text-slate-600 block">
                      {formatStepDate(cp.datetime)}
                    </span>
                  ) : isPending ? (
                    <span className="text-[11px] font-mono text-slate-400 block">Pending</span>
                  ) : null}

                  {locationText && (isCompleted || isCurrent) ? (
                    <span className="text-[10px] text-slate-500 font-medium block truncate max-w-[120px] mx-auto">
                      {locationText}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Stepper */}
      <div className="sm:hidden bg-[#F8FAFC] border border-slate-200/80 rounded-2xl p-4 space-y-4">
        {PRIMARY_STEPS.map((step, idx) => {
          const isCompleted = idx < activeIndex || (idx === activeIndex && isDelivered);
          const isCurrent = idx === activeIndex && !isDelivered && !isVoided;
          const cp = getCheckpointForStep(idx);
          const locationText = getStepLocation(idx, cp);

          return (
            <div key={step.key} className="flex items-start gap-3 relative">
              {idx < PRIMARY_STEPS.length - 1 && (
                <div
                  className={`absolute left-3.5 top-7 bottom-0 w-0.5 ${
                    idx < activeIndex ? 'bg-[#0A2030]' : 'bg-slate-200'
                  }`}
                />
              )}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 relative z-10 ${
                  isCompleted
                    ? 'bg-[#0A2030] text-white ring-2 ring-slate-200'
                    : isCurrent
                    ? 'bg-amber-600 text-white ring-2 ring-amber-100'
                    : 'bg-white border border-slate-300 text-slate-400'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : isCurrent ? (
                  <div className="w-2 h-2 rounded-full bg-white" />
                ) : (
                  <span className="text-[10px] font-mono text-slate-400">{idx + 1}</span>
                )}
              </div>

              <div className="flex-1 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      isCompleted || isCurrent ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                  {cp?.datetime && (
                    <span className="text-[10px] font-mono text-slate-500">
                      {formatStepDate(cp.datetime)}
                    </span>
                  )}
                </div>
                {locationText && (isCompleted || isCurrent) && (
                  <span className="text-[11px] text-slate-500 block mt-0.5">{locationText}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

