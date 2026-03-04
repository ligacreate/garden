import { INITIAL_USERS, INITIAL_KNOWLEDGE, INITIAL_PRACTICES, INITIAL_CLIENTS } from '../data/data';
import { ROLES } from '../utils/roles';
import { DEFAULT_TIMEZONE } from '../utils/timezone';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';
const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.skrebeyko.ru';

const getAuthToken = () => localStorage.getItem('garden_auth_token') || '';
const setAuthToken = (token) => {
    if (token) localStorage.setItem('garden_auth_token', token);
    else localStorage.removeItem('garden_auth_token');
};
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const postgrestFetch = async (path, params = {}, options = {}) => {
    const url = new URL(path, POSTGREST_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const headers = { 'Content-Type': 'application/json' };
    if (options.count) headers['Prefer'] = 'count=exact';
    if (options.returnRepresentation) headers['Prefer'] = 'return=representation';

    const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text);
    }

    const data = await response.json();
    let count;
    if (options.count) {
        const range = response.headers.get('Content-Range');
        const match = range?.match(/\/(\d+)$/);
        if (match) count = Number(match[1]);
    }

    return { data, count };
};

const authFetch = async (path, options = {}) => {
    const url = new URL(path, AUTH_URL);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data?.error || data?.message || data?.detail || `Ошибка запроса (${response.status})`;
        throw new Error(message);
    }
    return data;
};

const extensionByContentType = (contentType) => {
    switch (contentType) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/webp':
            return 'webp';
        default:
            return 'bin';
    }
};

const buildUploadFileName = (folder, fileName, contentType) => {
    const ext = extensionByContentType(contentType);
    const rawBase = String(fileName || `${folder}-${Date.now()}`)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
    const base = rawBase || `${folder}-${Date.now()}`;
    return `${base}.${ext}`;
};

const SUPPORTED_UPLOAD_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STORAGE_SIGN_PATHS = ['/storage/sign', '/api/storage/sign'];

const convertImageToJpegFile = async (file, maxSize = 1200, quality = 0.82) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения.'));
    reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Формат изображения не поддерживается. Сохраните фото как JPG/PNG и попробуйте снова.'));
        img.onload = () => {
            const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
            const width = Math.max(1, Math.round(img.width * ratio));
            const height = Math.max(1, Math.round(img.height * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Не удалось обработать изображение.'));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Не удалось подготовить изображение для загрузки.'));
                    return;
                }
                const outName = buildUploadFileName('image', file.name || `image-${Date.now()}`, 'image/jpeg');
                resolve(new File([blob], outName, { type: 'image/jpeg' }));
            }, 'image/jpeg', quality);
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});

const resolveStorageSign = async (body) => {
    const token = getAuthToken();
    const bases = [AUTH_URL, POSTGREST_URL];
    const attempts = [];
    const payloadCandidates = [
        // Current contract
        {
            folder: body.folder,
            fileName: body.fileName,
            contentType: body.contentType
        },
        // Common snake_case contract
        {
            folder: body.folder,
            file_name: body.fileName,
            content_type: body.contentType
        },
        // Bucket/path style contract
        {
            bucket: body.folder,
            path: body.fileName,
            contentType: body.contentType
        },
        // Mixed legacy contract
        {
            bucket: body.folder,
            fileName: body.fileName,
            mimeType: body.contentType
        }
    ];

    for (const base of bases) {
        for (const path of STORAGE_SIGN_PATHS) {
            for (const payload of payloadCandidates) {
                const url = new URL(path, base);
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;

                try {
                    const response = await fetch(url.toString(), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload)
                    });
                    if (response.ok) {
                        const data = await response.json().catch(() => ({}));
                        const normalized = {
                            uploadUrl: data?.uploadUrl || data?.upload_url || data?.signedUrl || data?.signed_url || data?.data?.uploadUrl || data?.data?.upload_url,
                            publicUrl: data?.publicUrl || data?.public_url || data?.url || data?.publicURL || data?.data?.publicUrl || data?.data?.public_url
                        };
                        if (normalized.uploadUrl && normalized.publicUrl) return normalized;
                        attempts.push(`${url.host}${url.pathname}: ok-but-invalid`);
                        continue;
                    }
                    attempts.push(`${url.host}${url.pathname}: ${response.status}`);
                } catch (error) {
                    attempts.push(`${url.host}${url.pathname}: network`);
                }
            }
        }
    }

    throw new Error(`Ошибка запроса подписи файла (${attempts.join(', ')})`);
};

// Helper to simulate delay for local storage operations
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const LIBRARY_SETTINGS_STORAGE_KEY = 'garden_library_settings';
const DEFAULT_LIBRARY_SETTINGS = { hiddenCourses: [], materialOrder: {} };

const normalizeLibrarySettings = (raw) => {
    const hiddenCourses = Array.isArray(raw?.hiddenCourses)
        ? raw.hiddenCourses.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
    const materialOrder = raw?.materialOrder && typeof raw.materialOrder === 'object'
        ? Object.fromEntries(
            Object.entries(raw.materialOrder).map(([course, ids]) => [
                course,
                Array.isArray(ids) ? ids.map((id) => String(id)) : []
            ])
        )
        : {};
    return { hiddenCourses, materialOrder };
};

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
            leader_about: sanitizeIfString(updatedUser.leader_about),
            leader_signature: sanitizeIfString(updatedUser.leader_signature),
            telegram: sanitizeIfString(updatedUser.telegram),
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

    async getLibrarySettings() {
        const raw = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_STORAGE_KEY) || 'null');
        return normalizeLibrarySettings(raw || DEFAULT_LIBRARY_SETTINGS);
    }

    async saveLibrarySettings(settings) {
        const normalized = normalizeLibrarySettings(settings || DEFAULT_LIBRARY_SETTINGS);
        localStorage.setItem(LIBRARY_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
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
            description: this._sanitize(sanitized.description),
            timezone: meeting.timezone || DEFAULT_TIMEZONE
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
            allMeetings[index] = {
                ...allMeetings[index],
                ...sanitized,
                timezone: meeting.timezone || allMeetings[index].timezone || DEFAULT_TIMEZONE
            };
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

    // Events (public schedule) - local fallback
    async getAllEvents() {
        return JSON.parse(localStorage.getItem('garden_events')) || [];
    }

    async updateEvent(event) {
        const allEvents = JSON.parse(localStorage.getItem('garden_events')) || [];
        const index = allEvents.findIndex(e => e.id === event.id);
        if (index !== -1) {
            allEvents[index] = { ...allEvents[index], ...event };
            localStorage.setItem('garden_events', JSON.stringify(allEvents));
            return allEvents[index];
        }
        return event;
    }

    async deleteEvent(eventId) {
        const allEvents = JSON.parse(localStorage.getItem('garden_events')) || [];
        localStorage.setItem('garden_events', JSON.stringify(allEvents.filter(e => e.id !== eventId)));
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
        const sanitized = this._sanitizeFields(practice, {
            plain: ['title', 'description', 'short_goal', 'instruction_short', 'instruction_full', 'reflection_questions', 'time', 'type']
        });
        const newPractice = { ...sanitized, id: Date.now() };
        practices.unshift(newPractice);
        localStorage.setItem('garden_practices', JSON.stringify(practices));
        return newPractice;
    }

    async updatePractice(practice) {
        const practices = await this.getPractices();
        const index = practices.findIndex(p => p.id === practice.id);
        if (index !== -1) {
            const sanitized = this._sanitizeFields(practice, {
                plain: ['title', 'description', 'short_goal', 'instruction_short', 'instruction_full', 'reflection_questions', 'time', 'type']
            });
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
        // Alias for addScenario to keep backward-compatible method usage.
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
        // Shared compression helper reused across upload flows.
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
            const compressed = await imageCompression(file, options);
            if (SUPPORTED_UPLOAD_CONTENT_TYPES.has(compressed?.type)) {
                return compressed;
            }
            return await convertImageToJpegFile(compressed || file, 1200, 0.82);
        } catch (error) {
            console.warn('Image compression failed, converting via canvas:', error);
            return await convertImageToJpegFile(file, 1200, 0.82);
        }
    }
}

class RemoteApiService {
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

    _assertActive(profile) {
        if (profile?.status === 'suspended') {
            throw new Error("Ваш аккаунт приостановлен. Обратитесь к администратору.");
        }
        return profile;
    }

    async login(email, password) {
        const normalizedEmail = normalizeEmail(email);
        const data = await authFetch('/auth/login', { method: 'POST', body: { email: normalizedEmail, password } });
        if (data?.token) setAuthToken(data.token);
        const authUser = this._normalizeProfile(data.user);
        let profile = await this._fetchProfile(authUser?.id);

        // Safety net for partially migrated users: auth account exists but profile row is missing.
        if (!profile && authUser?.id) {
            await this._ensurePostgrestUser({
                ...data.user,
                ...authUser,
                email: normalizedEmail || authUser.email
            });
            profile = await this._fetchProfile(authUser.id);
        }

        return this._assertActive(profile || authUser);
    }

    async updatePassword(newPassword) {
        throw new Error('Смена пароля доступна через восстановление');
    }

    async incrementUserSeeds(userIds, amount) {
        if (!Array.isArray(userIds) || userIds.length === 0) return;
        try {
            await postgrestFetch('rpc/increment_user_seeds', {}, {
                method: 'POST',
                body: { user_ids: userIds, amount },
                returnRepresentation: true
            });
        } catch (e) {
            console.warn('increment_user_seeds failed', e);
            throw e;
        }
        return true;
    }

    async register(userData) {
        const { email, password, ...rest } = userData;
        const normalizedEmail = normalizeEmail(email);
        const payload = {
            email: normalizedEmail,
            password,
            name: this._sanitizeIfString(rest.name),
            city: this._sanitizeIfString(rest.city)
        };
        const data = await authFetch('/auth/register', { method: 'POST', body: payload });
        if (data?.token) setAuthToken(data.token);
        const created = this._normalizeProfile(data.user);
        if (created?.id) {
            await this._ensurePostgrestUser({
                ...data.user,
                ...created,
                email: normalizedEmail || created.email
            });
            const patch = {};
            if (rest.tree) patch.tree = this._sanitizeIfString(rest.tree);
            if (rest.treeDesc || rest.tree_desc) patch.tree_desc = this._sanitizeIfString(rest.treeDesc || rest.tree_desc);
            if (rest.dob) patch.dob = rest.dob;
            if (rest.seeds !== undefined) patch.seeds = rest.seeds;
            if (rest.x !== undefined) patch.x = rest.x;
            if (rest.y !== undefined) patch.y = rest.y;
            if (Object.keys(patch).length > 0) {
                await postgrestFetch('profiles', { id: `eq.${created.id}` }, {
                    method: 'PATCH',
                    body: patch,
                    returnRepresentation: true
                });
            }
        }
        return created;
    }

    async resetPassword(email) {
        await authFetch('/auth/request-reset', { method: 'POST', body: { email: normalizeEmail(email) } });
        return true;
    }

    async resetPasswordWithToken(token, newPassword) {
        await authFetch('/auth/reset', { method: 'POST', body: { token, new_password: newPassword } });
        return true;
    }

    async uploadAvatar(file) {
        if (!file) return null;
        const fileToUpload = await this.compressMeetingImage(file);
        return await this._uploadToS3(fileToUpload, 'avatars');
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
            const compressed = await imageCompression(file, options);
            if (SUPPORTED_UPLOAD_CONTENT_TYPES.has(compressed?.type)) {
                return compressed;
            }
            return await convertImageToJpegFile(compressed || file, 1200, 0.82);
        } catch (error) {
            console.warn('Image compression failed, converting via canvas:', error);
            return await convertImageToJpegFile(file, 1200, 0.82);
        }
    }

    async _uploadToS3(file, folder) {
        if (!file) return null;
        const contentType = file.type || 'image/jpeg';
        const fileName = buildUploadFileName(folder, file.name, contentType);
        const sign = await resolveStorageSign({ folder, fileName, contentType });

        if (!sign?.uploadUrl || !sign?.publicUrl) {
            throw new Error('Не удалось получить ссылку для загрузки файла.');
        }

        const uploadRes = await fetch(sign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file
        });

        if (!uploadRes.ok) {
            const details = await uploadRes.text().catch(() => '');
            throw new Error(details || 'Ошибка загрузки файла в хранилище.');
        }

        return sign.publicUrl;
    }

    async logout() {
        setAuthToken(null);
    }

    async getCurrentUser() {
        const token = getAuthToken();
        if (!token) return null;
        const data = await authFetch('/auth/me');
        const authUser = this._normalizeProfile(data.user);
        let profile = await this._fetchProfile(authUser?.id);
        if (!profile && authUser?.id) {
            await this._ensurePostgrestUser({ ...data.user, ...authUser });
            profile = await this._fetchProfile(authUser.id);
        }
        return this._assertActive(profile || authUser);
    }

    async _ensurePostgrestUser(user) {
        if (!user?.id) return;
        try {
            const { data } = await postgrestFetch('profiles', { select: 'id', id: `eq.${user.id}` });
            if (Array.isArray(data) && data.length > 0) return;

            const meta = user.user_metadata || {};
            const payload = {
                id: user.id,
                email: user.email || meta.email || null,
                name: user.name || meta.name || null,
                city: user.city || meta.city || null,
                role: user.role || meta.role || 'applicant',
                status: user.status || meta.status || 'active',
                tree: user.tree || meta.tree || null,
                tree_desc: user.tree_desc || meta.tree_desc || meta.treeDesc || null,
                seeds: user.seeds ?? meta.seeds ?? 0,
                avatar_url: user.avatar_url || user.avatar || meta.avatar_url || meta.avatar || null,
                x: user.x ?? meta.x ?? null,
                y: user.y ?? meta.y ?? null,
                skills: Array.isArray(user.skills) ? user.skills : (Array.isArray(meta.skills) ? meta.skills : []),
                offer: user.offer || meta.offer || null,
                unique_abilities: user.unique_abilities || meta.unique_abilities || null,
                leader_about: user.leader_about || meta.leader_about || null,
                leader_signature: user.leader_signature || meta.leader_signature || null,
                leader_reviews: Array.isArray(user.leader_reviews) ? user.leader_reviews : (Array.isArray(meta.leader_reviews) ? meta.leader_reviews : []),
                telegram: user.telegram || meta.telegram || null,
                join_date: user.join_date || meta.join_date || null
            };

            await postgrestFetch('profiles', {}, {
                method: 'POST',
                body: [payload],
                returnRepresentation: true
            });
        } catch (e) {
            console.warn('PostgREST user ensure failed:', e);
            throw new Error('Не удалось создать пользователя в новой базе. Напишите администратору.');
        }
    }

    async _ensureProfile(user) {
        // No-op in new auth flow (profile created by auth service)
    }

    async _fetchProfile(userId) {
        const { data } = await postgrestFetch('profiles', {
            select: '*',
            id: `eq.${userId}`
        });

        if (!data || data.length === 0) return null;
        return this._normalizeProfile(data[0]);
    }

    async getUsers() {
        const { data } = await postgrestFetch('profiles', { select: '*' });
        return (data || []).map((profile) => this._normalizeProfile(profile));
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
            leader_about: this._sanitizeIfString(updatedUser.leader_about),
            leader_signature: this._sanitizeIfString(updatedUser.leader_signature),
            telegram: this._sanitizeIfString(updatedUser.telegram),
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
                await postgrestFetch('profiles', { id: `eq.${updatedUser.id}` }, {
                    method: 'PATCH',
                    body: roleStatusUpdate,
                    returnRepresentation: true
                });
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
            if (hasField(updatedUser, 'leader_about')) dbUser.leader_about = clean.leader_about;
            if (hasField(updatedUser, 'leader_signature')) dbUser.leader_signature = clean.leader_signature;
            if (hasField(updatedUser, 'leader_reviews')) dbUser.leader_reviews = updatedUser.leader_reviews;
            if (hasField(updatedUser, 'telegram')) dbUser.telegram = clean.telegram;
            if (safeJoinDate !== undefined) dbUser.join_date = safeJoinDate;

            await postgrestFetch('profiles', { id: `eq.${dbUser.id}` }, {
                method: 'PATCH',
                body: dbUser,
                returnRepresentation: true
            });
        } catch (e) {
            console.warn("Profile update exception:", e);
        }

        // Return the full object so UI updates optimistically
        return updatedUser;
    }

    async deleteUser(userId) {
        await postgrestFetch('profiles', { id: `eq.${userId}` }, {
            method: 'DELETE',
            returnRepresentation: true
        });
        return true;
    }

    async toggleUserStatus(userId, newStatus) {
        await postgrestFetch('profiles', { id: `eq.${userId}` }, {
            method: 'PATCH',
            body: { status: newStatus },
            returnRepresentation: true
        });
        return true;
    }


    // Knowledge Base
    async getKnowledgeBase() {
        const { data } = await postgrestFetch('knowledge_base', { select: '*', order: 'created_at.desc' });
        return data || [];
    }

    async addKnowledge(item) {
        // Sanitize
        this.checkActionTimer();
        const sanitized = this._sanitizeFields(
            { ...item, content: item.content || item.body || '' },
            { plain: ['title', 'description'], rich: ['content'] }
        );
        const { id, ...rest } = sanitized;
        await postgrestFetch('knowledge_base', {}, { method: 'POST', body: [rest], returnRepresentation: true });
        return true;
    }

    async addKnowledgeBaseItem(item) {
        // No table yet
        return item;
    }

    async deleteKnowledge(id) {
        await postgrestFetch('knowledge_base', { id: `eq.${id}` }, { method: 'DELETE', returnRepresentation: true });
        return true;
    }

    async getLibrarySettings() {
        const raw = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_STORAGE_KEY) || 'null');
        return normalizeLibrarySettings(raw || DEFAULT_LIBRARY_SETTINGS);
    }

    async saveLibrarySettings(settings) {
        const normalized = normalizeLibrarySettings(settings || DEFAULT_LIBRARY_SETTINGS);
        localStorage.setItem(LIBRARY_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
    }

    // Course progress
    async getCourseProgress(userId, courseTitle) {
        const params = { select: 'material_id', user_id: `eq.${userId}` };
        if (courseTitle) params.course_title = `eq.${courseTitle}`;
        const { data } = await postgrestFetch('course_progress', params);
        return (data || []).map(row => row.material_id);
    }

    async markCourseLessonCompleted(userId, materialId, courseTitle) {
        const payload = {
            user_id: userId,
            material_id: String(materialId),
            course_title: courseTitle
        };

        try {
            const { data } = await postgrestFetch('course_progress', {}, {
                method: 'POST',
                body: [payload],
                returnRepresentation: true
            });
            return { inserted: Array.isArray(data) && data.length > 0 };
        } catch (e) {
            if (String(e.message).includes('23505')) return { inserted: false };
            throw e;
        }
    }

    async getMeetings(userId) {
        const { data } = await postgrestFetch('meetings', {
            select: '*',
            user_id: `eq.${userId}`,
            order: 'date.desc'
        });
        return data;
    }

    async uploadMeetingImage(file) {
        if (!file) return null;

        const fileToUpload = await this.compressMeetingImage(file);

        try {
            return await this._uploadToS3(fileToUpload, 'event-images');
        } catch (error) {
            console.error('Image upload failed:', error);
            throw error;
        }
    }

    async addMeeting(meeting) {
        await this._ensurePostgrestUser(await this.getCurrentUser());
        const toIntOrNull = (value) => {
            if (value === '' || value === null || value === undefined) return null;
            const n = parseInt(value, 10);
            return Number.isNaN(n) ? null : n;
        };
        const cleaned = this._sanitizeFields(meeting, {
            plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'city_key', 'payment_link', 'meeting_format', 'online_visibility']
        });
        const durationValue = toIntOrNull(cleaned.duration);
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
            city_key: cleaned.city_key,
            payment_link: cleaned.payment_link,
            cover_image: cleaned.cover_image,
            meeting_format: cleaned.meeting_format,
            online_visibility: cleaned.online_visibility,
            co_hosts: Array.isArray(cleaned.co_hosts) ? cleaned.co_hosts : [],
            seeds_awarded: cleaned.seeds_awarded,
            timezone: cleaned.timezone || DEFAULT_TIMEZONE
        };
        // Backward compatibility: don't send duration to DB until column exists.
        if (cleaned.duration !== undefined && cleaned.duration !== '') {
            sanitized.duration = durationValue;
        }
        // Remove undefined keys to let DB defaults work
        Object.keys(sanitized).forEach(key => sanitized[key] === undefined && delete sanitized[key]);

        const { data } = await postgrestFetch('meetings', {}, {
            method: 'POST',
            body: [sanitized],
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async updateMeeting(meeting) {
        const { id, ...rest } = meeting;
        const toIntOrNull = (value) => {
            if (value === '' || value === null || value === undefined) return null;
            const n = parseInt(value, 10);
            return Number.isNaN(n) ? null : n;
        };
        const cleaned = this._sanitizeFields(rest, {
            plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'city_key', 'payment_link', 'meeting_format', 'online_visibility']
        });
        // Sanitize fields
        const durationValue = toIntOrNull(cleaned.duration);
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
            city_key: cleaned.city_key,
            payment_link: cleaned.payment_link,
            cover_image: cleaned.cover_image,
            meeting_format: cleaned.meeting_format,
            online_visibility: cleaned.online_visibility,
            co_hosts: Array.isArray(cleaned.co_hosts) ? cleaned.co_hosts : [],
            seeds_awarded: cleaned.seeds_awarded,
            timezone: cleaned.timezone || DEFAULT_TIMEZONE
        };
        if (cleaned.duration !== undefined && cleaned.duration !== '') {
            sanitized.duration = durationValue;
        }

        // Remove undefined keys to avoid sending empty updates for partial objects
        Object.keys(sanitized).forEach(key => sanitized[key] === undefined && delete sanitized[key]);

        const { data } = await postgrestFetch('meetings', { id: `eq.${id}` }, {
            method: 'PATCH',
            body: sanitized,
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async deleteMeeting(meetingId) {
        await postgrestFetch('meetings', { id: `eq.${meetingId}` }, {
            method: 'DELETE',
            returnRepresentation: true
        });
        return true;
    }

    async getAllMeetings() {
        try {
            const { data } = await postgrestFetch('meetings', {
                select: '*',
                order: 'date.desc'
            });
            return data;
        } catch (error) {
            console.warn("Global meetings fetch failed", error);
            return [];
        }
    }

    async getAllEvents() {
        try {
            const { data } = await postgrestFetch('events', {
                select: 'id,title,description,date,city,city_key,time,location,category,image_url,image_focus_x,image_focus_y,price,registration_link,meeting_format,online_visibility,starts_at,day_date',
                order: 'date.desc'
            });
            return data;
        } catch (error) {
            console.warn("Events fetch failed", error);
            return [];
        }
    }

    async updateEvent(event) {
        const { id, ...rest } = event;
        const cleaned = this._sanitizeFields(rest, {
            plain: ['title', 'description', 'date', 'time', 'city', 'city_key', 'location', 'category', 'image_url', 'price', 'registration_link', 'meeting_format', 'online_visibility']
        });
        const focusX = rest.image_focus_x === '' || rest.image_focus_x === undefined ? null : parseInt(rest.image_focus_x, 10);
        const focusY = rest.image_focus_y === '' || rest.image_focus_y === undefined ? null : parseInt(rest.image_focus_y, 10);
        const { data } = await postgrestFetch('events', { id: `eq.${id}` }, {
            method: 'PATCH',
            body: {
                ...cleaned,
                image_focus_x: Number.isNaN(focusX) ? null : focusX,
                image_focus_y: Number.isNaN(focusY) ? null : focusY
            },
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async deleteEvent(eventId) {
        await postgrestFetch('events', { id: `eq.${eventId}` }, {
            method: 'DELETE',
            returnRepresentation: true
        });
        return true;
    }


    // Practices
    async getPractices(userId) {
        const { data } = await postgrestFetch('practices', {
            select: '*',
            user_id: `eq.${userId}`,
            order: 'created_at.desc'
        });
        return data;
    }

    async addPractice(practice) {
        // Remove ID if present to ensure DB autoincrement works, or handle client-side IDs
        // Since we used Date.now() for IDs locally, we should let DB handle it for persistence
        // OR we can keep using BIGINT if we want. Let's let DB handle it.
        const { id, ...rest } = practice;
        const sanitized = this._sanitizeFields(rest, {
            plain: ['title', 'description', 'short_goal', 'instruction_short', 'instruction_full', 'reflection_questions', 'time', 'type']
        });
        const { data } = await postgrestFetch('practices', {}, {
            method: 'POST',
            body: [sanitized],
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async updatePractice(practice) {
        const { id, ...rest } = practice;
        const sanitized = this._sanitizeFields(rest, {
            plain: ['title', 'description', 'short_goal', 'instruction_short', 'instruction_full', 'reflection_questions', 'time', 'type']
        });
        await postgrestFetch('practices', { id: `eq.${id}` }, {
            method: 'PATCH',
            body: sanitized,
            returnRepresentation: true
        });
        return true;
    }

    async deletePractice(practiceId) {
        await postgrestFetch('practices', { id: `eq.${practiceId}` }, {
            method: 'DELETE',
            returnRepresentation: true
        });
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
        const { data } = await postgrestFetch('news', { select: '*', order: 'created_at.desc' });
        return data || [];
    }

    async addNews(item) {
        this.checkActionTimer();
        const sanitized = this._sanitizeFields(item, { plain: ['title'], rich: ['body'] });
        const { id, ...rest } = sanitized;
        const { data } = await postgrestFetch('news', {}, { method: 'POST', body: [rest], returnRepresentation: true });
        return data?.[0] || null;
    }

    async updateNews(item) {
        const { id, ...rest } = item;
        const sanitized = this._sanitizeFields(rest, { plain: ['title'], rich: ['body'] });
        await postgrestFetch('news', { id: `eq.${id}` }, { method: 'PATCH', body: sanitized, returnRepresentation: true });
        return true;
    }

    async deleteNews(newsId) {
        await postgrestFetch('news', { id: `eq.${newsId}` }, { method: 'DELETE', returnRepresentation: true });
        return true;
    }

    // Birthday Templates
    async getBirthdayTemplates() {
        const defaults = [
            "С Днем Рождения, {name}! 🎉\nЖелаем роста, процветания и много семян!",
            "Поздравляем с Днем Рождения, {name}! 🎂\nПусть каждый день будет наполнен светом и радостью!",
            "{name}, с твоим днем! 🥳\nЦвети и пахни, как самый прекрасный цветок в нашем Саду!"
        ];
        try {
            const { data } = await postgrestFetch('birthday_templates', { select: '*', order: 'created_at.desc' });
            const fromDb = (data || [])
                .map(t => (t.text || t.template || t.body || '').trim())
                .filter(Boolean);
            return [...defaults, ...fromDb];
        } catch (e) {
            // Fallback to local storage if table not yet created
            const local = JSON.parse(localStorage.getItem('garden_bday_templates')) || [];
            return [...defaults, ...local];
        }
    }

    async addBirthdayTemplate(text) {
        if (!text) return false;
        const sanitized = this._sanitize(text);
        try {
            await postgrestFetch('birthday_templates', {}, {
                method: 'POST',
                body: [{ text: sanitized }],
                returnRepresentation: true
            });
            return true;
        } catch (e) {
            // Fallback to local storage if table not yet created
            const local = JSON.parse(localStorage.getItem('garden_bday_templates')) || [];
            local.push(sanitized);
            localStorage.setItem('garden_bday_templates', JSON.stringify(local));
            return true;
        }
    }

    // Scenarios
    // Scenarios
    async getScenarios(userId) {
        const { data } = await postgrestFetch('scenarios', {
            select: '*',
            user_id: `eq.${userId}`,
            order: 'created_at.desc'
        });
        return data || [];
    }

    async getPublicScenarios() {
        const { data } = await postgrestFetch('scenarios', {
            select: '*',
            is_public: 'eq.true',
            order: 'created_at.desc'
        });
        return data || [];
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

        const { data } = await postgrestFetch('scenarios', {}, {
            method: 'POST',
            body: [sanitized],
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async saveScenario(scenario) {
        // Alias for consistency
        return this.addScenario(scenario);
    }

    async deleteScenario(scenarioId) {
        await postgrestFetch('scenarios', { id: `eq.${scenarioId}` }, { method: 'DELETE', returnRepresentation: true });
        return true;
    }

    // Goals
    async getGoals(userId) {
        const currentUser = await this.getCurrentUser().catch(() => null);
        const resolvedUserId = await this._resolveGoalsUserId(userId, currentUser);
        const candidateIds = Array.from(new Set([userId, resolvedUserId].filter(Boolean)));
        const rows = [];

        for (const candidateId of candidateIds) {
            try {
                const { data } = await postgrestFetch('goals', {
                    select: '*',
                    user_id: `eq.${candidateId}`,
                    order: 'created_at.desc'
                });
                if (Array.isArray(data)) rows.push(...data);
            } catch (e) {
                // Some backends can reject mismatched id types in filters; try next candidate.
                console.warn('getGoals candidate lookup failed:', candidateId, e);
            }
        }

        const byId = new Map();
        rows.forEach((row) => {
            if (row && row.id !== undefined && row.id !== null) byId.set(row.id, row);
        });
        return Array.from(byId.values()).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }

    async addGoal(goal) {
        const currentUser = await this.getCurrentUser().catch(() => null);
        if (currentUser?.id) {
            try {
                await this._ensurePostgrestUser(currentUser);
            } catch (e) {
                console.warn('goal profile ensure failed:', e);
            }
        }

        const resolvedUserId = await this._resolveGoalsUserId(goal?.user_id, currentUser);
        const candidateUserIds = Array.from(new Set([
            resolvedUserId,
            currentUser?.id,
            goal?.user_id
        ].filter(Boolean)));

        const baseSanitized = this._sanitizeFields(
            { ...goal, related_tags: goal.related_tags || [] },
            { plain: ['title', 'description'] }
        );
        const { id, user_id, ...restGoal } = baseSanitized; // Ensure no ID is sent for insert

        let lastError = null;
        for (const candidateUserId of candidateUserIds) {
            try {
                const { data } = await postgrestFetch('goals', {}, {
                    method: 'POST',
                    body: [{ ...restGoal, user_id: candidateUserId }],
                    returnRepresentation: true
                });
                return Array.isArray(data) ? data[0] : data;
            } catch (e) {
                const msg = String(e?.message || '');
                lastError = e;
                if (msg.includes('goals_user_id_fkey') || msg.includes('"code":"23503"')) {
                    continue;
                }
                throw e;
            }
        }

        if (lastError) {
            const msg = String(lastError?.message || '');
            if (msg.includes('goals_user_id_fkey') || msg.includes('"code":"23503"')) {
                throw new Error('Не удалось привязать цель к вашему профилю. Обновите страницу и попробуйте снова.');
            }
        }
        throw new Error('Не удалось сохранить цель. Попробуйте снова.');
    }

    async updateGoal(goal) {
        const { id, user_id, created_at, ...rest } = goal; // Exclude immutable fields
        const sanitized = this._sanitizeFields(rest, { plain: ['title', 'description'] });
        const { data } = await postgrestFetch('goals', { id: `eq.${id}` }, {
            method: 'PATCH',
            body: sanitized,
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async deleteGoal(goalId) {
        await postgrestFetch('goals', { id: `eq.${goalId}` }, { method: 'DELETE', returnRepresentation: true });
        return true;
    }

    async _resolveGoalsUserId(requestedUserId, currentUser = null) {
        const candidateId = requestedUserId || currentUser?.id || null;
        if (!candidateId) return requestedUserId;

        // Primary path for current schema: goals.user_id -> auth.users.id
        try {
            const authMe = await authFetch('/auth/me');
            const authId = authMe?.user?.id;
            if (authId) return authId;
        } catch (e) {
            console.warn('goals auth user lookup failed:', e);
        }

        // Fallback for deployments where goals.user_id points to profiles.id
        try {
            const { data: profileById } = await postgrestFetch('profiles', {
                select: 'id',
                id: `eq.${candidateId}`,
                limit: '1'
            });
            if (Array.isArray(profileById) && profileById.length > 0) return profileById[0].id;
        } catch (e) {
            console.warn('goals profile lookup by id failed:', e);
        }

        const email = normalizeEmail(currentUser?.email || '');
        if (email) {
            try {
                const { data: profileByEmail } = await postgrestFetch('profiles', {
                    select: 'id',
                    email: `eq.${email}`,
                    limit: '1'
                });
                if (Array.isArray(profileByEmail) && profileByEmail.length > 0) return profileByEmail[0].id;
            } catch (e) {
                console.warn('goals profile lookup by email failed:', e);
            }
        }

        // Legacy fallback: deployments where goals.user_id points to public.users.id
        try {
            const { data: byId } = await postgrestFetch('users', {
                select: 'id',
                id: `eq.${candidateId}`,
                limit: '1'
            });
            if (Array.isArray(byId) && byId.length > 0) return byId[0].id;
        } catch (e) {
            console.warn('goals user lookup by id failed:', e);
        }

        if (email) {
            try {
                const { data: byEmail } = await postgrestFetch('users', {
                    select: 'id',
                    email: `eq.${email}`,
                    limit: '1'
                });
                if (Array.isArray(byEmail) && byEmail.length > 0) return byEmail[0].id;
            } catch (e) {
                console.warn('goals user lookup by email failed:', e);
            }
        }

        try {
            const payload = {
                id: candidateId,
                email: email || null,
                name: this._sanitizeIfString(currentUser?.name) || null,
                city: this._sanitizeIfString(currentUser?.city) || null
            };
            const { data: inserted } = await postgrestFetch('users', {}, {
                method: 'POST',
                body: [payload],
                returnRepresentation: true
            });
            if (Array.isArray(inserted) && inserted.length > 0 && inserted[0]?.id !== undefined) {
                return inserted[0].id;
            }
        } catch (e) {
            console.warn('goals user auto-create failed:', e);
        }

        return requestedUserId;
    }

    _normalizeProfile(profile) {
        if (!profile) return null;
        const data = { ...profile };
        if (data.email === 'olga@skrebeyko.com') {
            data.role = 'admin';
            data.status = 'active';
        }
        return {
            ...data,
            avatar: data.avatar_url || data.avatar,
            treeDesc: data.tree_desc || data.treeDesc,
            role: data.email === 'olga@skrebeyko.com' ? 'admin' : data.role,
            dob: data.dob,
            seeds: data.seeds || 0,
            skills: Array.isArray(data.skills) ? data.skills : [],
            offer: data.offer || '',
            unique_abilities: data.unique_abilities || '',
            leader_about: data.leader_about || '',
            leader_signature: data.leader_signature || '',
            leader_reviews: Array.isArray(data.leader_reviews) ? data.leader_reviews : [],
            telegram: data.telegram || '',
            join_date: data.join_date
        };
    }
}

// Export a singleton instance
const useLocalDb = import.meta.env.VITE_USE_LOCAL_DB === 'true';

export const api = useLocalDb ? new LocalStorageService() : new RemoteApiService();
