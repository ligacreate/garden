import React, { useState } from 'react';
import { ArrowLeft, Leaf, ArrowRight } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import { getDruidTree } from '../utils/druidHoroscope';

const AuthScreen = ({ onLogin, onNotify }) => {
    const [authMode, setAuthMode] = useState('welcome');
    const [step, setStep] = useState(1);
    const [regData, setRegData] = useState({ name: '', email: '', password: '', dob: '' });
    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [treeResult, setTreeResult] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');

    const handleRegisterCalculate = () => {
        if (!regData.name || !regData.email || !regData.password || !regData.dob) return;
        if (regData.password.length < 6) {
            alert("Пароль должен быть не менее 6 символов");
            return;
        }
        setIsProcessing(true);
        setTimeout(() => {
            const tree = getDruidTree(regData.dob);
            setTreeResult(tree);
            setIsProcessing(false);
            setStep(2);
        }, 1500);
    };

    // New users get random coords
    const handleRegisterComplete = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        const randX = Math.floor(Math.random() * 80) + 10;
        const randY = Math.floor(Math.random() * 80) + 10;

        try {
            const success = await onLogin({
                name: regData.name,
                email: regData.email,
                password: regData.password,
                dob: regData.dob, // Save DOB!
                tree: treeResult.name, // Still save name for legacy checks if any
                role: 'applicant',
                seeds: 0,
                isNew: true,
                x: randX,
                y: randY
            });

            if (success) {
                onNotify("Добро пожаловать в Сад!");
            }
        } catch (e) {
            console.error("Registration error details:", e); // Detailed log
            alert("Ошибка регистрации: " + (e.message || JSON.stringify(e) || "Проверьте данные"));
            if (e.message && (e.message.includes("password") || e.message.includes("6 characters"))) {
                setStep(1);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // ... (Login and Forgot logic remains same)
    const handleLoginSubmit = async () => {
        if (!loginData.email || !loginData.password) return;
        setIsProcessing(true);
        const success = await onLogin({ email: loginData.email, password: loginData.password });
        setIsProcessing(false);
        if (success) onNotify("С возвращением!");
    };

    const handleForgot = async () => {
        if (!forgotEmail) return;
        setIsProcessing(true);
        try {
            const success = await onLogin({ email: forgotEmail, isReset: true });
            if (success) {
                onNotify("Инструкция отправлена на почту");
                setShowForgot(false);
                setAuthMode('login');
            }
        } catch (e) {
            console.error(e);
            alert("Ошибка: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    if (showForgot) return (<div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6"><div className="w-full max-w-sm surface-card p-8 space-y-4"><button onClick={() => setShowForgot(false)} className="text-slate-400"><ArrowLeft size={20} /></button><h2 className="text-2xl font-display font-semibold text-slate-900">Восстановление</h2><Input placeholder="Email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} /><Button onClick={handleForgot} className="w-full">Сбросить пароль</Button></div></div>);

    if (authMode === 'welcome') return (<div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1/2 bg-blue-500/8 blur-3xl rounded-full translate-y-[-50%]" /><div className="w-full max-w-sm relative z-10 space-y-8 animate-in fade-in zoom-in duration-500"><div className="text-center space-y-4"><div className="w-20 h-20 bg-white/90 rounded-[2rem] shadow-[0_18px_40px_-24px_rgba(21,17,12,0.6)] flex items-center justify-center mx-auto text-blue-700 mb-6 border border-white/70"><Leaf size={40} /></div><h1 className="text-3xl font-display font-semibold text-slate-900">Сад ведущих</h1><p className="text-slate-600">Пространство роста для ведущих</p></div><div className="space-y-3"><Button onClick={() => setAuthMode('login')} variant="secondary" className="w-full">Войти</Button><Button onClick={() => setAuthMode('register')} variant="primary" className="w-full">Создать аккаунт</Button></div></div></div>);

    if (authMode === 'register') return (<div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 relative overflow-hidden"><div className="w-full max-w-md relative z-10">{step === 1 ? (<div className="surface-card p-8 space-y-4 animate-in slide-in-from-right-8 duration-500"><div className="flex items-center gap-2 mb-4"><button onClick={() => setAuthMode('welcome')}><ArrowLeft size={20} className="text-slate-400" /></button><h2 className="text-2xl font-display font-semibold text-slate-900">Регистрация</h2></div><div className="space-y-3"><Input placeholder="Имя и фамилия" value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} /><Input placeholder="Email" value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} /><Input type="password" placeholder="Пароль" value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} /><Input label="Введите дату рождения" type="date" value={regData.dob} max={new Date().toISOString().split("T")[0]} onChange={e => setRegData({ ...regData, dob: e.target.value })} /><p className="text-[10px] text-slate-400">Нужна для определения вашего дерева.</p></div><Button onClick={handleRegisterCalculate} className="w-full mt-4" disabled={!regData.email}>{isProcessing ? "Магия..." : "Далее"}</Button></div>) : (
        <div className="w-full max-w-sm mx-auto animate-in zoom-in duration-700">
            {/* Bento Card */}
            <div className="surface-card overflow-hidden mb-8">
                {/* Top: Image Area */}
                <div className="relative h-80 bg-slate-100">
                    {treeResult?.image ? (
                        <img
                            src={treeResult.image}
                            alt={treeResult.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-200">
                            <Leaf size={48} className="text-slate-400 opacity-50" />
                        </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/20 to-transparent" />

                    {/* Text Overlay */}
                    <div className="absolute bottom-6 left-6 text-white">
                        <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">Ваш покровитель</p>
                        <h1 className="text-4xl font-display font-semibold tracking-tight">{treeResult?.name}</h1>
                    </div>
                </div>

                {/* Bottom: Info Area */}
                <div className="p-6 flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Сильные стороны</p>
                        <p className="text-sm font-medium text-slate-700 leading-relaxed">
                            {treeResult?.description}
                        </p>
                    </div>

                    {/* Decorative "Map" Element */}
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                        <Leaf size={24} className="text-blue-600" />
                    </div>
                </div>
            </div>

            <Button
                onClick={handleRegisterComplete}
                variant="primary"
                className="w-full py-4 text-lg shadow-[0_18px_30px_-18px_rgba(47,111,84,0.6)] rounded-2xl"
                icon={ArrowRight}
                disabled={isProcessing}
            >
                {isProcessing ? "Обработка..." : "Начать выращивать свой сад"}
            </Button>
        </div>
    )}</div></div>);

    if (authMode === 'login') return (
        <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm surface-card p-8 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => setAuthMode('welcome')}><ArrowLeft size={20} className="text-slate-400" /></button>
                    <h2 className="text-2xl font-display font-semibold">Вход</h2>
                </div>
                <Input placeholder="Email" value={loginData.email} onChange={e => setLoginData({ ...loginData, email: e.target.value })} />
                <Input type="password" placeholder="Пароль" value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()} />
                <button onClick={() => setShowForgot(true)} className="text-xs text-blue-700 block w-full text-right">Забыли пароль?</button>
                <Button onClick={handleLoginSubmit} className="w-full mt-4" disabled={!loginData.email || isProcessing}>{isProcessing ? "Входим..." : "Войти"}</Button>
            </div>
        </div>
    );

    return null;
};

export default AuthScreen;
