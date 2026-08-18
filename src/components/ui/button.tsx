import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', children, disabled, ...props }, ref) => {
    const baseStyle =
      'inline-flex items-center justify-center font-medium transition-saas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 disabled:pointer-events-none disabled:opacity-50 select-none rounded-xl cursor-pointer active:scale-[0.99]';

    const variantStyles = {
      default: 'bg-[#2563EB] text-white hover:bg-blue-700 active:bg-blue-800 shadow-saas border border-transparent',
      secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200/80 active:bg-slate-200 border border-slate-200/60',
      outline: 'border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 shadow-saas',
      ghost: 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900',
      destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-saas border border-transparent',
      link: 'text-[#2563EB] underline-offset-4 hover:underline p-0 h-auto font-normal',
    };

    const sizeStyles = {
      sm: 'h-9 px-3.5 text-xs gap-1.5',
      md: 'h-11 px-4.5 text-xs font-semibold gap-2',
      lg: 'h-12 px-6 text-sm font-semibold gap-2',
      icon: 'h-9 w-9 text-xs justify-center',
    };

    const combinedClass = `${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

    return (
      <button ref={ref} className={combinedClass} disabled={disabled} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

