import { INITIAL_USERS, INITIAL_KNOWLEDGE, INITIAL_PRACTICES, INITIAL_CLIENTS } from '../data/data';
import { ROLES } from '../utils/roles';
import { DEFAULT_TIMEZONE } from '../utils/timezone';
import DOMPurify from 'dompurify';
import imageCompression from 'browser-image-compression';

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';
const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.skrebeyko.ru';
const PUSH_URL = import.meta.env.VITE_PUSH_URL || AUTH_URL;

/** Если true — не передаём JWT в PostgREST (например локальный PostgREST без jwt-secret). */
const POSTGREST_SKIP_JWT = import.meta.env.VITE_POSTGREST_SKIP_JWT === 'true';

const getAuthToken = () => localStorage.getItem('garden_auth_token') || '';
const setAuthToken = (token) => {
    if (token) localStorage.setItem('garden_auth_token', token);
    else localStorage.removeItem('garden_auth_token');
};
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isPostgrestJwtMisconfigError = (bodyText) => {
    const t = String(bodyText || '');
    if (t.includes('PGRST300') || t.includes('PGRST302') || t.includes('JWT secret')) return true;
    try {
        const code = JSON.parse(t)?.code || '';
        return code === 'PGRST300' || code === 'PGRST302';
    } catch {
        return false;
    }
};

const postgrestFetch = async (path, params = {}, options = {}) => {
    const url = new URL(path, POSTGREST_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
    };
    if (!POSTGREST_SKIP_JWT) {
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (options.count) headers.Prefer = 'count=exact';
    if (options.returnRepresentation) headers.Prefer = 'return=representation';

    const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text();
        if (isPostgrestJwtMisconfigError(text)) {
            const err = new Error('PostgREST JWT secret misconfigured');
            err.code = 'POSTGREST_JWT_MISCONFIG';
            err.status = response.status;
            err.detail = text;
            throw err;
        }
        const err = new Error(text || `PostgREST error (${response.status})`);
        err.status = response.status;
        throw err;
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

const parsePostgrestErrorPayload = (error) => {
    const message = String(error?.message || '').trim();
    if (!message) return null;
    try {
        return JSON.parse(message);
    } catch {
        return null;
    }
};

const isMissingColumnError = (error, table, column) => {
    const payload = parsePostgrestErrorPayload(error);
    if (!payload || payload.code !== 'PGRST204') return false;
    const text = String(payload.message || '').toLowerCase();
    return text.includes(`'${column.toLowerCase()}'`) && text.includes(`'${table.toLowerCase()}'`);
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

const pushFetch = async (path, options = {}) => {
    const url = new URL(path, PUSH_URL);
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
        const message = data?.error || data?.message || data?.detail || `Ошибка push-запроса (${response.status})`;
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
const PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '';

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
const CHAT_MESSAGES_STORAGE_KEY = 'garden_chat_messages';
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const PUSH_SUBSCRIPTION_STORAGE_KEY = 'garden_push_enabled';
const IS_DEV_MODE = Boolean(import.meta.env?.DEV);

const isPushSupported = () =>
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

const isStandalonePwa = () =>
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true;

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

const stripHtmlToText = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

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

const normalizeScenarioTitle = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizeScenarioTimelineItem = (entry, index) => {
    if (typeof entry === 'string') {
        const title = entry.trim();
        if (!title) return null;
        return {
            title,
            description: '',
            type: 'Импорт',
            time: '10 мин',
            icon: '📝',
            custom: true
        };
    }

    if (!entry || typeof entry !== 'object') return null;
    const title = String(entry.title || entry.name || `Шаг ${index + 1}`).trim();
    if (!title) return null;

    const description = entry.description == null ? '' : String(entry.description);
    const type = entry.type == null ? 'Импорт' : String(entry.type);
    const time = entry.time == null ? '10 мин' : String(entry.time);
    const icon = entry.icon == null ? '📝' : String(entry.icon);

    return {
        ...entry,
        title,
        description,
        type,
        time,
        icon,
        custom: entry.custom ?? true
    };
};

const normalizeScenarioTimeline = (timeline) => {
    if (!Array.isArray(timeline)) return [];
    return timeline
        .map((entry, index) => normalizeScenarioTimelineItem(entry, index))
        .filter(Boolean);
};

const normalizeImportedScenarioInput = (input, index) => {
    if (!input || typeof input !== 'object') return null;
    const title = String(input.title || '').trim();
    if (!title) return null;
    const timeline = normalizeScenarioTimeline(input.timeline);
    if (timeline.length === 0) return null;
    return {
        title,
        timeline,
        author_name: input.author_name ? String(input.author_name).trim() : ''
    };
};

const loadLocalMessages = () => JSON.parse(localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY) || '[]');
const saveLocalMessages = (items) => localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(items || []));
const logCourseProgressDebug = (message, payload = null) => {
    if (!IS_DEV_MODE) return;
    if (payload && typeof payload === 'object') {
        console.info(`[course-progress] ${message}`, payload);
        return;
    }
    console.info(`[course-progress] ${message}`);
};
const isCourseProgressAccessError = (error) => {
    const payload = parsePostgrestErrorPayload(error);
    const code = String(payload?.code || '').toUpperCase();
    const message = String(payload?.message || error?.message || '').toLowerCase();
    if (code === '42501') return true; // insufficient_privilege
    if (message.includes('permission denied')) return true;
    if (message.includes('row-level security')) return true;
    if (message.includes('not authorized')) return true;
    if (message.includes('forbidden')) return true;
    if (message.includes('401') || message.includes('403')) return true;
    return false;
};

const ACCESS_STATUS = {
    ACTIVE: 'active',
    PAUSED_EXPIRED: 'paused_expired',
    PAUSED_MANUAL: 'paused_manual'
};

const SUBSCRIPTION_STATUS = {
    ACTIVE: 'active',
    OVERDUE: 'overdue',
    DEACTIVATED: 'deactivated',
    FINISHED: 'finished'
};

const makeAccessError = (message, code, extra = {}) => {
    const err = new Error(message);
    err.code = code;
    Object.assign(err, extra);
    return err;
};

/** Сжатие аватара в data URL (как в LocalStorageService) — для офлайна и DEV без S3. */
const buildAvatarDataUrlFromFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 300;
            const scale = MAX_WIDTH / img.width;
            const width = (scale < 1) ? MAX_WIDTH : img.width;
            const height = (scale < 1) ? img.height * scale : img.height;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Не удалось обработать изображение.'));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => reject(new Error('Image load error'));
    };
    reader.onerror = (err) => reject(err);
});

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

        // Fallback: Check INITIAL_USERS admin account in local mode.
        if (!user) {
            const initialAdmin = INITIAL_USERS.find(u => String(u.role || '').toLowerCase() === ROLES.ADMIN);
            if (initialAdmin && initialAdmin.email.toLowerCase() === email.toLowerCase().trim() && initialAdmin.password === password) {
                user = initialAdmin;
            }
        }

        if (user) {
            const checked = this._assertPlatformAccess(user);
            localStorage.setItem('garden_currentUser', JSON.stringify(checked));
            return checked;
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
        return DOMPurify.sanitize(dirty, {
            FORBID_ATTR: ['style', 'class', 'id']
        }); // Keep rich HTML, but strip external visual styles
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
        const user = JSON.parse(localStorage.getItem('garden_currentUser'));
        return this._assertPlatformAccess(user);
    }

    _assertPlatformAccess(profile) {
        // Temporary open access mode: local storage auth should not block by subscription.
        return profile;
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

    async addKnowledge(item) {
        const body = { ...item, content: item.content || item.body || '' };
        const sanitized = this._sanitizeFields(body, { plain: ['title', 'description'], rich: ['content'] });
        if (sanitized.id === undefined || sanitized.id === null) {
            sanitized.id = Date.now();
        }
        this.knowledgeBase.push(sanitized);
        localStorage.setItem('garden_knowledgeBase', JSON.stringify(this.knowledgeBase));
        return sanitized;
    }

    async updateKnowledge(item) {
        const idx = this.knowledgeBase.findIndex((k) => String(k.id) === String(item.id));
        if (idx === -1) throw new Error('Материал не найден');
        const body = { ...item, content: item.content || item.body || '' };
        const sanitized = this._sanitizeFields(body, { plain: ['title', 'description'], rich: ['content'] });
        const keepId = this.knowledgeBase[idx].id;
        this.knowledgeBase[idx] = { ...this.knowledgeBase[idx], ...sanitized, id: keepId };
        localStorage.setItem('garden_knowledgeBase', JSON.stringify(this.knowledgeBase));
        return this.knowledgeBase[idx];
    }

    async bulkUpdateKnowledge(items = []) {
        const list = Array.isArray(items) ? items : [];
        let updated = 0;
        for (const item of list) {
            if (!item?.id && item?.id !== 0) continue;
            await this.updateKnowledge(item);
            updated += 1;
        }
        return { updated };
    }

    async getLibrarySettings() {
        try {
            const { data } = await postgrestFetch('app_settings', { key: 'eq.library_settings', select: 'value' });
            if (data?.[0]?.value) {
                const normalized = normalizeLibrarySettings(data[0].value);
                localStorage.setItem(LIBRARY_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
                return normalized;
            }
        } catch (e) {
            console.warn('app_settings fetch failed, falling back to localStorage', e);
        }
        const raw = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_STORAGE_KEY) || 'null');
        return normalizeLibrarySettings(raw || DEFAULT_LIBRARY_SETTINGS);
    }

    async saveLibrarySettings(settings) {
        const normalized = normalizeLibrarySettings(settings || DEFAULT_LIBRARY_SETTINGS);
        localStorage.setItem(LIBRARY_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        try {
            await postgrestFetch('app_settings', {}, {
                method: 'POST',
                body: [{ key: 'library_settings', value: normalized, updated_at: new Date().toISOString() }],
                headers: { Prefer: 'resolution=merge-duplicates' }
            });
        } catch (e) {
            console.warn('app_settings save failed', e);
        }
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
            // Keep meeting source in sync for schedule events generated from public meetings.
            if (event.garden_id) {
                const allMeetings = JSON.parse(localStorage.getItem('garden_meetings')) || [];
                const meetingIndex = allMeetings.findIndex(m => String(m.id) === String(event.garden_id));
                if (meetingIndex !== -1) {
                    allMeetings[meetingIndex] = {
                        ...allMeetings[meetingIndex],
                        cover_image: event.image_url ?? allMeetings[meetingIndex].cover_image,
                        image_focus_x: event.image_focus_x ?? allMeetings[meetingIndex].image_focus_x ?? 50,
                        image_focus_y: event.image_focus_y ?? allMeetings[meetingIndex].image_focus_y ?? 50
                    };
                    localStorage.setItem('garden_meetings', JSON.stringify(allMeetings));
                }
            }
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
        return allScenarios
            .filter(s => s.user_id === userId && s.is_public !== true)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    async getPublicScenarios() {
        const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
        return allScenarios
            .filter(s => s.is_public === true)
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
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

    async importLeagueScenarios(items, options = {}) {
        const currentUser = await this.getCurrentUser().catch(() => null);
        const userId = options.userId || currentUser?.id;
        if (!userId) throw new Error('Не удалось определить администратора для импорта.');

        const defaultAuthorName = this._sanitize(options.authorName || currentUser?.name || 'Админ');
        const existing = await this.getPublicScenarios();
        const existingTitles = new Set(existing.map(s => normalizeScenarioTitle(s.title)).filter(Boolean));
        const toInsert = [];
        let skipped = 0;

        (Array.isArray(items) ? items : []).forEach((raw, index) => {
            const normalized = normalizeImportedScenarioInput(raw, index);
            if (!normalized) {
                skipped += 1;
                return;
            }
            const titleKey = normalizeScenarioTitle(normalized.title);
            if (!titleKey || existingTitles.has(titleKey)) {
                skipped += 1;
                return;
            }
            existingTitles.add(titleKey);
            toInsert.push(this._sanitizeFields({
                user_id: userId,
                title: normalized.title,
                timeline: normalized.timeline,
                is_public: true,
                author_name: normalized.author_name || defaultAuthorName
            }, { plain: ['title', 'author_name'] }));
        });

        if (toInsert.length === 0) {
            return { inserted: 0, skipped };
        }

        const now = new Date().toISOString();
        const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
        const created = toInsert.map((scenario, idx) => ({
            ...scenario,
            id: Date.now() + idx,
            created_at: now
        }));
        allScenarios.push(...created);
        localStorage.setItem('garden_scenarios', JSON.stringify(allScenarios));

        return { inserted: created.length, skipped };
    }

    async deleteScenario(scenarioId) {
        const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
        const filtered = allScenarios.filter(s => s.id !== scenarioId);
        localStorage.setItem('garden_scenarios', JSON.stringify(filtered));
        return true;
    }

    async updateScenario(scenarioId, patch) {
        const allScenarios = JSON.parse(localStorage.getItem('garden_scenarios')) || [];
        const index = allScenarios.findIndex((s) => String(s.id) === String(scenarioId));
        if (index === -1) throw new Error('Сценарий не найден');

        const merged = { ...patch };
        if (Array.isArray(merged.timeline)) {
            merged.timeline = merged.timeline.map((step) => {
                if (!step || typeof step !== 'object') return step;
                const desc = step.description;
                return {
                    ...step,
                    description: typeof desc === 'string' ? this._sanitizeRich(desc) : desc
                };
            });
        }

        const sanitized = this._sanitizeFields({
            ...merged,
            title: merged?.title
        }, { plain: ['title', 'author_name'] });

        allScenarios[index] = {
            ...allScenarios[index],
            ...sanitized
        };
        localStorage.setItem('garden_scenarios', JSON.stringify(allScenarios));
        return allScenarios[index];
    }

    // Chat messages
    async getMessages(options = {}) {
        const limit = Number(options?.limit) > 0 ? Number(options.limit) : 200;
        const before = options?.before ? new Date(options.before).getTime() : null;
        const all = loadLocalMessages()
            .filter((m) => !m.deleted_at)
            .filter((m) => {
                if (!before || !Number.isFinite(before)) return true;
                const createdMs = new Date(m.created_at || 0).getTime();
                return Number.isFinite(createdMs) && createdMs < before;
            })
            .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
        if (all.length <= limit) return all;
        return all.slice(all.length - limit);
    }

    async addMessage(message) {
        const text = this._sanitize(String(message?.text || ''));
        const imageUrl = this._sanitize(String(message?.image_url || message?.imageUrl || ''));
        const normalizedText = text.trim();
        if (!normalizedText && !imageUrl) throw new Error('Сообщение пустое');
        if (normalizedText.length > MAX_CHAT_MESSAGE_LENGTH) {
            throw new Error(`Сообщение слишком длинное (максимум ${MAX_CHAT_MESSAGE_LENGTH} символов)`);
        }
        const all = loadLocalMessages();
        const created = {
            id: Date.now(),
            author_id: message?.author_id || null,
            author_name: this._sanitize(message?.author_name || 'Участник'),
            text: normalizedText,
            image_url: imageUrl || null,
            created_at: new Date().toISOString(),
            edited_at: null,
            deleted_at: null
        };
        all.push(created);
        saveLocalMessages(all);
        return created;
    }

    async updateMessage(messageId, patch = {}) {
        const all = loadLocalMessages();
        const index = all.findIndex((m) => String(m.id) === String(messageId));
        if (index === -1) throw new Error('Сообщение не найдено');
        const text = this._sanitize(String(patch?.text || '')).trim();
        if (!text) throw new Error('Пустое сообщение');
        if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
            throw new Error(`Сообщение слишком длинное (максимум ${MAX_CHAT_MESSAGE_LENGTH} символов)`);
        }
        all[index] = {
            ...all[index],
            text,
            edited_at: new Date().toISOString()
        };
        saveLocalMessages(all);
        return all[index];
    }

    async deleteMessage(messageId) {
        const all = loadLocalMessages();
        const index = all.findIndex((m) => String(m.id) === String(messageId));
        if (index === -1) return true;
        all[index] = {
            ...all[index],
            deleted_at: new Date().toISOString()
        };
        saveLocalMessages(all);
        return true;
    }

    async uploadChatImage(file) {
        if (!file) return null;
        return this.uploadAvatar(file);
    }

    async getPushStatus() {
        const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
        return {
            supported: isPushSupported(),
            permission,
            isStandalone: isStandalonePwa(),
            enabled: localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY) === '1'
        };
    }

    async enablePushNotifications() {
        if (!isPushSupported()) throw new Error('Push-уведомления не поддерживаются на этом устройстве.');
        if (!isStandalonePwa()) {
            throw new Error('Для iPhone откройте сайт с экрана "Домой" (PWA), затем включите уведомления.');
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано.');
        localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, '1');
        return true;
    }

    async sendNewsPush() {
        // Local mode has no server channel for web push.
        return false;
    }

    _saveUsers() {
        localStorage.setItem('garden_users', JSON.stringify(this.users));
    }

    async uploadAvatar(file) {
        return buildAvatarDataUrlFromFile(file);
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
    _cache = new Map();

    _cachedFetch(key, fetcher, ttl = 30000) {
        const cached = this._cache.get(key);
        if (cached && Date.now() - cached.ts < ttl) return cached.promise;
        const promise = fetcher().catch((e) => {
            this._cache.delete(key);
            throw e;
        });
        this._cache.set(key, { promise, ts: Date.now() });
        return promise;
    }

    _invalidateCache(key) {
        this._cache.delete(key);
    }

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
        return DOMPurify.sanitize(dirty, {
            FORBID_ATTR: ['style', 'class', 'id']
        });
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
        // Temporary open access mode: do not block login by subscription status.
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
        if (profile?.id) {
            profile = await this._ensureDefaultApplicantRoleInDb(profile);
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
        if (created?.id) {
            try {
                const refetched = await this._fetchProfile(created.id);
                if (refetched) return refetched;
            } catch (e) {
                console.warn('register: profile refetch failed', e);
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
        try {
            const fileToUpload = await this.compressMeetingImage(file);
            return await this._uploadToS3(fileToUpload, 'avatars');
        } catch (err) {
            if (IS_DEV_MODE) {
                console.warn(
                    '[DEV] uploadAvatar: S3/sign недоступен — используем локальный data URL. Для полного локального режима задайте VITE_USE_LOCAL_DB=true.',
                    err
                );
                return buildAvatarDataUrlFromFile(file);
            }
            throw err;
        }
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

    // --- Shop Items ---

    async getShopItems({ activeOnly = false } = {}) {
        const params = { order: 'sort_order.asc' };
        if (activeOnly) params['is_active'] = 'eq.true';
        const { data } = await postgrestFetch('shop_items', params);
        return data || [];
    }

    async createShopItem(item) {
        const sanitized = this._sanitizeFields(item, {
            plain: ['name', 'description', 'image_url', 'contact_telegram', 'contact_whatsapp']
        });
        const { data } = await postgrestFetch('shop_items', {}, {
            method: 'POST',
            body: sanitized,
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async updateShopItem(id, fields) {
        const sanitized = this._sanitizeFields(fields, {
            plain: ['name', 'description', 'image_url', 'contact_telegram', 'contact_whatsapp']
        });
        const { data } = await postgrestFetch('shop_items', { id: `eq.${id}` }, {
            method: 'PATCH',
            body: sanitized,
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async deleteShopItem(id) {
        await postgrestFetch('shop_items', { id: `eq.${id}` }, { method: 'DELETE' });
        return true;
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
        if (profile?.id) {
            profile = await this._ensureDefaultApplicantRoleInDb(profile);
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

    /**
     * Пустой `profiles.role` в БД: в Саду по смыслу это абитуриент (см. регистрацию и админку),
     * но PostgREST отдаёт null → ПВЛ и фильтры не видят людей. Патчим при загрузке сессии;
     * массово — миграция `migrations/22_profiles_default_applicant_role.sql`.
     */
    async _ensureDefaultApplicantRoleInDb(profile) {
        if (!profile?.id) return profile;
        const raw = profile.role;
        if (raw != null && String(raw).trim() !== '') return profile;
        try {
            const { data } = await postgrestFetch('profiles', { id: `eq.${profile.id}` }, {
                method: 'PATCH',
                body: { role: ROLES.APPLICANT },
                returnRepresentation: true
            });
            const row = Array.isArray(data) && data[0] ? data[0] : null;
            if (row) return this._normalizeProfile(row);
        } catch (e) {
            console.warn('Default applicant role patch failed:', e);
        }
        return { ...profile, role: ROLES.APPLICANT };
    }

    /** Все профили: нужен SELECT на `profiles` согласно RLS (см. database/pvl/notes/garden-profiles-rls-for-pvl-sync.md). Источник роли абитуриента: колонка `role`. */
    async getUsers() {
        return this._cachedFetch('users', async () => {
            const { data } = await postgrestFetch('profiles', { select: '*' });
            return (data || []).map((profile) => this._normalizeProfile(profile));
        });
    }

    async updateUser(updatedUser) {
        const hasField = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const safeSkills = hasField(updatedUser, 'skills') && Array.isArray(updatedUser.skills)
            ? updatedUser.skills.map(String)
            : undefined;
        const safeDob = hasField(updatedUser, 'dob') ? (updatedUser.dob || null) : undefined;
        const safeAvatarFocusX = hasField(updatedUser, 'avatar_focus_x') ? (updatedUser.avatar_focus_x != null ? Number(updatedUser.avatar_focus_x) : null) : undefined;
        const safeAvatarFocusY = hasField(updatedUser, 'avatar_focus_y') ? (updatedUser.avatar_focus_y != null ? Number(updatedUser.avatar_focus_y) : null) : undefined;
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
            if (safeAvatarFocusX !== undefined) dbUser.avatar_focus_x = Math.max(0, Math.min(100, safeAvatarFocusX));
            if (safeAvatarFocusY !== undefined) dbUser.avatar_focus_y = Math.max(0, Math.min(100, safeAvatarFocusY));

            await postgrestFetch('profiles', { id: `eq.${dbUser.id}` }, {
                method: 'PATCH',
                body: dbUser,
                returnRepresentation: true
            });
        } catch (e) {
            console.warn("Profile update exception:", e);
        }

        // Return the full object so UI updates optimistically
        this._invalidateCache('users');
        return updatedUser;
    }

    async deleteUser(userId) {
        await postgrestFetch('profiles', { id: `eq.${userId}` }, {
            method: 'DELETE',
            returnRepresentation: true
        });
        this._invalidateCache('users');
        return true;
    }

    async toggleUserStatus(userId, newStatus) {
        const accessStatus = newStatus === 'suspended' ? ACCESS_STATUS.PAUSED_MANUAL : ACCESS_STATUS.ACTIVE;
        await postgrestFetch('profiles', { id: `eq.${userId}` }, {
            method: 'PATCH',
            body: { status: newStatus, access_status: accessStatus },
            returnRepresentation: true
        });
        return true;
    }


    // Knowledge Base
    async getKnowledgeBase() {
        return this._cachedFetch('knowledgeBase', async () => {
            const { data } = await postgrestFetch('knowledge_base', { select: '*', order: 'created_at.desc' });
            return data || [];
        });
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
        this._invalidateCache('knowledgeBase');
        return true;
    }

    async updateKnowledge(item) {
        this.checkActionTimer();
        const id = item?.id;
        if (id === undefined || id === null || id === '') {
            throw new Error('Не указан id материала для обновления');
        }
        const { id: _omitId, ...rest } = this._sanitizeFields(
            { ...item, content: item.content || item.body || '' },
            { plain: ['title', 'description'], rich: ['content'] }
        );
        await postgrestFetch('knowledge_base', { id: `eq.${id}` }, {
            method: 'PATCH',
            body: rest,
            returnRepresentation: true
        });
        this._invalidateCache('knowledgeBase');
        return true;
    }

    async bulkUpdateKnowledge(items = []) {
        const list = Array.isArray(items) ? items : [];
        let updated = 0;
        for (const item of list) {
            const id = item?.id;
            if (id === undefined || id === null || id === '') continue;
            const { id: _omitId, ...rest } = this._sanitizeFields(
                { ...item, content: item.content || item.body || '' },
                { plain: ['title', 'description'], rich: ['content'] }
            );
            await postgrestFetch('knowledge_base', { id: `eq.${id}` }, {
                method: 'PATCH',
                body: rest,
                returnRepresentation: true
            });
            updated += 1;
        }
        this._invalidateCache('knowledgeBase');
        return { updated };
    }

    async addKnowledgeBaseItem(item) {
        // No table yet
        return item;
    }

    async deleteKnowledge(id) {
        await postgrestFetch('knowledge_base', { id: `eq.${id}` }, { method: 'DELETE', returnRepresentation: true });
        this._invalidateCache('knowledgeBase');
        return true;
    }

    async getLibrarySettings() {
        try {
            const { data } = await postgrestFetch('app_settings', { key: 'eq.library_settings', select: 'value' });
            if (data?.[0]?.value) {
                const normalized = normalizeLibrarySettings(data[0].value);
                localStorage.setItem(LIBRARY_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
                return normalized;
            }
        } catch (e) {
            console.warn('app_settings fetch failed, falling back to localStorage', e);
        }
        const raw = JSON.parse(localStorage.getItem(LIBRARY_SETTINGS_STORAGE_KEY) || 'null');
        return normalizeLibrarySettings(raw || DEFAULT_LIBRARY_SETTINGS);
    }

    async saveLibrarySettings(settings) {
        const normalized = normalizeLibrarySettings(settings || DEFAULT_LIBRARY_SETTINGS);
        localStorage.setItem(LIBRARY_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        try {
            await postgrestFetch('app_settings', {}, {
                method: 'POST',
                body: [{ key: 'library_settings', value: normalized, updated_at: new Date().toISOString() }],
                headers: { Prefer: 'resolution=merge-duplicates' }
            });
        } catch (e) {
            console.warn('app_settings save failed', e);
        }
        return normalized;
    }

    // Course progress
    async getCourseProgress(userId, courseTitle) {
        const params = { select: 'material_id', user_id: `eq.${userId}` };
        if (courseTitle) params.course_title = `eq.${courseTitle}`;
        try {
            const { data } = await postgrestFetch('course_progress', params);
            return (data || []).map(row => String(row.material_id));
        } catch (e) {
            if (isCourseProgressAccessError(e)) {
                logCourseProgressDebug('remote progress read blocked', {
                    userId,
                    courseTitle
                });
                throw new Error('Нет доступа к чтению прогресса в БД (course_progress). Проверьте RLS policies.');
            }
            throw e;
        }
    }

    async markCourseLessonCompleted(userId, materialId, courseTitle) {
        const payload = {
            user_id: userId,
            material_id: String(materialId),
            course_title: courseTitle
        };

        try {
            await postgrestFetch('course_progress', {}, {
                method: 'POST',
                body: [payload],
                returnRepresentation: true
            });
            logCourseProgressDebug('lesson marked completed', {
                userId,
                courseTitle,
                materialId: String(materialId)
            });
            return { inserted: true };
        } catch (e) {
            if (String(e.message).includes('23505')) return { inserted: false };
            if (isCourseProgressAccessError(e)) {
                logCourseProgressDebug('remote progress write blocked', {
                    userId,
                    courseTitle,
                    materialId: String(materialId)
                });
                throw new Error('Нет доступа к записи прогресса в БД (course_progress). Проверьте RLS policies.');
            }
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

        try {
            const { data } = await postgrestFetch('meetings', {}, {
                method: 'POST',
                body: [sanitized],
                returnRepresentation: true
            });
            return Array.isArray(data) ? data[0] : data;
        } catch (error) {
            if (!isMissingColumnError(error, 'meetings', 'city_key')) throw error;
            const fallbackPayload = { ...sanitized };
            delete fallbackPayload.city_key;
            const { data } = await postgrestFetch('meetings', {}, {
                method: 'POST',
                body: [fallbackPayload],
                returnRepresentation: true
            });
            return Array.isArray(data) ? data[0] : data;
        }
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
            image_focus_x: cleaned.image_focus_x != null ? (parseInt(cleaned.image_focus_x, 10) || 50) : undefined,
            image_focus_y: cleaned.image_focus_y != null ? (parseInt(cleaned.image_focus_y, 10) || 50) : undefined,
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

        try {
            const { data } = await postgrestFetch('meetings', { id: `eq.${id}` }, {
                method: 'PATCH',
                body: sanitized,
                returnRepresentation: true
            });
            return Array.isArray(data) ? data[0] : data;
        } catch (error) {
            if (!isMissingColumnError(error, 'meetings', 'city_key')) throw error;
            const fallbackPayload = { ...sanitized };
            delete fallbackPayload.city_key;
            const { data } = await postgrestFetch('meetings', { id: `eq.${id}` }, {
                method: 'PATCH',
                body: fallbackPayload,
                returnRepresentation: true
            });
            return Array.isArray(data) ? data[0] : data;
        }
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
                select: 'id,garden_id,title,description,date,city,city_key,time,location,category,image_url,image_focus_x,image_focus_y,price,registration_link,meeting_format,online_visibility,starts_at,day_date',
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
        const updatedEvent = Array.isArray(data) ? data[0] : data;

        // For events mirrored from meetings, also persist back to the source meeting.
        if (event.garden_id) {
            const meetingPatch = {
                title: cleaned.title,
                description: cleaned.description,
                date: cleaned.date,
                time: cleaned.time,
                city: cleaned.city,
                city_key: cleaned.city_key,
                address: cleaned.location,
                payment_link: cleaned.registration_link,
                meeting_format: cleaned.meeting_format,
                online_visibility: cleaned.online_visibility,
                image_focus_x: Number.isNaN(focusX) ? null : focusX,
                image_focus_y: Number.isNaN(focusY) ? null : focusY
            };
            if (typeof rest.image_url === 'string') {
                meetingPatch.cover_image = cleaned.image_url || null;
            }
            Object.keys(meetingPatch).forEach((key) => {
                if (meetingPatch[key] === undefined) delete meetingPatch[key];
            });
            try {
                await postgrestFetch('meetings', { id: `eq.${event.garden_id}` }, {
                    method: 'PATCH',
                    body: meetingPatch,
                    returnRepresentation: false
                });
            } catch (syncError) {
                console.warn('Meeting sync after event update failed', syncError);
            }
        }

        return updatedEvent;
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
        return this._cachedFetch('news', async () => {
            const { data } = await postgrestFetch('news', { select: '*', order: 'created_at.desc' });
            return data || [];
        });
    }

    async addNews(item) {
        this.checkActionTimer();
        const sanitized = this._sanitizeFields(item, { plain: ['title'], rich: ['body'] });
        const { id, ...rest } = sanitized;
        const { data } = await postgrestFetch('news', {}, { method: 'POST', body: [rest], returnRepresentation: true });
        this._invalidateCache('news');
        return data?.[0] || null;
    }

    async updateNews(item) {
        const { id, ...rest } = item;
        const sanitized = this._sanitizeFields(rest, { plain: ['title'], rich: ['body'] });
        await postgrestFetch('news', { id: `eq.${id}` }, { method: 'PATCH', body: sanitized, returnRepresentation: true });
        this._invalidateCache('news');
        return true;
    }

    async deleteNews(newsId) {
        await postgrestFetch('news', { id: `eq.${newsId}` }, { method: 'DELETE', returnRepresentation: true });
        this._invalidateCache('news');
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
            is_public: 'neq.true',
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

    async importLeagueScenarios(items, options = {}) {
        this.checkActionTimer();
        const currentUser = await this.getCurrentUser().catch(() => null);
        const userId = options.userId || currentUser?.id;
        if (!userId) throw new Error('Не удалось определить администратора для импорта.');

        const defaultAuthorName = this._sanitize(options.authorName || currentUser?.name || 'Админ');
        const existing = await this.getPublicScenarios();
        const existingTitles = new Set(existing.map(s => normalizeScenarioTitle(s.title)).filter(Boolean));
        const payload = [];
        let skipped = 0;

        (Array.isArray(items) ? items : []).forEach((raw, index) => {
            const normalized = normalizeImportedScenarioInput(raw, index);
            if (!normalized) {
                skipped += 1;
                return;
            }
            const titleKey = normalizeScenarioTitle(normalized.title);
            if (!titleKey || existingTitles.has(titleKey)) {
                skipped += 1;
                return;
            }
            existingTitles.add(titleKey);
            payload.push(this._sanitizeFields({
                user_id: userId,
                title: normalized.title,
                timeline: normalized.timeline,
                is_public: true,
                author_name: normalized.author_name || defaultAuthorName
            }, { plain: ['title', 'author_name'] }));
        });

        if (payload.length === 0) {
            return { inserted: 0, skipped };
        }

        const { data } = await postgrestFetch('scenarios', {}, {
            method: 'POST',
            body: payload,
            returnRepresentation: true
        });

        return { inserted: Array.isArray(data) ? data.length : 0, skipped };
    }

    async deleteScenario(scenarioId) {
        await postgrestFetch('scenarios', { id: `eq.${scenarioId}` }, { method: 'DELETE', returnRepresentation: true });
        return true;
    }

    async updateScenario(scenarioId, patch) {
        const merged = { ...patch };
        if (Array.isArray(merged.timeline)) {
            merged.timeline = merged.timeline.map((step) => {
                if (!step || typeof step !== 'object') return step;
                const desc = step.description;
                return {
                    ...step,
                    description: typeof desc === 'string' ? this._sanitizeRich(desc) : desc
                };
            });
        }
        const sanitized = this._sanitizeFields({
            ...merged,
            title: merged?.title
        }, { plain: ['title', 'author_name'] });

        const { data } = await postgrestFetch('scenarios', { id: `eq.${scenarioId}` }, {
            method: 'PATCH',
            body: sanitized,
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    // Chat messages
    async getMessages(options = {}) {
        const limit = Number(options?.limit) > 0 ? Number(options.limit) : 200;
        const params = {
            select: '*',
            deleted_at: 'is.null',
            order: 'created_at.desc',
            limit: String(limit)
        };
        if (options?.before) params.created_at = `lt.${String(options.before)}`;
        const { data } = await postgrestFetch('messages', params);
        // Keep UI chronological while requesting latest N rows.
        return (data || []).slice().reverse();
    }

    async addMessage(message) {
        const text = this._sanitize(String(message?.text || ''));
        const imageUrl = this._sanitizeIfString(message?.image_url || message?.imageUrl || '');
        const normalizedText = text.trim();
        if (!normalizedText && !imageUrl) throw new Error('Сообщение пустое');
        if (normalizedText.length > MAX_CHAT_MESSAGE_LENGTH) {
            throw new Error(`Сообщение слишком длинное (максимум ${MAX_CHAT_MESSAGE_LENGTH} символов)`);
        }
        const payload = this._sanitizeFields({
            author_id: message?.author_id || null,
            author_name: message?.author_name || 'Участник',
            text: normalizedText,
            image_url: imageUrl || null
        }, { plain: ['author_name', 'text'] });

        try {
            const { data } = await postgrestFetch('messages', {}, {
                method: 'POST',
                body: [payload],
                returnRepresentation: true
            });
            return Array.isArray(data) ? data[0] : data;
        } catch (error) {
            if (!isMissingColumnError(error, 'messages', 'image_url')) throw error;
            const fallbackPayload = { ...payload };
            delete fallbackPayload.image_url;
            if (imageUrl) {
                throw new Error('Не найдено поле image_url в таблице messages. Выполните миграцию 18_messages_add_image_url.sql');
            }
            const { data } = await postgrestFetch('messages', {}, {
                method: 'POST',
                body: [fallbackPayload],
                returnRepresentation: true
            });
            return Array.isArray(data) ? data[0] : data;
        }
    }

    async updateMessage(messageId, patch = {}) {
        const text = this._sanitize(String(patch?.text || '')).trim();
        if (!text) throw new Error('Пустое сообщение');
        if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
            throw new Error(`Сообщение слишком длинное (максимум ${MAX_CHAT_MESSAGE_LENGTH} символов)`);
        }
        const payload = this._sanitizeFields({
            text,
            edited_at: new Date().toISOString()
        }, { plain: ['text'] });
        const { data } = await postgrestFetch('messages', { id: `eq.${messageId}` }, {
            method: 'PATCH',
            body: payload,
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async deleteMessage(messageId) {
        const { data } = await postgrestFetch('messages', { id: `eq.${messageId}` }, {
            method: 'PATCH',
            body: { deleted_at: new Date().toISOString() },
            returnRepresentation: true
        });
        return Array.isArray(data) ? data[0] : data;
    }

    async uploadChatImage(file) {
        if (!file) return null;
        const fileToUpload = await this.compressMeetingImage(file);
        return await this._uploadToS3(fileToUpload, 'chat-images');
    }

    async getPushStatus() {
        const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
        return {
            supported: isPushSupported(),
            permission,
            isStandalone: isStandalonePwa(),
            enabled: localStorage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY) === '1'
        };
    }

    async enablePushNotifications(currentUser) {
        if (!isPushSupported()) throw new Error('Push-уведомления не поддерживаются на этом устройстве.');
        if (!isStandalonePwa()) {
            throw new Error('Для iPhone откройте сайт с экрана "Домой" (PWA), затем включите уведомления.');
        }

        const permission = Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано.');

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            let publicKey = PUSH_PUBLIC_KEY;
            if (!publicKey) {
                const keyResponse = await pushFetch('/push/public-key').catch(() => null);
                publicKey = keyResponse?.publicKey || '';
            }
            if (!publicKey) {
                throw new Error('Не настроен VAPID public key. Добавьте VITE_WEB_PUSH_PUBLIC_KEY или endpoint /push/public-key.');
            }
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }

        const payload = {
            subscription,
            user_id: currentUser?.id || null,
            user_name: currentUser?.name || null,
            platform: navigator.userAgent,
            is_pwa: isStandalonePwa()
        };

        try {
            await pushFetch('/push/subscribe', { method: 'POST', body: payload });
        } catch {
            // Fallback storage if server endpoint is not ready yet.
            try {
                await postgrestFetch('push_subscriptions', {}, {
                    method: 'POST',
                    body: [{
                        user_id: payload.user_id,
                        endpoint: subscription.endpoint,
                        keys: subscription.toJSON()?.keys || {},
                        user_agent: payload.platform,
                        is_active: true
                    }],
                    returnRepresentation: true
                });
            } catch {
                throw new Error('Не удалось сохранить push-подписку. Нужен endpoint /push/subscribe или таблица push_subscriptions.');
            }
        }

        localStorage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, '1');
        return true;
    }

    async sendNewsPush(newsItem) {
        const title = String(newsItem?.title || 'Новая новость');
        const body = stripHtmlToText(newsItem?.body || '').slice(0, 180) || 'Откройте приложение, чтобы прочитать новость.';
        const payload = {
            title,
            body,
            url: '/',
            tag: `news-${newsItem?.id || Date.now()}`
        };

        return await pushFetch('/push/news', {
            method: 'POST',
            body: payload
        });
    }

    // Goals
    async getGoals(userId) {
        const currentUser = await this.getCurrentUser().catch(() => null);
        const resolvedUserId = await this._resolveGoalsUserId(userId, currentUser);
        const candidateIds = Array.from(new Set([userId, resolvedUserId].filter(Boolean)));
        const results = await Promise.all(
            candidateIds.map((candidateId) =>
                postgrestFetch('goals', {
                    select: '*',
                    user_id: `eq.${candidateId}`,
                    order: 'created_at.desc'
                }).catch((e) => {
                    console.warn('getGoals candidate lookup failed:', candidateId, e);
                    return { data: [] };
                })
            )
        );
        const rows = results.flatMap(({ data }) => (Array.isArray(data) ? data : []));

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
        return {
            ...data,
            /** жизненный цикл аккаунта; не путать с ролью абитуриента (см. `role`) */
            status: data.status,
            avatar: data.avatar_url || data.avatar,
            avatar_focus_x: data.avatar_focus_x != null ? Number(data.avatar_focus_x) : undefined,
            avatar_focus_y: data.avatar_focus_y != null ? Number(data.avatar_focus_y) : undefined,
            treeDesc: data.tree_desc || data.treeDesc,
            role: data.role,
            dob: data.dob,
            seeds: data.seeds || 0,
            skills: Array.isArray(data.skills) ? data.skills : [],
            offer: data.offer || '',
            unique_abilities: data.unique_abilities || '',
            leader_about: data.leader_about || '',
            leader_signature: data.leader_signature || '',
            leader_reviews: Array.isArray(data.leader_reviews) ? data.leader_reviews : [],
            telegram: data.telegram || '',
            join_date: data.join_date,
            access_status: data.access_status || ACCESS_STATUS.ACTIVE,
            subscription_status: data.subscription_status || SUBSCRIPTION_STATUS.ACTIVE,
            paid_until: data.paid_until || null,
            prodamus_subscription_id: data.prodamus_subscription_id || null,
            prodamus_customer_id: data.prodamus_customer_id || null,
            last_payment_at: data.last_payment_at || null,
            last_prodamus_event: data.last_prodamus_event || null,
            last_prodamus_payload: data.last_prodamus_payload || null,
            bot_renew_url: data.bot_renew_url || null,
            session_version: Number.isFinite(Number(data.session_version)) ? Number(data.session_version) : 1
        };
    }
}

// Export a singleton instance
const useLocalDb = import.meta.env.VITE_USE_LOCAL_DB === 'true';

export const api = useLocalDb ? new LocalStorageService() : new RemoteApiService();
