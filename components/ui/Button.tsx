import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "px-6 py-3 rounded-control font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    // *-strong carries the white label at AA in light mode; in dark mode the
    // token equals the base accent and the label flips to dark.
    primary: "bg-nutri-strong text-white dark:text-[#08210f] shadow-lg shadow-nutri/25 border-b-[3px] border-black/15 hover:brightness-[1.05] active:border-b-0 active:translate-y-[3px]",
    secondary: "bg-hydro-strong text-white dark:text-[#04222e] shadow-lg shadow-hydro/25 border-b-[3px] border-black/15 hover:brightness-[1.05] active:border-b-0 active:translate-y-[3px]",
    outline: "border-2 border-edge text-fg-soft hover:border-nutri hover:text-nutri bg-card active:scale-[.98]",
    ghost: "text-fg-soft hover:text-fg hover:bg-raised active:scale-[.98]",
  };

  const width = fullWidth ? "w-full" : "";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${width} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};