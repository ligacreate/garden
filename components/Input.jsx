import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

const Input = ({ label, type = "text", placeholder, value, onChange, className = "", inputClassName = "", ...props }) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;
    const rightPaddingClass = isPassword ? 'pr-10' : 'pr-3';

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            {label && (
                <label className="text-xs font-semibold uppercase tracking-widest text-slate-400 ml-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <input
                    type={inputType}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className={`input-field ${rightPaddingClass} ${inputClassName}`}
                    {...props}
                />
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                )}
            </div>
        </div>
    );
};

export default Input;
