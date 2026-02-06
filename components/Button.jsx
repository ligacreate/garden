import React from 'react';

const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon, disabled = false }) => {
    const variants = {
        primary: "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none",
        secondary: "bg-white text-blue-800 border border-slate-200 hover:border-blue-300 hover:text-blue-700",
        ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
        danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100"
    };
    return (
        <button onClick={onClick} disabled={disabled} className={`px-4 py-3 rounded-2xl font-medium transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 ${variants[variant]} ${className}`}>
            {Icon && <Icon size={18} />}
            {children}
        </button>
    );
};

export default Button;
