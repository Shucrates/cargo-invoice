import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' | 'info';
}

export function Badge({ className = '', variant = 'default', children, ...props }: BadgeProps) {
  const baseStyle =
    'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-saas focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 tracking-normal';

  const variantStyles = {
    default: 'bg-[#2563EB] text-white border border-transparent',
    info: 'bg-[#EEF4FF] text-[#2563EB] border border-blue-100',
    secondary: 'bg-slate-100 text-slate-700 border border-slate-200/60',
    success: 'bg-[#E8F7EF] text-[#1F8A4C] border border-emerald-100',
    warning: 'bg-[#FFF6DD] text-[#B7791F] border border-amber-100',
    destructive: 'bg-[#FDECEC] text-[#D14343] border border-red-100',
    outline: 'bg-transparent text-slate-700 border border-slate-200',
  };

  return (
    <div className={`${baseStyle} ${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}

