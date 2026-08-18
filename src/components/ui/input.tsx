import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, type, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={`flex h-12 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-sm text-slate-900 shadow-2xs transition-saas placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#2563EB]/10 disabled:cursor-not-allowed disabled:opacity-50 ${
            error ? 'border-red-500 focus:ring-red-500/10' : ''
          } ${className}`}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

