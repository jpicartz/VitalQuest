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
  const baseStyles = "px-6 py-3 rounded-xl font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/30 border-b-4 border-brand-700 active:border-b-0 active:translate-y-1",
    secondary: "bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/30 border-b-4 border-accent-600 active:border-b-0 active:translate-y-1",
    outline: "border-2 border-slate-200 hover:border-brand-500 text-slate-600 hover:text-brand-600 bg-white",
    ghost: "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
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