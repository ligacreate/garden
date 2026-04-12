import React from 'react';

const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon, disabled = false }) => {
    const variants = {
        primary: "btn-primary disabled:bg-slate-300 disabled:shadow-none",
        secondary: "btn-secondary",
        ghost: "btn-ghost",
        danger: "btn-danger"
    };
    return (
        <button onClick={onClick} disabled={disabled} className={`${variants[variant]} ${className}`}>
            {Icon && <Icon size={18} />}
            {children}
        </button>
    );
};

export default Button;
