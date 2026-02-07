import React from 'react';

const Card = ({ children, className = '', onClick }) => (
    <div onClick={onClick} className={`surface-card p-6 ${className}`}>
        {children}
    </div>
);

export default Card;
