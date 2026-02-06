import React from 'react';

const Card = ({ children, className = '', onClick }) => (
    <div onClick={onClick} className={`bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 ${className}`}>
        {children}
    </div>
);

export default Card;
