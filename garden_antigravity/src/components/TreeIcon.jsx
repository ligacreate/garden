import React from 'react';

// Archetype to SVG mapping based on the provided reference image
const TREES = {
    // Round/Bushy (Fruit) - e.g. Apple, Rowan
    fruit: (color) => (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M50 95V55" stroke="#2C3E50" strokeWidth="4" strokeLinecap="round" />
            <path d="M50 55C25 55 10 40 10 25C10 10 25 5 50 5C75 5 90 10 90 25C90 40 75 55 50 55Z" fill={color} fillOpacity="0.2" />
            <path d="M50 55C30 55 15 35 30 15" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 55C70 55 85 35 70 15" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 55V25" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <circle cx="20" cy="30" r="3" fill="#E74C3C" />
            <circle cx="80" cy="30" r="3" fill="#E74C3C" />
            <circle cx="50" cy="15" r="3" fill="#E74C3C" />
        </svg>
    ),
    // Pointy/Triangular (Coniferous) - e.g. Fir, Cedar, Cypress
    coniferous: (color) => (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M50 95V85" stroke="#2C3E50" strokeWidth="4" strokeLinecap="round" />
            <path d="M50 10L20 85H80L50 10Z" fill={color} fillOpacity="0.2" />
            <path d="M50 10L30 85" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 10L70 85" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 10V85" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
    // Large Round (Mighty) - e.g. Oak, Elm, Beech
    mighty: (color) => (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M50 95V60" stroke="#2C3E50" strokeWidth="6" strokeLinecap="round" />
            <circle cx="50" cy="40" r="35" fill={color} fillOpacity="0.2" />
            <path d="M50 60C30 50 20 30 30 20" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 60C70 50 80 30 70 20" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 60V20" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M35 45L25 35" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M65 45L75 35" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    ),
    // Drooping (Weeping) - e.g. Willow, Birch
    weeping: (color) => (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M50 95V50" stroke="#2C3E50" strokeWidth="3" strokeLinecap="round" />
            <path d="M50 50C20 50 10 80 10 80H90C90 80 80 50 50 50Z" fill={color} fillOpacity="0.2" />
            <path d="M50 50C30 50 25 75 25 85" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 4" />
            <path d="M50 50C70 50 75 75 75 85" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 4" />
            <path d="M50 50V80" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    ),
    // Tall/Thin (Slender) - e.g. Poplar, Olive
    slender: (color) => (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M50 95V80" stroke="#2C3E50" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="50" cy="45" rx="15" ry="40" fill={color} fillOpacity="0.2" />
            <path d="M50 85C40 70 40 20 50 5" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 85C60 70 60 20 50 5" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
            <path d="M50 85V25" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
};

const TreeIcon = ({ treeName, archetype = 'mighty', color = '#10B981', className = "w-10 h-10" }) => {
    // If we have a specific name, we might customize, but primarily use archetype
    const getIcon = () => {
        if (!archetype || !TREES[archetype]) return TREES.mighty(color);
        return TREES[archetype](color);
    };

    return (
        <div className={className} title={treeName}>
            {getIcon()}
        </div>
    );
};

export default TreeIcon;
