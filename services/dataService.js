import { INITIAL_USERS, INITIAL_KNOWLEDGE, INITIAL_PRACTICES, INITIAL_CLIENTS } from '../data/data';
import { supabase } from '../supabaseClient';

import { ROLES } from '../utils/roles';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';

// Helper to simulate delay for local storage operations
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class LocalStorageService {
    constructor() {
        this.users = JSON.parse(localStorage.getItem('garden_users')) || INITIAL_USERS;
        this.knowledgeBase = JSON.parse(localStorage.getItem('garden_knowledgeBase')) || INITIAL_KNOWLEDGE;
        // Practices and Clients are currently component-level state in UserApp, 
        // but we should persist them too if we want full persistence.
        // For now, we'll keep them simple or mock them.
    }

    async login(email, password) {
        this.checkRateLimit(); // Rate Limit Check
        await delay(500);
        let user = this.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password);

        // Fallback: Check INITIAL_USERS (admin) code
        if (!user) {
            // ... (existing fallback logic)
            const initialAdmin = INITIAL_USERS.find(u => u.email === 'olga@skrebeyko.com');
            if (initialAdmin && initialAdmin.email.toLowerCase() === email.toLowerCase().trim() && initialAdmin.password === password) {
                user = initialAdmin;
            }
        }

        if (user) {
            localStorage.setItem('garden_currentUser', JSON.stringify(user));
            return user;
        }
        throw new Error('Неверный email или пароль');
    }

    async register(userData) {
        this.checkRateLimit(); // Rate Limit Check
        // verifyCaptcha(userData.captchaToken); // Captcha Logic Stub
        await delay(800);

        // Sanitize Input
        const sanitizedData = {
            ...userData,
            name: this._sanitize(userData.name),
            city: this._sanitize(userData.city),
            email: this._sanitize(userData.email)
        };

        const exists = this.users.find(u => u.email.toLowerCase() === sanitizedData.email.toLowerCase().trim());
        if (exists) throw new Error('Пользователь с таким email уже существует');

        const newUser = {
            id: Date.now(),
            ...sanitizedData,
            role: 'applicant', // Default role
            status: 'active'
        };
        // Remove password confirm or captcha fields if present
        delete newUser.confirmPassword;
        delete newUser.captchaToken;

        this.users.push(newUser);
        this._saveUsers();
        localStorage.setItem('garden_currentUser', JSON.stringify(newUser));
        return newUser;
    }

    // --- Security Helpers ---

    _sanitize(dirty) {
        if (typeof dirty !== 'string') return dirty;
        return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }); // Strip ALL tags by default for simple fields
    }

    _sanitizeRich(dirty) {
        if (typeof dirty !== 'string') return dirty;
        return DOMPurify.sanitize(dirty); // Allow safe HTML for rich text
    }

    _sanitizeFields(source, { plain = [], rich = [] } = {}) {
        const next = { ...source };
        plain.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = this._sanitize(next[key]);
            }
        });
        rich.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = this._sanitizeRich(next[key]);
            }
        });
        return next;
    }

    _sanitizeFields(source, { plain = [], rich = [] } = {}) {
        const next = { ...source };
        plain.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = this._sanitize(next[key]);
            }
        });
        rich.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = this._sanitizeRich(next[key]);
            }
        });
        return next;
    }

    checkRateLimit() {
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute
        const limit = 5;

        let attempts = JSON.parse(localStorage.getItem('garden_auth_attempts') || '[]');
        // Filter out old attempts
        attempts = attempts.filter(ts => now - ts < windowMs);

        if (attempts.length >= limit) {
            throw new Error('Слишком много попыток входа/регистрации. Подождите минуту.');
        }

        attempts.push(now);
        localStorage.setItem('garden_auth_attempts', JSON.stringify(attempts));
    }

    checkActionTimer() {
        const now = Date.now();
        const cooldownMs = 30 * 1000; // 30 seconds
        const lastAction = parseInt(localStorage.getItem('garden_last_action_ts') || '0');

        if (now - lastAction < cooldownMs) {
            const waitSec = Math.ceil((cooldownMs - (now - lastAction)) / 1000);
            throw new Error(`Подождите ${waitSec} сек. перед следующим действием.`);
        }

        localStorage.setItem('garden_last_action_ts', now.toString());
    }

    async logout() {
        localStorage.removeItem('garden_currentUser');
    }

    async updatePassword() {
        throw new Error('Смена пароля недоступна в локальном режиме');
    }

    async getCurrentUser() {
        return JSON.parse(localStorage.getItem('garden_currentUser'));
    }

    async getUsers() {
        return this.users;
    }

    async updateUser(updatedUser) {
        const sanitizeIfString = (val) => (typeof val === 'string' ? this._sanitize(val) : val);
        const sanitizedUser = {
            ...updatedUser,
            name: sanitizeIfString(updatedUser.name),
            city: sanitizeIfString(updatedUser.city),
            offer: sanitizeIfString(updatedUser.offer),
            unique_abilities: sanitizeIfString(updatedUser.unique_abilities),
            tree: sanitizeIfString(updatedUser.tree),
            tree_desc: sanitizeIfString(updatedUser.tree_desc),
            treeDesc: sanitizeIfString(updatedUser.treeDesc)
        };

        this.users = this.users.map(u => u.id === sanitizedUser.id ? sanitizedUser : u);
        this._saveUsers();
        // If updating current user, update session too
        const current = await this.getCurrentUser();
        if (current && current.id === sanitizedUser.id) {
            localStorage.setItem('garden_currentUser', JSON.stringify(sanitizedUser));
        }
        return sanitizedUser;
    }

    async incrementUserSeeds() {
        throw new Error('Начисление семян недоступно в локальном режиме');
    }

    // Knowledge Base
    async getKnowledgeBase() {
        return this.knowledgeBase;
    }

    async addKnowledgeBaseItem(item) {
        const sanitized = {
            ...item,
            title: this._sanitize(item.title),
            description: this._sanitize(item.description)
        };
        this.knowledgeBase.push(sanitized);
        localStorage.setItem('garden_knowledgeBase', JSON.stringify(this.knowledgeBase));
        return sanitized;
    }

    // Meetings (Mocked for local storage as they were in UserApp state)
    async getMeetings(userId) {
        const allMeetings = JSON.parse(localStorage.getItem('garden_meetings')) || [];
        return allMeetings.filter(m => m.user_id === userId); // Assuming we add user_id to meetings
    }

    async addMeeting(meeting) {
        const allMeetings = JSON.parse(localStorage.getItem('garden_meetings')) || [];
        const sanitized = this._sanitizeFields(meeting, {
            plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'payment_link']
        });
        const newMeeting = {
            ...sanitized,
            id: Date.now(),
            title: this._sanitize(sanitized.title),
            description: this._sanitize(sanitized.description)
        };
        allMeetings.push(newMeeting);
        localStorage.setItem('garden_meetings', JSON.stringify(allMeetings));
        return newMeeting;
    }

    async updateMeeting(meeting) {
        const allMeetings = JSON.parse(localStorage.getItem('garden_meetings')) || [];
        const index = allMeetings.findIndex(m => m.id === meeting.id);
        if (index !== -1) {
            const sanitized = this._sanitizeFields(meeting, {
                plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'payment_link']
            });
            allMeetings[index] = { ...allMeetings[index], ...sanitized };
            localStorage.setItem('garden_meetings', JSON.stringify(allMeetings));
            return allMeetings[index];
        }
        return meeting;
    }

    async deleteMeeting(meetingId) {
        const allMeetings = JSON.parse(localStorage.getItem('garden_meetings')) || [];
        const filtered = allMeetings.filter(m => m.id !== meetingId);
        localStorage.setItem('garden_meetings', JSON.stringify(filtered));
        return true;
    }

    // Practices
    async getPractices(userId) {
        // Fallback to initial data if empty, or local storage
        const stored = JSON.parse(localStorage.getItem('garden_practices'));
        return stored || INITIAL_PRACTICES;
    }

    async addPractice(practice) {
        const practices = await this.getPractices();
        const sanitized = this._sanitizeFields(practice, { plain: ['title', 'description'] });
        const newPractice = { ...sanitized, id: Date.now() };
        practices.unshift(newPractice);
        localStorage.setItem('garden_practices', JSON.stringify(practices));
        return newPractice;
    }

    async updatePractice(practice) {
        const practices = await this.getPractices();
        const index = practices.findIndex(p => p.id === practice.id);
        if (index !== -1) {
            const sanitized = this._sanitizeFields(practice, { plain: ['title', 'description'] });
            practices[index] = { ...practices[index], ...sanitized };
            localStorage.setItem('garden_practices', JSON.stringify(practices));
        }
        return practice;
    }

    // News
    async getNews() {
        return JSON.parse(localStorage.getItem('garden_news')) || [];
    }

    async addNews(item) {
        const news = await this.getNews();
        // Use sanitizeRich for news body as it might contain formatting
        const sanitizedNews = this._sanitizeFields({
            ...item,
            id: Date.now()
        }, { plain: ['title'], rich: ['body'] });
        news.unshift(sanitizedNews);
        localStorage.setItem('garden_news', JSON.stringify(news));
        return true;
    }

    async deleteNews(id) {
        const news = await this.getNews();
        const filtered = news.filter(n => n.id !== id);
        localStorage.setItem('garden_news', JSON.stringify(filtered));
        return true;
    }

    // Birthday Templates
    async getBirthdayTemplates() {
        const defaults = [
            "С Днем Рождения, {name}! 🎉\nЖелаем роста, процветания и много семян!",
            "Поздравляем с Днем Рождения, {name}! 🎂\nПусть каждый день будет наполнен светом и радостью!",
            "{name}, с твоим днем! 🥳\nЦвети и пахни, как самый прекрасный цветок в нашем Саду!"
        ];
        const local = JSON.parse(localStorage.getItem('garden_bday_templates')) || [];
        return [...defaults, ...local];
    }

    async addBirthdayTemplate(text) {
        const local = JSON.parse(localStorage.getItem('garden_bday_templates')) || [];
        local.push(text);
        localStorage.setItem('garden_bday_templates', JSON.stringify(local));
        return true;
    }

    // Scenarios
    async getScenarios(userId) {
        const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
        return allScenarios.filter(s => s.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    async addScenario(scenario) {
        const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
        const sanitized = this._sanitizeFields(scenario, { plain: ['title', 'author_name'] });
        const newScenario = { ...sanitized, id: Date.now(), created_at: new Date().toISOString() };
        allScenarios.push(newScenario);
        localStorage.setItem('garden_scenarios', JSON.stringify(allScenarios));
        return newScenario;
    }

    async saveScenario(scenario) {
        // Alias for addScenario or similar? It was separate in SupabaseService
        return this.addScenario(scenario);
    }

    async deleteScenario(scenarioId) {
        const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
        const filtered = allScenarios.filter(s => s.id !== scenarioId);
        localStorage.setItem('garden_scenarios', JSON.stringify(filtered));
        return true;
    }

    _saveUsers() {
        localStorage.setItem('garden_users', JSON.stringify(this.users));
    }

    async uploadAvatar(file) {
        // Shared compression helper (from SupabaseService logic)
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 300; // Keep it small for LocalStorage (5MB limit)
                    const scale = MAX_WIDTH / img.width;
                    const width = (scale < 1) ? MAX_WIDTH : img.width;
                    const height = (scale < 1) ? img.height * scale : img.height;

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Return Base64 string as the "URL"
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    resolve(dataUrl);
                };
                img.onerror = (err) => reject(new Error("Image load error"));
            };
            reader.onerror = (err) => reject(err);
        });
    }

    async compressMeetingImage(file) {
        if (!file) return file;

        try {
            const options = {
                maxSizeMB: 0.4,
                maxWidthOrHeight: 1200,
                useWebWorker: false,
                initialQuality: 0.75,
                fileType: 'image/jpeg'
            };
            return await imageCompression(file, options);
        } catch (error) {
            console.warn('Image compression failed, using original file:', error);
            return file;
        }
    }
}

class SupabaseService {
    // --- Security Helpers (Client-side) ---
    checkActionTimer() {
        const now = Date.now();
        const cooldownMs = 30 * 1000; // 30 seconds
        const lastAction = parseInt(localStorage.getItem('garden_last_action_ts') || '0');

        if (now - lastAction < cooldownMs) {
            const waitSec = Math.ceil((cooldownMs - (now - lastAction)) / 1000);
            throw new Error(`Подождите ${waitSec} сек. перед следующим действием.`);
        }

        localStorage.setItem('garden_last_action_ts', now.toString());
    }

    _sanitize(dirty) {
        if (typeof dirty !== 'string') return dirty;
        return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }

    _sanitizeRich(dirty) {
        if (typeof dirty !== 'string') return dirty;
        return DOMPurify.sanitize(dirty);
    }

    _sanitizeIfString(value) {
        return typeof value === 'string' ? this._sanitize(value) : value;
    }

    _sanitizeFields(source, { plain = [], rich = [] } = {}) {
        const next = { ...source };
        plain.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = this._sanitize(next[key]);
            }
        });
        rich.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = this._sanitizeRich(next[key]);
            }
        });
        return next;
    }

    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await this._ensureProfile(data.user);
        return this._fetchProfile(data.user.id);
    }

    async updatePassword(newPassword) {
        const { data, error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        return data;
    }

    async incrementUserSeeds(userIds, amount) {
        if (!Array.isArray(userIds) || userIds.length === 0) return;
        const { error } = await supabase.rpc('increment_user_seeds', { user_ids: userIds, amount });
        if (error) throw error;
        return true;
    }

    async register(userData) {
        const { email, password, isNew, ...rest } = userData;

        const profileDraft = {
            name: this._sanitizeIfString(rest.name),
            city: this._sanitizeIfString(rest.city),
            role: email === 'olga@skrebeyko.com' ? 'admin' : (rest.role || 'applicant'),
            tree: this._sanitizeIfString(rest.tree),
            tree_desc: this._sanitizeIfString(rest.treeDesc),
            seeds: rest.seeds || 0,
            avatar_url: this._sanitizeIfString(rest.avatar) || null,
            dob: rest.dob || null,
            x: rest.x || (Math.random() * 80 + 10),
            y: rest.y || (Math.random() * 80 + 10),
        };

        // 1. Sign Up
        // We remove emailRedirectTo to rely on Supabase "Site URL" setting to avoid 400 mismatches.
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                // Temporary storage until profile row is created (email confirmation flow)
                data: profileDraft
            }
        });

        if (error) {
            console.error("SignUp Error:", error);
            // Handle "User already registered" specifically
            if (error.message.includes("already registered")) {
                const { data: signinData, error: signinError } = await supabase.auth.signInWithPassword({ email, password });
                if (signinError) {
                    if (signinError.message.includes("Email not confirmed")) {
                        // User exists but unconfirmed. We can't log them in yet.
                        alert("Этот email уже зарегистрирован, но не подтвержден. Проверьте почту!");
                        return null;
                    }
                    throw new Error("Пользователь уже существует. Попробуйте войти.");
                }
                return await this._fetchProfile(signinData.user.id);
            }
            throw error;
        }

        // 2. If SignUp successful but no session -> Email Confirmation Required
        if (data.user && !data.session) {
            alert("Регистрация успешна! Мы отправили письмо на " + email + ". Подтвердите почту, чтобы войти.");
            // Return null so we don't 'login' the user into a broken state
            return null;
        }

        // 3. If we have a session (Email auto-confirm is ON or similar), create profile
        if (data.user && data.session) {
            const profileData = { ...profileDraft };
            // Fix keys for DB
            if (profileDraft.treeDesc) { profileData.tree_desc = profileDraft.treeDesc; delete profileData.treeDesc; }

            try {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert([{ id: data.user.id, ...profileData }]);
                if (profileError) console.warn("Profile write failed", profileError);
            } catch (e) {
                console.warn("Profile write exception", e);
            }
        }

        // 4. Return Profile (from DB or Meta)
        try {
            const profile = await this._fetchProfile(data.user.id);
            if (profile) return profile;
            throw new Error("Profile fetch returned null");
        } catch (e) {
            return {
                id: data.user.id,
                email,
                ...profileDraft,
                tree_desc: profileDraft.treeDesc || profileDraft.tree_desc
            };
        }
    }

    async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        if (error) {
            console.error("Reset Password Error:", error);
            if (error.status === 429) {
                alert("Слишком много попыток. Подождите минуту.");
            } else if (error.status === 400 || (error.message && error.message.includes("redirect_to"))) {
                alert(`Ошибка конфигурации (400). Убедитесь, что URL ${window.location.origin} добавлен в 'Redirect URLs' в настройках Supabase Auth.`);
            } else {
                alert(`Ошибка сброса: ${error.message}`);
            }
            throw error;
        }
        return true;
    }

    async uploadAvatar(file) {
        // Simple compression helper
        const compress = (f) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(f);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 500; // Optimize for avatar size (500px is plenty)
                    const scale = MAX_WIDTH / img.width;
                    if (scale >= 1) { resolve(f); return; } // Don't upscale or process small images

                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], f.name.replace(/\.[^/.]+$/, ".jpg"), { type: 'image/jpeg' }));
                    }, 'image/jpeg', 0.8);
                };
            };
        });

        const compressedFile = await compress(file);
        const fileExt = 'jpg'; // We convert to jpeg
        const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, compressedFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        return data.publicUrl;
    }

    async compressMeetingImage(file) {
        if (!file) return file;

        try {
            const options = {
                maxSizeMB: 0.4,
                maxWidthOrHeight: 1200,
                useWebWorker: false,
                initialQuality: 0.75,
                fileType: 'image/jpeg'
            };
            return await imageCompression(file, options);
        } catch (error) {
            console.warn('Image compression failed, using original file:', error);
            return file;
        }
    }

    async logout() {
        await supabase.auth.signOut();
    }

    async getCurrentUser() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return null;
        await this._ensureProfile(session.user);
        return this._fetchProfile(session.user.id);
    }

    async _ensureProfile(user) {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', user.id)
                .single();
            if (data && data.id) return;
            if (error && error.code && error.code !== 'PGRST116') {
                console.warn("Profile check failed:", error);
                return;
            }

            const meta = user.user_metadata || {};
            const draft = {
                id: user.id,
                email: user.email,
                name: meta.name || null,
                city: meta.city || null,
                role: user.email === 'olga@skrebeyko.com' ? 'admin' : (meta.role || 'applicant'),
                tree: meta.tree || null,
                tree_desc: meta.tree_desc || meta.treeDesc || null,
                seeds: meta.seeds || 0,
                avatar_url: meta.avatar_url || meta.avatar || null,
                dob: meta.dob || null,
                x: meta.x || (Math.random() * 80 + 10),
                y: meta.y || (Math.random() * 80 + 10),
                skills: Array.isArray(meta.skills) ? meta.skills.map(String) : [],
                offer: meta.offer || null,
                unique_abilities: meta.unique_abilities || null,
                join_date: meta.join_date || null,
                status: meta.status || 'active'
            };

            const { error: insertError } = await supabase
                .from('profiles')
                .upsert([draft]);
            if (insertError) console.warn("Profile upsert failed:", insertError);
        } catch (e) {
            console.warn("Profile ensure failed:", e);
        }
    }

    async _fetchProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        // Safety check: force admin role for olga regardless of what DB says
        if (data && data.email === 'olga@skrebeyko.com') {
            data.role = 'admin';
            data.status = 'active'; // Admin cannot be suspended
        }

        if (data && data.status === 'suspended') {
            throw new Error("Ваш аккаунт приостановлен. Обратитесь к администратору.");
        }

        if (data) {
            // Best-effort hydrate missing fields from auth metadata (one-time sync)
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                const meta = authUser?.user_metadata || {};
                const metaOffer = typeof meta.offer === 'string' ? meta.offer.trim() : '';
                const metaUnique = typeof meta.unique_abilities === 'string'
                    ? meta.unique_abilities.trim()
                    : (typeof meta.uniqueAbilities === 'string' ? meta.uniqueAbilities.trim() : '');
                const offerMissing = !data.offer || String(data.offer).trim() === '';
                const uniqueMissing = !data.unique_abilities || String(data.unique_abilities).trim() === '';
                if ((offerMissing && metaOffer) || (uniqueMissing && metaUnique)) {
                    const patch = {};
                    if (offerMissing && metaOffer) patch.offer = metaOffer;
                    if (uniqueMissing && metaUnique) patch.unique_abilities = metaUnique;
                    if (Object.keys(patch).length > 0) {
                        await supabase.from('profiles').update(patch).eq('id', userId);
                        data.offer = patch.offer ?? data.offer;
                        data.unique_abilities = patch.unique_abilities ?? data.unique_abilities;
                    }
                }
            } catch (e) {
                console.warn("Profile metadata hydrate failed:", e);
            }

            // Map DB columns to UI expected keys (single source of truth)
            return {
                ...data,
                avatar: data.avatar_url, // Map avatar_url -> avatar
                treeDesc: data.tree_desc, // Map tree_desc -> treeDesc
                // Ensure role is respected
                role: data.email === 'olga@skrebeyko.com' ? 'admin' : data.role,
                dob: data.dob,
                seeds: data.seeds || 0,
                skills: Array.isArray(data.skills) ? data.skills : [],
                offer: data.offer || '',
                unique_abilities: data.unique_abilities || '',
                join_date: data.join_date
            };
        }

        return null;
    }

    async getUsers() {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        return (data || []).map((profile) => ({
            ...profile,
            avatar: profile.avatar_url || profile.avatar,
            skills: Array.isArray(profile.skills) ? profile.skills : [],
            offer: profile.offer || '',
            unique_abilities: profile.unique_abilities || ''
        }));
    }

    async updateUser(updatedUser) {
        const hasField = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const safeSkills = hasField(updatedUser, 'skills') && Array.isArray(updatedUser.skills)
            ? updatedUser.skills.map(String)
            : undefined;
        const safeDob = hasField(updatedUser, 'dob') ? (updatedUser.dob || null) : undefined;
        const safeJoinDate = hasField(updatedUser, 'join_date') ? (updatedUser.join_date || null) : undefined;
        const clean = {
            name: this._sanitizeIfString(updatedUser.name),
            city: this._sanitizeIfString(updatedUser.city),
            offer: this._sanitizeIfString(updatedUser.offer),
            unique_abilities: this._sanitizeIfString(updatedUser.unique_abilities),
            tree: this._sanitizeIfString(updatedUser.tree),
            tree_desc: this._sanitizeIfString(updatedUser.tree_desc),
            treeDesc: this._sanitizeIfString(updatedUser.treeDesc),
            avatar: this._sanitizeIfString(updatedUser.avatar),
            avatar_url: this._sanitizeIfString(updatedUser.avatar_url)
        };

        // 1. Update role/status first
        try {
            const roleStatusUpdate = {};
            if (hasField(updatedUser, 'role')) roleStatusUpdate.role = updatedUser.role;
            if (hasField(updatedUser, 'status')) roleStatusUpdate.status = updatedUser.status;

            if (Object.keys(roleStatusUpdate).length > 0) {
                const { error: roleError } = await supabase
                    .from('profiles')
                    .update(roleStatusUpdate)
                    .eq('id', updatedUser.id);
                if (roleError) throw roleError;
            }
        } catch (e) {
            console.warn("Role/status update failed:", e);
            throw e;
        }

        // 2. Update profile fields
        try {
            const dbUser = { id: updatedUser.id };
            if (hasField(updatedUser, 'name')) dbUser.name = clean.name;
            if (hasField(updatedUser, 'city')) dbUser.city = clean.city;
            if (hasField(updatedUser, 'tree')) dbUser.tree = clean.tree;
            if (hasField(updatedUser, 'tree_desc') || hasField(updatedUser, 'treeDesc')) {
                dbUser.tree_desc = clean.tree_desc || clean.treeDesc;
            }
            if (hasField(updatedUser, 'seeds')) dbUser.seeds = updatedUser.seeds;
            if (hasField(updatedUser, 'avatar') || hasField(updatedUser, 'avatar_url')) {
                dbUser.avatar_url = clean.avatar || clean.avatar_url;
            }
            if (hasField(updatedUser, 'x')) dbUser.x = updatedUser.x;
            if (hasField(updatedUser, 'y')) dbUser.y = updatedUser.y;
            if (safeDob !== undefined) dbUser.dob = safeDob;
            if (safeSkills !== undefined) dbUser.skills = safeSkills;
            if (hasField(updatedUser, 'offer')) dbUser.offer = clean.offer;
            if (hasField(updatedUser, 'unique_abilities')) dbUser.unique_abilities = clean.unique_abilities;
            if (safeJoinDate !== undefined) dbUser.join_date = safeJoinDate;

            const { error } = await supabase
                .from('profiles')
                .update(dbUser)
                .eq('id', dbUser.id);

            if (error) {
                console.warn("Profile table update failed.", error);
                // Optional: Retry with only safe fields? 
            }
        } catch (e) {
            console.warn("Profile update exception:", e);
        }

        // Return the full object so UI updates optimistically
        return updatedUser;
    }

    async deleteUser(userId) {
        // We can only delete from public.profiles from client.
        // Auth user deletion requires service_role key.
        // So we will just delete profile, effectively "hiding" them and breaking their profile access.
        const { error, count } = await supabase
            .from('profiles')
            .delete({ count: 'exact' })
            .eq('id', userId);
        if (error) throw error;
        if (count === 0) throw new Error("Не удалось удалить (нет прав или пользователь не найден)");
        return true;
    }

    async toggleUserStatus(userId, newStatus) {
        const { error, count } = await supabase
            .from('profiles')
            .update({ status: newStatus }, { count: 'exact' })
            .eq('id', userId);
        if (error) throw error;
        if (count === 0) throw new Error("Не удалось обновить статус (нет прав)");
        return true;
    }


    // Knowledge Base
    async getKnowledgeBase() {
        const { data, error } = await supabase.from('knowledge_base').select('*').order('created_at', { ascending: false });
        if (error) {
            console.warn("KB fetch failed, using local", error);
            return [];
        }
        return data;
    }

    async addKnowledge(item) {
        // Sanitize
        this.checkActionTimer();
        const sanitized = this._sanitizeFields(
            { ...item, content: item.content || item.body || '' },
            { plain: ['title', 'description'], rich: ['content'] }
        );
        const { id, ...rest } = sanitized;
        const { error } = await supabase.from('knowledge_base').insert([rest]);
        if (error) throw error;
        return true;
    }

    async addKnowledgeBaseItem(item) {
        // No table yet
        return item;
    }

    async deleteKnowledge(id) {
        const { error } = await supabase
            .from('knowledge_base')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    }

    // Course progress
    async getCourseProgress(userId, courseTitle) {
        let query = supabase
            .from('course_progress')
            .select('material_id')
            .eq('user_id', userId);

        if (courseTitle) {
            query = query.eq('course_title', courseTitle);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(row => row.material_id);
    }

    async markCourseLessonCompleted(userId, materialId, courseTitle) {
        const payload = {
            user_id: userId,
            material_id: String(materialId),
            course_title: courseTitle
        };

        const { data, error } = await supabase
            .from('course_progress')
            .insert([payload])
            .select('material_id')
            .single();

        if (error) {
            if (error.code === '23505') {
                return { inserted: false };
            }
            throw error;
        }

        return { inserted: !!data };
    }

    async getMeetings(userId) {
        const { data, error } = await supabase
            .from('meetings')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: false });
        if (error) throw error;
        return data;
    }

    async uploadMeetingImage(file) {
        if (!file) return null;

        const fileToUpload = await this.compressMeetingImage(file);

        try {
            const fileExt = file.name.split('.').pop();
            const ext = fileToUpload.type === 'image/jpeg' ? 'jpg' : fileExt;
            const fileName = `meeting_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('event-images')
                .upload(filePath, fileToUpload);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('event-images').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error) {
            console.error('Image upload failed:', error);
            throw error;
        }
    }

    async addMeeting(meeting) {
        const toIntOrNull = (value) => {
            if (value === '' || value === null || value === undefined) return null;
            const n = parseInt(value, 10);
            return Number.isNaN(n) ? null : n;
        };
        const cleaned = this._sanitizeFields(meeting, {
            plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'payment_link']
        });
        const sanitized = {
            user_id: cleaned.user_id,
            title: cleaned.title,
            description: cleaned.description,
            date: cleaned.date,
            time: cleaned.time,
            guests: toIntOrNull(cleaned.guests),
            new_guests: toIntOrNull(cleaned.new_guests),
            income: toIntOrNull(cleaned.income),
            keep_notes: cleaned.keep_notes,
            change_notes: cleaned.change_notes,
            fail_reason: cleaned.fail_reason,
            status: cleaned.status || 'planned',
            checklist: cleaned.checklist || [],
            scenario_id: cleaned.scenario_id,
            tags: cleaned.tags,
            rescheduled_to: cleaned.rescheduled_to,
            // New Public Schedule Fields
            is_public: cleaned.is_public,
            cost: cleaned.cost,
            address: cleaned.address,
            city: cleaned.city,
            payment_link: cleaned.payment_link,
            cover_image: cleaned.cover_image,
            duration: toIntOrNull(cleaned.duration),
            co_hosts: Array.isArray(cleaned.co_hosts) ? cleaned.co_hosts : [],
            seeds_awarded: cleaned.seeds_awarded
        };
        // Remove undefined keys to let DB defaults work
        Object.keys(sanitized).forEach(key => sanitized[key] === undefined && delete sanitized[key]);

        const { data, error } = await supabase
            .from('meetings')
            .insert([sanitized])
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updateMeeting(meeting) {
        const { id, ...rest } = meeting;
        const toIntOrNull = (value) => {
            if (value === '' || value === null || value === undefined) return null;
            const n = parseInt(value, 10);
            return Number.isNaN(n) ? null : n;
        };
        const cleaned = this._sanitizeFields(rest, {
            plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'payment_link']
        });
        // Sanitize fields
        const sanitized = {
            title: cleaned.title,
            description: cleaned.description,
            keep_notes: cleaned.keep_notes,
            change_notes: cleaned.change_notes,
            fail_reason: cleaned.fail_reason,
            status: cleaned.status,
            date: cleaned.date,
            time: cleaned.time,
            guests: toIntOrNull(cleaned.guests),
            new_guests: toIntOrNull(cleaned.new_guests),
            income: toIntOrNull(cleaned.income),
            scenario_id: cleaned.scenario_id === '' ? null : cleaned.scenario_id,
            checklist: cleaned.checklist,
            // New Public Schedule Fields
            is_public: cleaned.is_public,
            cost: cleaned.cost,
            address: cleaned.address,
            city: cleaned.city,
            payment_link: cleaned.payment_link,
            cover_image: cleaned.cover_image,
            duration: toIntOrNull(cleaned.duration),
            co_hosts: Array.isArray(cleaned.co_hosts) ? cleaned.co_hosts : [],
            seeds_awarded: cleaned.seeds_awarded
        };

        // Remove undefined keys to avoid sending empty updates for partial objects
        Object.keys(sanitized).forEach(key => sanitized[key] === undefined && delete sanitized[key]);

        const { data, error } = await supabase
            .from('meetings')
            .update(sanitized)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteMeeting(meetingId) {
        const { error } = await supabase
            .from('meetings')
            .delete()
            .eq('id', meetingId);
        if (error) throw error;
        return true;
    }

    async getAllMeetings() {
        const { data, error } = await supabase
            .from('meetings')
            .select('*')
            .order('date', { ascending: false });
        if (error) {
            console.warn("Global meetings fetch failed", error);
            return [];
        }
        return data;
    }


    // Practices
    async getPractices(userId) {
        const { data, error } = await supabase
            .from('practices')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    }

    async addPractice(practice) {
        // Remove ID if present to ensure DB autoincrement works, or handle client-side IDs
        // Since we used Date.now() for IDs locally, we should let DB handle it for persistence
        // OR we can keep using BIGINT if we want. Let's let DB handle it.
        const { id, ...rest } = practice;
        const sanitized = this._sanitizeFields(rest, { plain: ['title', 'description'] });
        const { data, error } = await supabase
            .from('practices')
            .insert([sanitized])
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updatePractice(practice) {
        const { id, ...rest } = practice;
        const sanitized = this._sanitizeFields(rest, { plain: ['title', 'description'] });
        const { error } = await supabase
            .from('practices')
            .update(sanitized)
            .eq('id', id);
        if (error) throw error;
        return true;
    }

    async deletePractice(practiceId) {
        const { error } = await supabase
            .from('practices')
            .delete()
            .eq('id', practiceId);
        if (error) throw error;
        return true;
    }

    // CRM Clients
    async getClients(userId) {
        // Mocking for now using LocalStorage 
        const allClients = JSON.parse(localStorage.getItem('garden_clients')) || [];
        return allClients.filter(c => c.user_id === userId);
    }

    async addClient(client) {
        const allClients = JSON.parse(localStorage.getItem('garden_clients')) || [];
        const newClient = { ...client, id: Date.now(), created_at: new Date().toISOString() };
        allClients.unshift(newClient);
        localStorage.setItem('garden_clients', JSON.stringify(allClients));
        return newClient;
    }

    async updateClient(client) {
        const allClients = JSON.parse(localStorage.getItem('garden_clients')) || [];
        const index = allClients.findIndex(c => c.id === client.id);
        if (index !== -1) {
            allClients[index] = { ...allClients[index], ...client };
            localStorage.setItem('garden_clients', JSON.stringify(allClients));
            return allClients[index];
        }
        return client;
    }

    async deleteClient(clientId) {
        const allClients = JSON.parse(localStorage.getItem('garden_clients')) || [];
        const filtered = allClients.filter(c => c.id !== clientId);
        localStorage.setItem('garden_clients', JSON.stringify(filtered));
        return true;
    }

    // News
    async getNews() {
        const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
        if (error) {
            console.warn("News fetch failed (table might be missing), using fallback", error);
            const localNews = JSON.parse(localStorage.getItem('garden_news')) || [];
            return localNews;
        }
        return data;
    }

    async addNews(item) {
        this.checkActionTimer();
        const sanitized = this._sanitizeFields(item, { plain: ['title'], rich: ['body'] });
        const { id, ...rest } = sanitized;
        const { error } = await supabase.from('news').insert([rest]);
        if (error) {
            console.warn("News insert failed, saving locally", error);
            const localNews = JSON.parse(localStorage.getItem('garden_news')) || [];
            localNews.unshift(sanitized);
            localStorage.setItem('garden_news', JSON.stringify(localNews));
            return true;
        }
        return true;
    }

    async updateNews(item) {
        const { id, ...rest } = item;
        const sanitized = this._sanitizeFields(rest, { plain: ['title'], rich: ['body'] });
        const { error } = await supabase
            .from('news')
            .update(sanitized)
            .eq('id', id);
        if (error) throw error;
        return true;
    }

    async deleteNews(newsId) {
        const { error } = await supabase
            .from('news')
            .delete()
            .eq('id', newsId);
        if (error) throw error;
        return true;
    }

    // Birthday Templates
    async getBirthdayTemplates() {
        // Fallback to local storage (since we lack a table for now)
        const defaults = [
            "С Днем Рождения, {name}! 🎉\nЖелаем роста, процветания и много семян!",
            "Поздравляем с Днем Рождения, {name}! 🎂\nПусть каждый день будет наполнен светом и радостью!",
            "{name}, с твоим днем! 🥳\nЦвети и пахни, как самый прекрасный цветок в нашем Саду!"
        ];
        const local = JSON.parse(localStorage.getItem('garden_bday_templates')) || [];
        return [...defaults, ...local];
    }

    async addBirthdayTemplate(text) {
        // Local storage only for now
        const local = JSON.parse(localStorage.getItem('garden_bday_templates')) || [];
        local.push(text);
        localStorage.setItem('garden_bday_templates', JSON.stringify(local));
        return true;
    }

    // Scenarios
    // Scenarios
    async getScenarios(userId) {
        const { data, error } = await supabase
            .from('scenarios')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn("Scenarios fetch failed, checking local", error);
            const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
            return allScenarios.filter(s => s.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at));
        }

        // Auto-migration: If DB is empty but we have local data, move it to DB
        if (data.length === 0) {
            const localScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
            const userLocalScenarios = localScenarios.filter(s => s.user_id === userId);

            if (userLocalScenarios.length > 0) {
                console.log("Migrating scenarios to Supabase...");
                const toInsert = userLocalScenarios.map(s => ({
                    user_id: s.user_id,
                    title: this._sanitize(s.title),
                    timeline: s.timeline,
                    is_public: s.is_public || false,
                    author_name: this._sanitize(s.author_name || ''),
                    created_at: s.created_at || new Date().toISOString()
                }));

                const { data: migratedData, error: migrationError } = await supabase
                    .from('scenarios')
                    .insert(toInsert)
                    .select();

                if (!migrationError && migratedData) {
                    // Optional: Clear local storage or mark migrated? 
                    // keeping logic simple for now.
                    return migratedData.sort((a, b) => b.created_at.localeCompare(a.created_at));
                }
                // If migration fails, return local so user keeps seeing them
                return userLocalScenarios;
            }
        }

        return data;
    }

    async getPublicScenarios() {
        const { data, error } = await supabase
            .from('scenarios')
            .select('*')
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn("Public scenarios fetch failed", error);
            return [];
        }
        return data;
    }

    async addScenario(scenario) {
        this.checkActionTimer();
        const sanitized = this._sanitizeFields({
            user_id: scenario.user_id,
            title: this._sanitize(scenario.title),
            timeline: scenario.timeline, // JSONB
            is_public: scenario.is_public || false,
            author_name: scenario.author_name
        }, { plain: ['title', 'author_name'] });

        const { data, error } = await supabase
            .from('scenarios')
            .insert([sanitized])
            .select()
            .single();

        if (error) {
            console.warn("Scenario DB insert failed, saving locally", error);
            // Local storage fallback
            const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
            const newScenario = {
                ...sanitized,
                id: Date.now(),
                created_at: new Date().toISOString()
            };
            allScenarios.push(newScenario);
            localStorage.setItem('garden_scenarios', JSON.stringify(allScenarios));
            return newScenario;
        }
        return data;
    }

    async saveScenario(scenario) {
        // Alias for consistency
        return this.addScenario(scenario);
    }

    async deleteScenario(scenarioId) {
        const { error } = await supabase
            .from('scenarios')
            .delete()
            .eq('id', scenarioId);

        if (error) {
            console.warn("Scenario DB delete failed, trying local", error);
            // Try deleting from local storage just in case it was a local fallback item
            const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
            const filtered = allScenarios.filter(s => s.id !== scenarioId);
            localStorage.setItem('garden_scenarios', JSON.stringify(filtered));
            return true;
        }
        return true;
    }

    // Goals
    async getGoals(userId) {
        const { data, error } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    }

    async addGoal(goal) {
        const sanitized = this._sanitizeFields(
            { ...goal, related_tags: goal.related_tags || [] },
            { plain: ['title', 'description'] }
        );
        const { id, ...rest } = sanitized; // Ensure no ID is sent for insert
        const { data, error } = await supabase
            .from('goals')
            .insert([rest])
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updateGoal(goal) {
        const { id, user_id, created_at, ...rest } = goal; // Exclude immutable fields
        const sanitized = this._sanitizeFields(rest, { plain: ['title', 'description'] });
        const { data, error } = await supabase
            .from('goals')
            .update(sanitized)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteGoal(goalId) {
        const { error } = await supabase
            .from('goals')
            .delete()
            .eq('id', goalId);
        if (error) throw error;
        return true;
    }
}

// Export a singleton instance
// Export a singleton instance
const useLocalDb = import.meta.env.VITE_USE_LOCAL_DB === 'true';

export const api = useLocalDb ? new LocalStorageService() : new SupabaseService();
