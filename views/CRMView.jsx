import React, { useState } from 'react';
import { UserPlus, Edit2, X } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';

const CRMView = ({ clients, onAddClient, onUpdateClient, onDeleteClient, onNotify }) => {
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [viewClient, setViewClient] = useState(null);
    const [clientForm, setClientForm] = useState({ name: '', contact: '', notes: '', status: 'new', lastVisit: '', lastContact: '' });

    const handleOpenAdd = () => { setEditingId(null); setClientForm({ name: '', contact: '', notes: '', status: 'new', lastVisit: '', lastContact: '' }); setIsClientModalOpen(true); };
    const handleOpenEdit = (c) => { setEditingId(c.id); setClientForm({ name: c.name, contact: c.contact, notes: c.notes, status: c.status, lastVisit: c.lastVisit, lastContact: c.lastContact }); setIsClientModalOpen(true); };
    const handleSave = () => { if (editingId) { onUpdateClient({ ...clientForm, id: editingId }); onNotify("Клиент обновлен"); } else { onAddClient(clientForm); onNotify("Новый клиент добавлен"); } setIsClientModalOpen(false); };

    return (
        <div className="h-full flex flex-col pt-6 px-4 lg:px-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-4xl font-light text-slate-800 tracking-tight">Люди</h1>
                    <p className="text-slate-400 mt-1 font-light">База контактов</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Клиентов</div>
                        <div className="font-mono text-xl text-blue-600">{clients.length}</div>
                    </div>
                    <Button variant="secondary" className="!p-2" onClick={handleOpenAdd}><UserPlus size={20} /></Button>
                </div>
            </div>
            {/* Client Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clients.map(c => {
                    // Reminder Logic
                    const daysInactive = c.lastContact ? Math.floor((new Date() - new Date(c.lastContact)) / (1000 * 60 * 60 * 24)) : null;
                    const isOverdue = daysInactive && daysInactive > 30;
                    // Also consider "new" interaction? or just if lastContact is old.
                    // If no contact ever, maybe also flag? existing logic: check if 'new' status.
                    // For now, only flag if lastContact > 30.

                    return (
                        <div
                            key={c.id}
                            onClick={() => setViewClient(c)}
                            className={`bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-sm border flex flex-col h-full group hover:shadow-xl hover:-translate-y-1 transition-all duration-500 relative cursor-pointer ${isOverdue ? 'border-amber-200 ring-1 ring-amber-200' : 'border-white/50'}`}
                        >
                            {/* Header: Icon & Edit */}
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="text-xl font-bold text-slate-600 bg-slate-50 w-12 h-12 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                                        {c.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-lg leading-tight">{c.name}</h3>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <span className={`px-3 py-1 inline-block rounded-full text-xs font-medium border border-dashed ${c.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                {c.status === 'new' ? 'Новый' : c.status}
                                            </span>
                                            {c.contact && (
                                                <span className="px-3 py-1 inline-block bg-white border border-dashed border-slate-300 rounded-full text-slate-600 text-xs font-medium">
                                                    {c.contact}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenEdit(c); }}
                                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"
                                >
                                    <Edit2 size={18} />
                                </button>
                            </div>

                            {/* Body: Notes */}
                            <div className="flex-1">
                                <p className="text-slate-600 text-[15px] leading-relaxed line-clamp-4 whitespace-pre-wrap">
                                    {c.notes || "Нет заметок..."}
                                </p>
                            </div>

                            {/* Footer: Dates if needed, or just padding */}
                            <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between text-xs text-slate-400 items-center">
                                <span>{c.lastVisit ? `Визит: ${new Date(c.lastVisit).toLocaleDateString()}` : ''}</span>
                                {isOverdue ? (
                                    <span className="text-amber-500 font-bold flex items-center gap-1">
                                        Давно не общались ({daysInactive} дн.)
                                    </span>
                                ) : (
                                    <span>{c.lastContact ? `Контакт: ${new Date(c.lastContact).toLocaleDateString()}` : ''}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            {isClientModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-slate-900">{editingId ? 'Редактировать клиента' : 'Новый клиент'}</h3>
                            <button onClick={() => setIsClientModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <Input placeholder="Имя и фамилия" value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} />
                            <Input placeholder="Контакты" value={clientForm.contact} onChange={e => setClientForm({ ...clientForm, contact: e.target.value })} />
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Дата рождения</label>
                                    <Input type="date" value={clientForm.birthDate} onChange={e => setClientForm({ ...clientForm, birthDate: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Последний контакт</label>
                                    <Input type="date" value={clientForm.lastContact} onChange={e => setClientForm({ ...clientForm, lastContact: e.target.value })} />
                                </div>
                            </div>
                            <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none h-20 resize-none text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" placeholder="Заметки..." value={clientForm.notes} onChange={e => setClientForm({ ...clientForm, notes: e.target.value })} />
                            <div className="flex gap-2">
                                {editingId && (
                                    <Button variant="danger" icon={X} className="!w-auto" onClick={() => {
                                        if (confirm('Удалить клиента?')) {
                                            if (onDeleteClient) onDeleteClient(editingId);
                                            setIsClientModalOpen(false);
                                        }
                                    }} />
                                )}
                                <Button onClick={handleSave} className="w-full">{editingId ? 'Сохранить изменения' : 'Добавить'}</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {viewClient && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setViewClient(null)}>
                    <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 border border-white/50 relative" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setViewClient(null)}
                            className="absolute top-6 right-6 p-2 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all"
                        >
                            <X size={24} />
                        </button>

                        <div className="flex items-center gap-6 mb-8">
                            <div className="text-4xl font-bold text-slate-600 bg-slate-50 w-24 h-24 rounded-3xl flex items-center justify-center border border-slate-100 shadow-sm flex-shrink-0">
                                {viewClient.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 mb-2 leading-tight">{viewClient.name}</h2>
                                <div className="flex flex-wrap gap-2">
                                    <span className={`px-3 py-1 inline-block rounded-full text-xs font-medium border border-dashed ${viewClient.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                        {viewClient.status === 'new' ? 'Новый' : viewClient.status}
                                    </span>
                                    {viewClient.contact && <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-xs font-medium border border-dashed border-slate-300">{viewClient.contact}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {(viewClient.birthDate || viewClient.lastVisit || viewClient.lastContact) && (
                                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div>
                                        <div className="text-xs text-slate-400 mb-1">Дата рождения</div>
                                        <div className="font-medium text-slate-700">{viewClient.birthDate ? new Date(viewClient.birthDate).toLocaleDateString() : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400 mb-1">Последний контакт</div>
                                        <div className="font-medium text-slate-700">{viewClient.lastContact ? new Date(viewClient.lastContact).toLocaleDateString() : '—'}</div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <h3 className="text-sm font-bold text-slate-900 mb-2">Заметки</h3>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-600 leading-relaxed whitespace-pre-wrap">
                                    {viewClient.notes || "Нет заметок..."}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => { setViewClient(null); handleOpenEdit(viewClient); }}>Редактировать</Button>
                            <Button onClick={() => setViewClient(null)}>Закрыть</Button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default CRMView;
