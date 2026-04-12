import React, { useState, useMemo } from 'react';
import { Search, MapPin, Sparkles, X, Zap } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import Button from '../components/Button';
import { getRoleLabel, getSeason } from '../data/data';
import { getDruidTree } from '../utils/druidHoroscope';
import { normalizeSkills } from '../utils/skills';
import { getTenureText } from '../utils/tenure';
import LivingTree from '../components/LivingTree';

// Internal Components for the Directory
const FilterSelect = ({ icon: Icon, value, onChange, options, placeholder }) => (
    <div className="relative flex-1 min-w-[180px] group">
        {Icon && <Icon size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none transition-colors ${value ? 'text-blue-500' : 'text-slate-400 group-hover:text-blue-500'}`} />}
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full bg-slate-50 border rounded-2xl py-3 pl-10 pr-10 text-sm outline-none focus:ring-1 transition-all appearance-none cursor-pointer relative z-0 ${value
                ? 'border-blue-200 text-slate-900 font-medium focus:border-blue-500 focus:ring-blue-500 bg-blue-50/10'
                : 'border-slate-100 text-slate-500 focus:border-blue-500 focus:ring-blue-500 hover:border-slate-300'}`}
        >
            <option value="">{placeholder}</option>
            {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
    </div>
);

const UserCard = ({ user, onClick }) => {
    // Competencies list
    const allTags = normalizeSkills(user.skills);
    const superpowerText = String(user.unique_abilities || user.uniqueAbilities || '').trim();

    // Tenure Logic with correct Russian declension
    const tenureCaption = getTenureText(user.join_date);

    const handleKeyDown = (event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
        }
    };

    return (
        <div
            onClick={onClick}
            onKeyDown={handleKeyDown}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            aria-label={onClick ? `Открыть страницу ведущей: ${user.name || 'профиль'}` : undefined}
            className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full relative overflow-hidden text-left cursor-pointer"
        >
            {/* Header: Avatar + Meta */}
            <div className="flex items-start gap-4 mb-5">
                <UserAvatar user={user} size="md" className="border-2 border-white shadow-md shrink-0" />
                <div className="min-w-0 pt-1">
                    {/* Allow name to wrap */}
                    <h3 className="text-sm font-bold text-slate-800 leading-tight mb-1">{user.name}</h3>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold truncate">{getRoleLabel(user.role)}</p>
                    {user.city && (
                        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                            <MapPin size={12} className="text-slate-400" />
                            {user.city}
                        </p>
                    )}
                </div>
            </div>

            {/* Merged Tags Section with Subtitle */}
            {allTags.length > 0 && (
                <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 opacity-80">Компетенции</div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {allTags.map((tag, i) => (
                            <span
                                key={i}
                                className="px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[11px] text-slate-600 font-medium max-w-full whitespace-normal break-words"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Superpower - Unified Style to match Competencies/Offer but with Amber hint */}
            {superpowerText && (
                <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2 opacity-90 flex items-center gap-1">
                        <Zap size={10} /> Суперсила
                    </div>
                    <p className="text-xs text-slate-700 font-medium line-clamp-4 leading-relaxed">
                        {superpowerText}
                    </p>
                </div>
            )}

            {/* Tenure Footer - Conditionally Rendered */}
            {tenureCaption && (
                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center gap-2 text-slate-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{tenureCaption}</span>
                </div>
            )}
        </div>
    );
};

const MapView = ({ users, currentUser, onOpenLeader }) => {
    const [search, setSearch] = useState('');
    const [selectedCity, setSelectedCity] = useState('');
    const [selectedSkill, setSelectedSkill] = useState('');
    const [isGardenMode, setIsGardenMode] = useState(false);
    const normalizeKey = (value) => String(value || '').trim().toLowerCase();

    // Filter Logic
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const userName = user.name || '';
            const matchSearch = userName.toLowerCase().includes(search.toLowerCase());
            const matchCity = !selectedCity || normalizeKey(user.city) === normalizeKey(selectedCity);
            const normalizedSkills = normalizeSkills(user.skills).map(normalizeKey).filter(Boolean);
            const selectedSkillKey = normalizeKey(selectedSkill);
            const matchSkill = !selectedSkill || normalizedSkills.some((s) =>
                s === selectedSkillKey || s.includes(selectedSkillKey) || selectedSkillKey.includes(s)
            );

            // Also exclude suspended/deleted if needed, but current dataService handles that mostly.
            // Let's hide users without names or "ghosts"
            if (!user.name) return false;

            return matchSearch && matchCity && matchSkill;
        });
    }, [users, search, selectedCity, selectedSkill]);

    // Extract Options for Selects
    const cities = useMemo(() => {
        const map = new Map();
        users.forEach((u) => {
            const city = (u.city || '').trim();
            if (!city) return;
            const key = normalizeKey(city);
            if (!map.has(key)) map.set(key, city);
        });
        return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'ru'));
    }, [users]);
    const skills = useMemo(() => {
        const map = new Map();
        users.forEach((u) => {
            normalizeSkills(u.skills).forEach((s) => {
                const label = String(s || '').trim();
                if (!label) return;
                const key = normalizeKey(label);
                if (!map.has(key)) map.set(key, label);
            });
        });
        return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'ru'));
    }, [users]);

    const resetFilters = () => {
        setSearch('');
        setSelectedCity('');
        setSelectedSkill('');
    };

    const hasActiveFilters = search || selectedCity || selectedSkill;

    return (
        <div className="flex flex-col pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500 px-4 lg:px-0">
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-4xl font-light text-slate-800 tracking-tight">Сад ведущих</h1>
                    <p className="text-slate-400 mt-1 font-light">Находите единомышленников и коллег</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setIsGardenMode(false)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!isGardenMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Карточки
                        </button>
                        <button
                            onClick={() => setIsGardenMode(true)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isGardenMode ? 'bg-white text-green-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Sparkles size={14} />
                                Сад
                            </span>
                        </button>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Всего садовников</div>
                        <div className="font-mono text-xl text-blue-600">{users.length}</div>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm mb-6 flex flex-col lg:flex-row gap-4">
                <div className="flex-[2]">
                    <div className="relative">
                        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-12 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400 text-slate-900"
                            placeholder="Поиск по имени..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-all"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 flex-[3]">
                    <FilterSelect icon={MapPin} placeholder="Все города" value={selectedCity} onChange={setSelectedCity} options={cities} />
                    <FilterSelect icon={Sparkles} placeholder="Компетенции" value={selectedSkill} onChange={setSelectedSkill} options={skills} />
                </div>
                <button
                    onClick={resetFilters}
                    className={`px-5 py-2 text-sm text-rose-500 hover:bg-rose-50 rounded-2xl transition-all font-medium whitespace-nowrap ${hasActiveFilters ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                    Сбросить
                </button>
            </div>

            {/* Results Grid */}
            <div className="w-full">
                {filteredUsers.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4"><Search size={32} /></div>
                        <h3 className="text-lg font-medium text-slate-900">Никого не найдено</h3>
                        <p className="text-slate-500 max-w-xs mt-1">Попробуйте изменить параметры фильтрации или поисковый запрос</p>
                        <Button variant="secondary" className="mt-4" onClick={resetFilters}>Очистить фильтры</Button>
                    </div>
                ) : (
                    <>
                        {isGardenMode ? (
                            <div className="flex flex-wrap gap-4 md:gap-12 justify-center content-start p-4 md:p-12 min-h-[50vh] bg-gradient-to-b from-green-50/30 to-blue-50/10 rounded-[3rem] border border-green-100/50">
                                {filteredUsers.map(user => {
                                    const displayUser = (currentUser && user.id === currentUser.id) ? { ...user, ...currentUser } : user;
                                    // Determine tree level roughly by role or time (simplified to adult for now for helpers, sprout for newbies)
                                    const isNew = displayUser.join_date && (new Date() - new Date(displayUser.join_date) < 1000 * 60 * 60 * 24 * 30);
                                    const level = isNew ? 1 : 3;

                                    // Resolve tree name safely
                                    let treeName = displayUser.tree;
                                    // If tree is missing or looks like a number (invalid ID), try to calculate from DOB
                                    if (!treeName || !isNaN(treeName) || treeName === 'undefined') {
                                        if (displayUser.dob) {
                                            const druidData = getDruidTree(displayUser.dob);
                                            treeName = druidData.name;
                                        } else {
                                            treeName = "Дуб"; // Fallback
                                        }
                                    }

                                    return (
                                        <div
                                            key={user.id}
                                            onClick={() => onOpenLeader && onOpenLeader(displayUser)}
                                            className="group relative flex flex-col items-center cursor-pointer gap-3 min-w-[100px]"
                                        >
                                            {/* Circular Container with Flip Effect */}
                                            <div className="w-32 h-32 relative [perspective:1000px]">
                                                <div className="w-full h-full relative transition-all duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">

                                                    {/* Front Face: Tree */}
                                                    <div className="absolute inset-0 [backface-visibility:hidden] bg-white/40 rounded-full border border-white/60 shadow-sm flex items-center justify-center overflow-hidden">
                                                        <div className="w-full h-full">
                                                            <LivingTree
                                                                treeName={treeName}
                                                                season={getSeason()}
                                                                level={level}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Back Face: Avatar or Beautiful Placeholder */}
                                                    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-white rounded-full border-4 border-white shadow-xl flex items-center justify-center overflow-hidden">
                                                        {(displayUser.avatar || displayUser.avatar_url) ? (
                                                            <UserAvatar user={displayUser} size="xl" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
                                                                <Sparkles className="text-purple-300 w-12 h-12 opacity-80" strokeWidth={1.5} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Name Label - Permanently Visible */}
                                            <div className="flex flex-col items-center text-center z-20 max-w-[140px] mt-2">
                                                <span className="text-sm font-bold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors mb-0.5">
                                                    {displayUser.name}
                                                </span>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                                                    {getRoleLabel(displayUser.role)}
                                                </span>
                                                <span className="text-[10px] text-[#3e5c45] font-bold uppercase tracking-widest bg-[#f1f6f2] px-2.5 py-1 rounded-full mt-0.5 border border-[#e2e8e3]">
                                                    {treeName}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
                                {filteredUsers.map(user => {
                                    // Use currentUser data if it matches, to ensure latest profile data is used
                                    const displayUser = (currentUser && user.id === currentUser.id) ? { ...user, ...currentUser } : user;

                                    return (
                                        <UserCard
                                            key={user.id}
                                            user={displayUser}
                                            onClick={() => onOpenLeader && onOpenLeader(displayUser)}
                                        // Removed onSendRay propagation as it is no longer used in UserCard, but kept in prop if needed internally
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

        </div>
    );
};

export default MapView;
