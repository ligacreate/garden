import React from 'react';

const UserAvatar = ({ user, size = 'md', className = '' }) => {
    const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-16 h-16 text-2xl', lg: 'w-24 h-24 text-4xl', xl: 'w-32 h-32 text-4xl' };

    const imgSrc = user.avatar || user.avatar_url;

    if (imgSrc) {
        return (
            <img
                src={imgSrc}
                alt={user.name}
                className={`rounded-full object-cover aspect-square flex-shrink-0 border-2 border-white shadow-sm ${sizes[size]} ${className}`}
            />
        );
    }

    return (
        <div className={`bg-slate-100 rounded-full flex items-center justify-center aspect-square flex-shrink-0 border-2 border-white shadow-sm ${sizes[size]} ${className}`}>
            {user.emoji || '🙂'}
        </div>
    );
};

export default UserAvatar;
