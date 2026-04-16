# Индекс функций (garden)

Автоматически сгенерировано скриптом `scripts/generate-function-index.mjs`.

Для каждого объявления указаны **номер строки** и **полная сигнатура** (список параметров). Учитываются: `function …`, `export function …`, `export default function …`, `const Имя = (` / `async (`.

Ограничения: вложенные объявления на одной строке с другими конструкциями могут не попасть; для стрелочных функций показано `const name = (…) =>` без тела.

**Файлов:** 66 · **Объявлений:** 965

## `App.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 8 | `export default function App()` |
| 2 | 19 | `const showNotification = (msg) =>` |
| 3 | 21 | `const normalizeLegacyRichContent = (rawContent) =>` |
| 4 | 31 | `const replaceTag = (node, nextTag) =>` |
| 5 | 78 | `const init = async () =>` |
| 6 | 134 | `const handleLogin = async (authData) =>` |
| 7 | 182 | `const handleResetWithToken = async (token, newPassword) =>` |
| 8 | 194 | `const handleLogout = async () =>` |
| 9 | 201 | `const updateUserRole = async (id, role) =>` |
| 10 | 217 | `const handleUpdateUser = async (updatedUser) =>` |
| 11 | 230 | `const handleSendRay = (targetUserId) =>` |
| 12 | 241 | `const handleMarkAsRead = (notificationId) =>` |
| 13 | 245 | `const handleUpdateNews = async (updatedNews) =>` |
| 14 | 256 | `const handleDeleteNews = async (newsId) =>` |
| 15 | 267 | `const handleSaveLibrarySettings = async (next) =>` |
| 16 | 281 | `const handleSetCourseVisible = async (courseTitle, visible) =>` |
| 17 | 291 | `const handleReorderCourseMaterials = async (courseTitle, orderedMaterialIds) =>` |
| 18 | 301 | `const handleGetLeagueScenarios = async () =>` |
| 19 | 311 | `const handleImportLeagueScenarios = async (items) =>` |
| 20 | 323 | `const handleDeleteLeagueScenario = async (scenarioId) =>` |
| 21 | 333 | `const handleUpdateLeagueScenario = async (scenarioId, patch) =>` |

## `components/Button.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon, disabled = false }) =>` |

## `components/CalendarWidget.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 3 | `const CalendarWidget = ({ meetings, onPlanClick, selectedMonth, onMonthChange }) =>` |
| 2 | 6 | `const getDaysInMonth = (date) =>` |
| 3 | 13 | `const handlePrevMonth = () =>` |
| 4 | 17 | `const handleNextMonth = () =>` |

## `components/Card.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `const Card = ({ children, className = '', onClick }) =>` |

## `components/ConfirmationModal.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 3 | `const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmVariant = "primary", icon: Icon = AlertTriangle, zIndex = "z-50" }) =>` |

## `components/Input.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 2 | `const Input = ({ label, type = "text", placeholder, value, onChange, className = "", inputClassName = "", ...props }) =>` |

## `components/LivingTree.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 26 | `const LivingTree = ({ level, treeName }) =>` |

## `components/MeetingCard.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 4 | `const MeetingCard = ({     meeting,     users = [],     onEdit,     onResult,     onCancel,     onDelete,     onUpdate,     onDuplicate,     onRescheduleCancelled }) =>` |
| 2 | 27 | `const coHostNames = (Array.isArray(meeting.co_hosts) ? meeting.co_hosts : []) =>` |
| 3 | 33 | `const getStatusColor = () =>` |
| 4 | 43 | `const getStatusLabel = () =>` |
| 5 | 73 | `const normalizeTime = (value) =>` |
| 6 | 83 | `const handleDelete = (e) =>` |
| 7 | 88 | `const handleToggleChecklist = (e, index) =>` |

## `components/ModalShell.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 3 | `const ModalShell = ({     isOpen,     onClose,     title,     description,     header,     footer,     children,     size = 'md',     align = 'center',     showClose = true,     zIndex = 'z-[80]' }) =>` |

## `components/RichEditor.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 2 | `const RichEditor = ({ value, onChange, placeholder, onUploadImage = null }) =>` |
| 2 | 10 | `const sanitizeIncomingHtml = (rawHtml) =>` |
| 3 | 26 | `const styleToSemantic = (node) =>` |
| 4 | 31 | `const parseFontSizePx = () =>` |
| 5 | 39 | `const replaceTag = (sourceNode, nextTag) =>` |
| 6 | 67 | `const walk = (node) =>` |
| 7 | 84 | `const href = (current.getAttribute('href') \|\| '') =>` |
| 8 | 96 | `const src = (current.getAttribute('src') \|\| '') =>` |
| 9 | 146 | `const normalizeEditorHtml = () =>` |
| 10 | 157 | `const pushToParent = () =>` |
| 11 | 164 | `const flushSanitized = () =>` |
| 12 | 179 | `const escapeHtml = (text) =>` |
| 13 | 184 | `const parseTextLineType = (line) =>` |
| 14 | 207 | `const plainTextToStructuredHtml = (text) =>` |
| 15 | 233 | `const closeList = () =>` |
| 16 | 267 | `const saveSelection = () =>` |
| 17 | 272 | `const restoreSelection = (range) =>` |
| 18 | 280 | `const handleCommand = (e, command, val = null) =>` |
| 19 | 286 | `const handleInsertImageByUrl = (e) =>` |
| 20 | 300 | `const handleUploadImage = async (e) =>` |
| 21 | 322 | `const handlePaste = (e) =>` |
| 22 | 334 | `const handleKeyDown = (e) =>` |
| 23 | 342 | `const handleInsertTable = (e) =>` |

## `components/Toast.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 2 | `const Toast = ({ message, onClose }) =>` |

## `components/TreeIcon.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 60 | `const TreeIcon = ({ treeName, archetype = 'mighty', color = '#10B981', className = "w-10 h-10" }) =>` |
| 2 | 63 | `const getIcon = () =>` |

## `components/UserAvatar.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `const UserAvatar = ({ user, size = 'md', className = '' }) =>` |

## `data/data.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 15 | `export const getSeason = () =>` |
| 2 | 49 | `export const getTreeByDate = (dateString) =>` |
| 3 | 76 | `export const getTreeByName = (name) =>` |
| 4 | 98 | `export const getRoleLabel = (r) =>` |

## `data/pvl/seed.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 6 | `const mkWeekId = (cohortId, weekNumber) =>` |

## `data/pvlMockData.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 48 | `export const getStudentProfile = (studentId) =>` |
| 2 | 50 | `export const getUser = (id) =>` |
| 3 | 51 | `export const getStudentTasks = (studentId) =>` |
| 4 | 52 | `export const getStudentRisks = (studentId) =>` |
| 5 | 53 | `export const getStudentMeetings = (studentId) =>` |
| 6 | 54 | `export const getStudentCertification = (studentId) =>` |
| 7 | 55 | `export const getTaskById = (taskId) =>` |
| 8 | 56 | `export const getTaskThread = (taskId) =>` |
| 9 | 57 | `export const getTaskHistory = (taskId) =>` |
| 10 | 58 | `export const getTaskVersions = (taskId) =>` |

## `data/pvlReferenceContent.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 56 | `export function pvlPlatformModuleTitleFromInternal(internalModule)` |
| 2 | 66 | `export function getPvlCourseModulePickerOptions()` |

## `scripts/legacy/dedupe_schedule_events.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 8 | `const parseEnv = (content) =>` |
| 2 | 43 | `const normalize = (v) =>` |
| 3 | 45 | `const eventSort = (a, b) =>` |
| 4 | 52 | `const buildGroups = (events) =>` |
| 5 | 78 | `const collectDeleteIds = (groups) =>` |
| 6 | 93 | `const printPreview = (label, keepByGroup) =>` |
| 7 | 112 | `const main = async () =>` |

## `scripts/legacy/migrate_meetings.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 9 | `const parseEnv = (content) =>` |
| 2 | 53 | `const getExtFromUrl = (url) =>` |
| 3 | 64 | `const downloadImage = async (url) =>` |
| 4 | 72 | `const uploadImageToNew = async (buffer, contentType, oldId) =>` |
| 5 | 84 | `const main = async () =>` |

## `scripts/legacy/migrate_questions_notebooks.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 9 | `const parseEnv = (content) =>` |
| 2 | 53 | `const downloadFile = async (url) =>` |
| 3 | 61 | `const uploadToBucket = async (bucket, buffer, contentType, prefix) =>` |
| 4 | 73 | `const main = async () =>` |

## `scripts/legacy/update_event_images.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 9 | `const parseEnv = (content) =>` |
| 2 | 52 | `const downloadImage = async (url) =>` |
| 3 | 60 | `const uploadImageToNew = async (buffer, contentType, oldId) =>` |
| 4 | 72 | `const buildKey = (e) =>` |
| 5 | 74 | `const main = async () =>` |

## `selectors/pvlCalculators.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 4 | `const toDate = (x) =>` |
| 2 | 5 | `const diffDays = (a, b) =>` |
| 3 | 6 | `export function calculateStudentWeekProgress(db, studentId, weekId)` |
| 4 | 13 | `export function calculateHomeworkProgress(db, studentId)` |
| 5 | 19 | `export function calculateLibraryProgress()` |
| 6 | 24 | `export function calculateCourseProgress(db, studentId)` |
| 7 | 28 | `export function calculateAutoPoints(db, studentId)` |
| 8 | 32 | `export function calculateMentorBonusPoints(db, studentId)` |
| 9 | 36 | `export function calculateControlPointPoints(db, studentId)` |
| 10 | 43 | `export function calculateCoursePoints(db, studentId)` |
| 11 | 49 | `export function calculateSzSelfAssessment(db, studentId)` |
| 12 | 54 | `export function calculateSzMentorAssessment(db, studentId)` |
| 13 | 59 | `export function isTaskOverdue(db, taskId, studentId, today = '2026-06-03')` |
| 14 | 67 | `export function getOverdueDays(db, taskId, studentId, today = '2026-06-03')` |
| 15 | 73 | `export function getNextDeadline(db, studentId, today = '2026-06-03')` |
| 16 | 82 | `export function getNextControlPoint(db, studentId, today = '2026-06-03')` |
| 17 | 91 | `export function getDaysToSzDeadline(today = '2026-06-03')` |
| 18 | 95 | `export function buildAntiDebtProtocol(db, studentId, today = '2026-06-03')` |
| 19 | 106 | `export function buildStudentRisks(db, studentId)` |
| 20 | 110 | `export function calculateRiskLevel(db, studentId)` |
| 21 | 117 | `function resolveMentorActorId(db, mentorId)` |
| 22 | 124 | `function resolveMentorMenteeIds(db, mentorId)` |
| 23 | 127 | `const profile = (db.mentorProfiles \|\| []) =>` |
| 24 | 133 | `export function buildMentorRisks(db, mentorId)` |
| 25 | 138 | `export function buildAdminRisks(db)` |
| 26 | 142 | `export function getPendingReviewTasks(db, mentorId)` |
| 27 | 149 | `export function getUnreadThreadCount(db, userId)` |
| 28 | 153 | `export function getRevisionCycles(db, studentId, taskId)` |
| 29 | 157 | `export function detectTooManyRevisions(reviewPayload)` |
| 30 | 161 | `export function getCertificationReadiness(db, studentId)` |
| 31 | 166 | `export function getCertificationRedFlags(db, studentId)` |
| 32 | 170 | `export function getCertificationTimeline(db, studentId)` |
| 33 | 183 | `export function buildEmailEvents()` |
| 34 | 187 | `export function getPendingNotifications(db, userId)` |

## `services/dataService.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 18 | `const getAuthToken = () =>` |
| 2 | 20 | `const setAuthToken = (token) =>` |
| 3 | 24 | `const normalizeEmail = (email) =>` |
| 4 | 25 | `const isPostgrestJwtSecretError = (bodyText) =>` |
| 5 | 35 | `const postgrestFetch = async (path, params = {}, options = {}) =>` |
| 6 | 39 | `const buildHeaders = (includeBearer) =>` |
| 7 | 96 | `const parsePostgrestErrorPayload = (error) =>` |
| 8 | 106 | `const isMissingColumnError = (error, table, column) =>` |
| 9 | 113 | `const authFetch = async (path, options = {}) =>` |
| 10 | 133 | `const pushFetch = async (path, options = {}) =>` |
| 11 | 153 | `const extensionByContentType = (contentType) =>` |
| 12 | 166 | `const buildUploadFileName = (folder, fileName, contentType) =>` |
| 13 | 182 | `const convertImageToJpegFile = async (file, maxSize = 1200, quality = 0.82) =>` |
| 14 | 215 | `const resolveStorageSign = async (body) =>` |
| 15 | 282 | `const delay = (ms) =>` |
| 16 | 289 | `const isPushSupported = () =>` |
| 17 | 295 | `const isStandalonePwa = () =>` |
| 18 | 299 | `const urlBase64ToUint8Array = (base64String) =>` |
| 19 | 302 | `const base64 = (base64String + padding) =>` |
| 20 | 310 | `const stripHtmlToText = (html) =>` |
| 21 | 312 | `const normalizeLibrarySettings = (raw) =>` |
| 22 | 327 | `const normalizeScenarioTitle = (value) =>` |
| 23 | 329 | `const normalizeScenarioTimelineItem = (entry, index) =>` |
| 24 | 363 | `const normalizeScenarioTimeline = (timeline) =>` |
| 25 | 370 | `const normalizeImportedScenarioInput = (input, index) =>` |
| 26 | 383 | `const loadLocalMessages = () =>` |
| 27 | 385 | `const saveLocalMessages = (items) =>` |
| 28 | 386 | `const logCourseProgressDebug = (message, payload = null) =>` |
| 29 | 394 | `const isCourseProgressAccessError = (error) =>` |
| 30 | 419 | `const makeAccessError = (message, code, extra = {}) =>` |
| 31 | 586 | `const sanitizeIfString = (val) =>` |
| 32 | 1064 | `const width = (scale < 1) =>` |
| 33 | 1065 | `const height = (scale < 1) =>` |
| 34 | 1401 | `const hasField = (obj, key) =>` |
| 35 | 1650 | `const toIntOrNull = (value) =>` |
| 36 | 1719 | `const toIntOrNull = (value) =>` |
| 37 | 1998 | `const fromDb = (data \|\| []) =>` |

## `services/pvlAppKernel.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 11 | `export function getHomeRouteByRole(role)` |
| 2 | 17 | `function isPvlCabinetRoute(route)` |
| 3 | 21 | `export function canAccessRoute(role, route)` |
| 4 | 29 | `export function redirectToAllowedRoute(role, attemptedRoute)` |
| 5 | 52 | `export function buildSidebarByRole(role)` |
| 6 | 77 | `export function saveAppSession(payload)` |
| 7 | 85 | `export function loadAppSession()` |
| 8 | 94 | `export function clearAppSession()` |
| 9 | 102 | `export function saveViewPreferences(scope, payload)` |
| 10 | 113 | `export function loadViewPreferences(scope)` |
| 11 | 123 | `export function getAllRoutes()` |
| 12 | 187 | `export function validateRoleAccessMap()` |
| 13 | 197 | `export function validateRouteMap()` |

## `services/pvlGardenNav.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 16 | `export function buildGardenPvlStudentNav()` |
| 2 | 32 | `export function buildGardenPvlMentorNav()` |
| 3 | 52 | `export function buildGardenPvlAdminNav()` |
| 4 | 76 | `export function gardenPvlItemActive(route, item)` |
| 5 | 84 | `const p = (route \|\| '') =>` |

## `services/pvlMockApi.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 34 | `function diffCourseDays(firstYmd, secondYmd)` |
| 2 | 36 | `const toDate = (x) =>` |
| 3 | 39 | `function cloneSeedData(src)` |
| 4 | 69 | `function logDbFallback(payload = {})` |
| 5 | 92 | `function fireAndForget(promiseFactory, meta = {})` |
| 6 | 122 | `function isUuidString(v)` |
| 7 | 131 | `function uuidOrNull(v)` |
| 8 | 134 | `function sqlCohortUuidToSeedId(sqlId)` |
| 9 | 140 | `function seedCohortIdToSqlUuid(seedOrSql)` |
| 10 | 149 | `function contentStatusToDb(status)` |
| 11 | 160 | `export function pvlCohortIdsEquivalent(a, b)` |
| 12 | 167 | `export function pvlPlacementVisibleForCohort(placementCohortId, profileCohortId)` |
| 13 | 172 | `function newPvlPersistedEntityId()` |
| 14 | 182 | `function resolvePvlTargetSection(item)` |
| 15 | 191 | `function resolvePvlLessonKind(item)` |
| 16 | 200 | `function matchPvlDbContentTypeToken(raw)` |
| 17 | 213 | `function pickBestRawContentTypeParts(parts)` |
| 18 | 230 | `function coalesceScalarContentTypeValue(v)` |
| 19 | 248 | `function resolvePvlContentTypeRaw(item)` |
| 20 | 263 | `function sanitizeMetadataForDbPayload(meta)` |
| 21 | 276 | `function finalizePvlContentTypeColumnForPostgres(candidate)` |
| 22 | 291 | `function normalizePvlContentTypeForDb(item)` |
| 23 | 313 | `function contentItemToDbPayload(item)` |
| 24 | 356 | `function mapDbContentItemToRuntime(row)` |
| 25 | 396 | `function mapDbPlacementToRuntime(row)` |
| 26 | 415 | `function mapDbEventToRuntime(row)` |
| 27 | 452 | `function normalizeCalendarEventTypeForDb(value)` |
| 28 | 470 | `function mapDbFaqToRuntime(row)` |
| 29 | 481 | `function studentSqlIdByUserId(userId)` |
| 30 | 485 | `async function ensureDbTrackerHomeworkStructure()` |
| 31 | 553 | `async function syncTrackerAndHomeworkFromDb()` |
| 32 | 567 | `const week = (db.courseWeeks \|\| []) =>` |
| 33 | 632 | `function isSeedPvlDemoStudentId(id)` |
| 34 | 641 | `export function pruneSeedPvlDemoStudentRows()` |
| 35 | 648 | `const strip = (key) =>` |
| 36 | 686 | `export async function syncPvlRuntimeFromDb()` |
| 37 | 699 | `const seedOnly = (db.calendarEvents \|\| []) =>` |
| 38 | 706 | `function applyGardenMentorLinkRow(row)` |
| 39 | 711 | `const profile = (db.studentProfiles \|\| []) =>` |
| 40 | 722 | `const mentor = (db.mentorProfiles \|\| []) =>` |
| 41 | 733 | `async function hydrateGardenMentorAssignmentsFromDb()` |
| 42 | 749 | `async function persistGardenMentorLink(studentUserId, mentorUserId)` |
| 43 | 788 | `export async function syncPvlActorsFromGarden()` |
| 44 | 803 | `const roleOnly = (u) =>` |
| 45 | 817 | `const existingUser = (db.users \|\| []) =>` |
| 46 | 834 | `const existsMentor = (db.mentorProfiles \|\| []) =>` |
| 47 | 854 | `const existingUser = (db.users \|\| []) =>` |
| 48 | 874 | `const sp = (db.studentProfiles \|\| []) =>` |
| 49 | 939 | `export function isPvlPreviewStudentId(userId)` |
| 50 | 948 | `export function ensurePvlPreviewStudentProfile()` |
| 51 | 986 | `function isTaskDisputeOpen(studentId, taskId)` |
| 52 | 992 | `export function canPostTaskThread(studentId, taskId, opts = {})` |
| 53 | 1002 | `function openTaskDisputeCore(actorUserId, studentId, taskId, openedByRole)` |
| 54 | 1034 | `const uid = (prefix) =>` |
| 55 | 1036 | `const nowIso = () =>` |
| 56 | 1056 | `const pushEvent = (type, payload = {}) =>` |
| 57 | 1060 | `const addAuditEvent = (actorUserId, actorRole, actionType, entityType, entityId, summary, payload = {}) =>` |
| 58 | 1088 | `const addNotification = (userId, role, type, text, payload = {}) =>` |
| 59 | 1101 | `const ensurePointsRecord = (studentId) =>` |
| 60 | 1110 | `function upsertWeekCompletion(studentId, weekNumber, payload)` |
| 61 | 1120 | `function upsertControlPointState(studentId, controlPointId, payload)` |
| 62 | 1130 | `function addPointsHistory(studentId, sourceType, sourceId, pointsDelta, sourceLabel, comment = '')` |
| 63 | 1138 | `function syncDerivedStatesForStudent(studentId)` |
| 64 | 1184 | `const derived0Closed = (profile?.currentWeek \|\| 0) =>` |
| 65 | 1195 | `function calculatePointsSummary(studentId)` |
| 66 | 1234 | `function mapRuDecisionToTaskStatus(ru)` |
| 67 | 1243 | `export function mapTaskStatus(status)` |
| 68 | 1260 | `export function mapStudentHomeworkDisplayStatus(state)` |
| 69 | 1278 | `export function mapStudentControlPointDisplayStatus(cpState, deadlineAt, today = DASHBOARD_TODAY)` |
| 70 | 1288 | `function computeStudentDashboardWidgets(studentId)` |
| 71 | 1339 | `function buildStudentActivityFeed(studentId, limit = 10)` |
| 72 | 1404 | `function getStudentSnapshot(studentId)` |
| 73 | 1412 | `function resolveMentorActorId(mentorId)` |
| 74 | 1418 | `function getMentorMenteeIds(mentorId)` |
| 75 | 1422 | `const mentorProfile = (db.mentorProfiles \|\| []) =>` |
| 76 | 1439 | `function buildMentorCohortApplicantRows(mentorId)` |
| 77 | 1442 | `const mp = (db.mentorProfiles \|\| []) =>` |
| 78 | 1470 | `function getTaskDetail(studentId, taskId)` |
| 79 | 1491 | `function buildSubmissionPayload(studentId, taskId, submissionId)` |
| 80 | 1503 | `function persistTrackerProgressToDb(studentId)` |
| 81 | 1531 | `const week = (db.courseWeeks \|\| []) =>` |
| 82 | 1547 | `function persistSubmissionToDb(studentId, taskId)` |
| 83 | 1558 | `const row = (existing \|\| []) =>` |
| 84 | 1591 | `function placementTargetRoleMatchesStudentOrMentor(p, role)` |
| 85 | 1597 | `function contentItemIdFromPlacement(p)` |
| 86 | 1608 | `function getPublishedContentFor(role, section, cohortId)` |
| 87 | 1626 | `function getVisibleContentItems(userId, role, section)` |
| 88 | 1634 | `function publishedContentVisibleToRole(item, cohortId, role)` |
| 89 | 1649 | `function hasPublishedPlacementForStudentContent(contentId, cohortId)` |
| 90 | 1667 | `function getPublishedContentItemForStudent(studentId, contentId)` |
| 91 | 1672 | `const item = (db.contentItems \|\| []) =>` |
| 92 | 1685 | `function ensureLibrarySeedInDb()` |
| 93 | 1688 | `const hasPublishedLibraryContent = (db.contentPlacements \|\| []) =>` |
| 94 | 1691 | `const item = (db.contentItems \|\| []) =>` |
| 95 | 1715 | `function getPublishedLibraryContentForStudent(studentId)` |
| 96 | 1733 | `function isTrackerOnlyLibraryItem(item)` |
| 97 | 1739 | `function getLibraryUiItemsForStudent(studentId)` |
| 98 | 1742 | `function getLibraryCategoriesWithCounts(studentId)` |
| 99 | 1780 | `function getLibraryItemsByCategory(studentId, categoryId)` |
| 100 | 1786 | `function ensureTaskForContentItem(studentId, contentItem)` |
| 101 | 2291 | `const mapCp = (raw) =>` |
| 102 | 2319 | `const enrich = (s) =>` |
| 103 | 2323 | `const lessonHint = (task?.linkedLessonIds \|\| []) =>` |
| 104 | 2452 | `function calendarVisibleToViewer(event, viewerRole)` |
| 105 | 3051 | `const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') =>` |
| 106 | 3132 | `function markThreadRead(userId, studentId, taskId)` |
| 107 | 3143 | `function setTaskStatus(studentId, taskId, toStatus, changedByUserId, comment = '')` |
| 108 | 3314 | `export function pvlPatchCurrentUserFromGarden(gardenUser, resolvedPvlRole)` |
| 109 | 3346 | `const dbEntry = (db.users \|\| []) =>` |

## `services/pvlPostgrestApi.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 10 | `function getAuthToken()` |
| 2 | 18 | `function isEnabled()` |
| 3 | 22 | `function isPgrstJwtError(bodyText)` |
| 4 | 33 | `function logDb(tag, payload = {})` |
| 5 | 43 | `function warnMockMode(reason = '')` |
| 6 | 57 | `function buildHeaders(prefer, withToken)` |
| 7 | 71 | `async function request(table, { method = 'GET', params = {}, body, prefer } = {})` |
| 8 | 123 | `function asArray(data)` |
| 9 | 127 | `function isUuidString(v)` |
| 10 | 133 | `function normalizeCalendarEventTypeForDb(value)` |
| 11 | 147 | `function normalizeHomeworkStatusToDb(value)` |
| 12 | 162 | `function normalizeHomeworkStatusFromDb(value)` |

## `services/pvlRoleResolver.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 3 | `function normalizeGardenRoleValue(value)` |
| 2 | 12 | `export function resolvePvlRoleFromGardenProfile(user)` |
| 3 | 22 | `export function canSeePvlInGarden(user)` |
| 4 | 26 | `export function readGardenCurrentUserFromStorage()` |
| 5 | 35 | `export function logPvlRoleResolution(user, resolvedRole)` |

## `services/pvlScoringEngine.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 20 | `export function pointsForWeek0Closed(isClosed)` |
| 2 | 23 | `export function pointsForClosedWeeks1to12(closedCount)` |
| 3 | 30 | `export function pointsForAcceptedControlPoints(acceptedCount)` |
| 4 | 36 | `export function capMentorBonusPool(rawBonusSum)` |
| 5 | 39 | `export function capCourseTotal(rawSum)` |
| 6 | 43 | `export function capSzSelf(points)` |
| 7 | 47 | `export function capSzMentor(points)` |
| 8 | 56 | `export function computeCoursePointsTotal(input)` |
| 9 | 63 | `export function computeCourseBreakdown(input)` |

## `services/realtimeMessages.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 6 | `const getAuthToken = () =>` |
| 2 | 8 | `const getSupabaseClient = () =>` |
| 3 | 21 | `export const subscribeToMessages = ({ onInsert, onUpdate, onDelete, onError } = {}) =>` |

## `utils/cost.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `export const getCostAmount = (cost) =>` |
| 2 | 4 | `export const getCostCurrency = (cost, fallback = 'рублей') =>` |

## `utils/druidHoroscope.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `export const getDruidTree = (dateString) =>` |

## `utils/meetingTime.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `const getTimeZoneOffsetMinutes = (date, timeZone) =>` |
| 2 | 18 | `const getZonedDate = (dateStr, timeStr, timeZone) =>` |
| 3 | 27 | `export const getMeetingTimezone = (meeting, fallbackTz) =>` |
| 4 | 33 | `export const getMeetingInstant = (meeting, fallbackTz) =>` |
| 5 | 39 | `export const isMeetingPast = (meeting, now = new Date()) =>` |

## `utils/pvlDateFormat.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `function pad2(n)` |
| 2 | 5 | `function parseToDate(input)` |
| 3 | 32 | `export function formatPvlDateTime(input)` |
| 4 | 39 | `const hasTime = (() => {         const s = String(input).trim();         return /[T\s,]\d{2}:\d{2}/.test(s)             \|\| (s.length > 10 && /^\d{4}-\d{2}-\d{2}/.test(s) && (d.getHours() !== 0 \|\| d.getMinutes() !== 0));     }) =>` |
| 5 | 49 | `export function formatPvlDateOnly(input)` |

## `utils/pvlGardenAdmission.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 9 | `const norm = (v) =>` |
| 2 | 36 | `export function isGardenStaffProfile(profile)` |
| 3 | 47 | `export function classifyGardenProfileForPvlStudent(profile)` |
| 4 | 72 | `export function pvlGardenRoleLabelRu(gardenRole)` |

## `utils/pvlMarkdownImport.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 6 | `function escapeForCodeContent(s)` |
| 2 | 13 | `function escapeHtmlAttr(s)` |
| 3 | 25 | `function preprocessObsidianEmbeds(md)` |
| 4 | 37 | `export function markdownToPvlHtml(markdown = '')` |
| 5 | 42 | `function peelYamlFrontMatter(text)` |
| 6 | 67 | `function isNoiseListOrHrLine(line)` |
| 7 | 80 | `export function parsePvlImportedMarkdownDoc(text = '')` |

## `utils/pvlPlainText.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 7 | `export function pvlHtmlToPlainText(raw, maxLen = 0)` |
| 2 | 38 | `export function pvlMaterialCardExcerpt(item, maxLen = 180)` |

## `utils/roles.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 26 | `export const hasAccess = (userRole, requiredRole) =>` |
| 2 | 32 | `export const getRoleLabel = (role) =>` |
| 3 | 34 | `export const getRoleColor = (role) =>` |
| 4 | 35 | `export const getRoleBg = (role) =>` |

## `utils/skills.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `export const normalizeSkills = (...values) =>` |

## `utils/tenure.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 1 | `const pluralizeYears = (n) =>` |
| 2 | 8 | `export const getTenureText = (joinDate) =>` |
| 3 | 26 | `export const getTenureParts = (joinDate) =>` |

## `utils/timezone.js`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 116 | `export const resolveCityTimezone = (city, fallback = null) =>` |

## `views/AdminPanel.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 18 | `const AdminStatsDashboard = ({ meetings = [], users = [] }) =>` |
| 2 | 22 | `const isInPeriod = (date) =>` |
| 3 | 246 | `const AdminPanel = ({ users, knowledgeBase, news = [], librarySettings, onSetCourseVisible, onReorderCourseMaterials, onUpdateUserRole, onRefreshUsers, onAddContent, onNormalizeKnowledgeContent, onGetLeagueScenarios, onImportLeagueScenarios, onDeleteLeagueScenario, onUpdateLeagueScenario, onAddNews, onUpdateNews, onDeleteNews, onExit, onNotify, onSwitchToApp, onGetAllMeetings, onGetAllEvents, onUpdateEvent, onDeleteEvent }) =>` |
| 4 | 285 | `const parseTags = (rawTags) =>` |
| 5 | 295 | `const stripHtml = (html) =>` |
| 6 | 297 | `const normalizeEventDateToIso = (value) =>` |
| 7 | 310 | `const getEventMoscowTimeLabel = (event) =>` |
| 8 | 336 | `const refreshLeagueScenarios = async () =>` |
| 9 | 342 | `const handlePublishScenario = async () =>` |
| 10 | 389 | `const handleEditLeagueScenario = (scenario) =>` |
| 11 | 403 | `const getSortedItems = (category, items) =>` |
| 12 | 417 | `const grouped = (knowledgeBase \|\| []) =>` |
| 13 | 429 | `const handleDropMaterial = (category, targetIndex) =>` |
| 14 | 447 | `const handleAdd = () =>` |
| 15 | 462 | `const confirmAction = (title, message, onConfirm, variant = 'primary') =>` |
| 16 | 629 | `const leaderName = (leader?.name \|\| '') =>` |
| 17 | 632 | `const parseDate = (d) =>` |
| 18 | 650 | `const groupByMonth = (events) =>` |
| 19 | 659 | `const renderEventCard = (ev) =>` |
| 20 | 702 | `const renderMonthGroups = (byMonth) =>` |
| 21 | 907 | `const emails = (users \|\| []) =>` |
| 22 | 941 | `const isNew = (Date.now() - u.id) =>` |

## `views/AuthScreen.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 5 | `const AuthScreen = ({ onLogin, onNotify, onResetPassword }) =>` |
| 2 | 26 | `const handleRegisterCalculate = () =>` |
| 3 | 43 | `const handleRegisterComplete = async () =>` |
| 4 | 78 | `const handleLoginSubmit = async () =>` |
| 5 | 85 | `const handleForgot = async () =>` |
| 6 | 103 | `const handleResetSubmit = async () =>` |

## `views/BuilderView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 9 | `const CheckBoxLine = ({ text }) =>` |
| 2 | 16 | `const escapeHtml = (text) =>` |
| 3 | 23 | `const splitUrlAndPunctuation = (raw) =>` |
| 4 | 26 | `const core = (match?.[1] \|\| raw) =>` |
| 5 | 30 | `const linkifyEscapedText = (escapedText) =>` |
| 6 | 39 | `const plainTextToHtml = (text) =>` |
| 7 | 80 | `const enhanceLinksInHtml = (html) =>` |
| 8 | 129 | `const normalizeStyledHtmlToSemantic = (html) =>` |
| 9 | 150 | `const replaceWithTag = (nextTag) =>` |
| 10 | 182 | `const formatMaterialContent = (content) =>` |
| 11 | 197 | `const DocumentPreviewModal = ({ type, timeline, title, user, onClose, onNotify, extraAction, materialContentHtml }) =>` |
| 12 | 199 | `const getExportSourceNode = () =>` |
| 13 | 203 | `const buildExportNode = () =>` |
| 14 | 224 | `const handleExportPdf = async () =>` |
| 15 | 229 | `const safeTitle = (title \|\| (type === 'workbook' ? 'workbook' : 'scenario')) =>` |
| 16 | 259 | `const pdfHeight = (imgProps.height * pdfWidth) =>` |
| 17 | 282 | `const handlePrint = () =>` |
| 18 | 431 | `const SaveScenarioModal = ({ onSave, checkActionTimer, onClose, user, onNotify }) =>` |
| 19 | 478 | `const ScenarioList = ({ scenarios, variant, onLoad, onDelete, emptyMessage, completedIds = new Set() }) =>` |
| 20 | 524 | `const ImportScenarioModal = ({ onImport, onClose }) =>` |
| 21 | 560 | `const BuilderView = ({ practices, timeline, setTimeline, onNotify, user, onSave, onCompleteLeagueScenario, initialTab = 'builder', resetToken = 0 }) =>` |
| 22 | 635 | `const addToTimeline = (practice) =>` |
| 23 | 640 | `const addFreeInputStep = () =>` |
| 24 | 654 | `const removeFromTimeline = (uniqueId) =>` |
| 25 | 656 | `const moveItem = (index, direction) =>` |
| 26 | 666 | `const insertIntoTimeline = (item, index) =>` |
| 27 | 673 | `const moveTimelineItemToIndex = (dragId, index) =>` |
| 28 | 684 | `const updateTimelineItem = (uniqueId, patch) =>` |
| 29 | 688 | `const parseImportedText = (rawText) =>` |
| 30 | 725 | `const handleImportScenario = (text, replaceCurrent) =>` |
| 31 | 739 | `const handleTimelineDrop = (event, index = null) =>` |
| 32 | 762 | `const handleSave = async (title, isPublic) =>` |
| 33 | 788 | `const handleDeleteScenario = async () =>` |
| 34 | 802 | `const handleLoadScenario = (scenario) =>` |
| 35 | 804 | `const hydratedTimeline = (scenario.timeline \|\| []) =>` |
| 36 | 813 | `const handleOpenLeagueScenario = (scenario) =>` |
| 37 | 841 | `const handleCompleteLeagueScenario = async () =>` |

## `views/CRMView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 7 | `const CRMView = ({ clients, onAddClient, onUpdateClient, onDeleteClient, onNotify }) =>` |
| 2 | 14 | `const parseDateValue = (value) =>` |
| 3 | 35 | `const formatDateForInput = (value) =>` |
| 4 | 44 | `const formatDateForDisplay = (value) =>` |
| 5 | 49 | `const handleOpenAdd = () =>` |
| 6 | 51 | `const handleOpenEdit = (c) =>` |
| 7 | 64 | `const handleSave = () =>` |
| 8 | 80 | `const getDaysUntilBirthday = (birthDate) =>` |

## `views/CommunicationsView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 10 | `const CommunicationsView = ({ user, users = [], channelItems = [], onNotify, onOpenProfile }) =>` |
| 2 | 54 | `const sortMessages = (items) =>` |
| 3 | 57 | `const mergeMessages = (current, incoming) =>` |
| 4 | 67 | `const formatMessageTime = (value) =>` |
| 5 | 96 | `const loadMessages = async () =>` |
| 6 | 100 | `const incoming = (Array.isArray(data) ? data : []) =>` |
| 7 | 113 | `const loadOlderMessages = async () =>` |
| 8 | 119 | `const older = (Array.isArray(data) ? data : []) =>` |
| 9 | 201 | `const handleSend = async () =>` |
| 10 | 259 | `const handleTextareaKeyDown = (event) =>` |
| 11 | 266 | `const handlePickAttachment = (event) =>` |
| 12 | 284 | `const handleRemoveAttachment = () =>` |
| 13 | 291 | `const handleRetryMessage = async (msg) =>` |
| 14 | 298 | `const beginEditMessage = (msg) =>` |
| 15 | 303 | `const cancelEditMessage = () =>` |
| 16 | 308 | `const saveEditMessage = async (msg) =>` |
| 17 | 327 | `const handleDeleteMessage = async (msg) =>` |
| 18 | 338 | `const handleMessagesScroll = (event) =>` |
| 19 | 344 | `const scrollToBottom = () =>` |
| 20 | 439 | `const authorByName = (users \|\| []) =>` |

## `views/CourseLibraryView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 137 | `function normalizeStyledHtmlToSemantic(html)` |
| 2 | 158 | `const replaceWithTag = (nextTag) =>` |
| 3 | 190 | `const CourseLibraryView = ({     user,     knowledgeBase = [],     librarySettings,     onCompleteLesson,     onNotify,     onBackToGarden,     onCourseSidebarChange,     gardenPvlBridgeRef,     resetToken = 0 }) =>` |
| 4 | 221 | `const normalizeTags = (tags) =>` |
| 5 | 230 | `const escapeHtml = (text) =>` |
| 6 | 237 | `const splitUrlAndPunctuation = (raw) =>` |
| 7 | 240 | `const core = (match?.[1] \|\| raw) =>` |
| 8 | 244 | `const linkifyEscapedText = (escapedText) =>` |
| 9 | 253 | `const plainTextToHtml = (text) =>` |
| 10 | 294 | `const enhanceLinksInHtml = (html) =>` |
| 11 | 343 | `const formatMaterialContent = (content) =>` |
| 12 | 411 | `const staticMaterials = (selectedCourse.materials \|\| []) =>` |
| 13 | 471 | `const loadProgress = async () =>` |
| 14 | 486 | `const markCompleted = (material) =>` |
| 15 | 505 | `const handleOpenMaterial = (material) =>` |
| 16 | 514 | `const syncPvlSessionFromAlCamp = (session) =>` |
| 17 | 535 | `const buildGardenAlCampSession = (u) =>` |
| 18 | 542 | `const handleGardenCampResume = () =>` |

## `views/LeaderPageView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 17 | `const normalizeReviews = (raw) =>` |
| 2 | 44 | `const escapeHtml = (value) =>` |
| 3 | 46 | `const formatReviewDate = (value) =>` |
| 4 | 53 | `const openReviewCard = (review) =>` |
| 5 | 96 | `const safeFilePart = (value) =>` |
| 6 | 105 | `const buildReviewCardNode = (review) =>` |
| 7 | 180 | `const LeaderPageView = ({ leader, currentUser, onBack, onUpdateProfile }) =>` |
| 8 | 246 | `const handleSaveReviews = async (nextReviews = reviews) =>` |
| 9 | 255 | `const handleEditReview = (review) =>` |
| 10 | 266 | `const handleSaveReview = () =>` |
| 11 | 294 | `const handleDeleteReview = (id) =>` |
| 12 | 310 | `const handleDownloadReviewCard = async (review) =>` |

## `views/MapView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 11 | `const FilterSelect = ({ icon: Icon, value, onChange, options, placeholder }) =>` |
| 2 | 31 | `const UserCard = ({ user, onClick }) =>` |
| 3 | 39 | `const handleKeyDown = (event) =>` |
| 4 | 112 | `const MapView = ({ users, currentUser, onOpenLeader }) =>` |
| 5 | 118 | `const normalizeKey = (value) =>` |
| 6 | 144 | `const city = (u.city \|\| '') =>` |
| 7 | 163 | `const resetFilters = () =>` |
| 8 | 251 | `const displayUser = (currentUser && user.id === currentUser.id) =>` |
| 9 | 322 | `const displayUser = (currentUser && user.id === currentUser.id) =>` |

## `views/MarketView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 2 | `const MarketView = () =>` |

## `views/MeetingsView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 11 | `const normalizeCityKey = (value) =>` |
| 2 | 18 | `const normalizeMeetingFormat = (meeting) =>` |
| 3 | 31 | `const CalendarWidget = ({ meetings, onPlanClick, currentDate, setCurrentDate, showPlanButton = true }) =>` |
| 4 | 41 | `const prevMonth = () =>` |
| 5 | 45 | `const nextMonth = () =>` |
| 6 | 53 | `const getDayStatusColor = (day) =>` |
| 7 | 142 | `const MonthAnalytics = ({ meetings, currentDate }) =>` |
| 8 | 165 | `const MetricCard = ({ label, value, subLabel, colorClass = "text-slate-900" }) =>` |
| 9 | 192 | `const MeetingsTab = ({     meetings,     users,     onPlanClick,     onResultClick,     onCancelClick,     onDeleteClick,     onUpdateMeeting,     onDuplicateClick,     onRescheduleCancelledClick }) =>` |
| 10 | 215 | `const getStatus = (m) =>` |
| 11 | 273 | `const MasteryTab = ({ meetings, goals, onAddGoal, onEditGoal, onToggleGoal, onDeleteGoal }) =>` |
| 12 | 304 | `const tags = (m.keep_notes \|\| '') =>` |
| 13 | 321 | `const tags = (m.change_notes \|\| '') =>` |
| 14 | 514 | `const tags = (m.keep_notes \|\| '') =>` |
| 15 | 575 | `const tags = (m.change_notes \|\| '') =>` |
| 16 | 619 | `const MeetingsView = ({     user,     users = [],     meetings,     goals,     scenarios: propScenarios, // Scenarios might not be passed, check userApp     onAddMeeting,     onUpdateMeeting,     onDeleteMeeting,     onAddGoal,     onUpdateGoal,     onDeleteGoal,     onNotify,     initialTab }) =>` |
| 17 | 671 | `const loadData = async () =>` |
| 18 | 688 | `const buildDraftFromMeeting = (meeting, { source = 'duplicate' } = {}) =>` |
| 19 | 717 | `const handleOpenPlan = (meeting = null, options = {}) =>` |
| 20 | 719 | `const ensurePhotoChecklistItems = (checklist = []) =>` |
| 21 | 776 | `const handleDuplicateMeeting = (meeting) =>` |
| 22 | 781 | `const handleRescheduleCancelledMeeting = (meeting) =>` |
| 23 | 787 | `const validatePublicFields = (data) =>` |
| 24 | 815 | `const handleImageUpload = async (e) =>` |
| 25 | 851 | `const toggleCoHost = (userId) =>` |
| 26 | 861 | `const handleSavePlan = async () =>` |
| 27 | 913 | `const handleOpenResult = (meeting) =>` |
| 28 | 924 | `const handleSaveResult = async () =>` |
| 29 | 949 | `const handleConfirmGoalCompletion = async () =>` |
| 30 | 960 | `const handleOpenCancel = (meeting) =>` |
| 31 | 965 | `const handleSaveCancel = async () =>` |
| 32 | 999 | `const handleDeleteMeeting = (id) =>` |
| 33 | 1005 | `const handleConfirmDelete = async () =>` |
| 34 | 1017 | `const handleOpenAddGoal = (initialData = {}) =>` |
| 35 | 1026 | `const handleOpenEditGoal = (goal) =>` |
| 36 | 1031 | `const handleSaveGoal = async () =>` |
| 37 | 1062 | `const handleToggleGoal = async (goal) =>` |
| 38 | 1075 | `const handleDeleteGoal = (id) =>` |
| 39 | 1080 | `const handleConfirmDeleteGoal = async () =>` |
| 40 | 1092 | `const getAllUniqueTags = () =>` |
| 41 | 1095 | `const combined = (m.keep_notes \|\| '') =>` |

## `views/MentorDashboardView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 8 | `export function statusBadge(status)` |
| 2 | 20 | `export function riskBadge(riskType)` |
| 3 | 28 | `export function navigateToMenteeCard(id, options = {})` |
| 4 | 36 | `export function renderMentorDashboard()` |
| 5 | 44 | `const Pill = ({ children, tone }) =>` |
| 6 | 50 | `export default function MentorDashboardView()` |

## `views/NewsView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 6 | `const NewsView = ({ news = [], users = [] }) =>` |
| 2 | 114 | `const decodeEntities = (value) =>` |
| 3 | 125 | `const formatNewsBody = (value) =>` |

## `views/PracticesView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 10 | `const parseCsvLine = (line, delimiter) =>` |
| 2 | 40 | `const normalizeHeader = (value) =>` |
| 3 | 42 | `const pickDelimiter = (headerLine) =>` |
| 4 | 44 | `const commaCount = (headerLine.match(/,/g) \|\| []) =>` |
| 5 | 45 | `const semicolonCount = (headerLine.match(/;/g) \|\| []) =>` |
| 6 | 48 | `const parsePracticesCsv = (rawText) =>` |
| 7 | 65 | `const getValue = (cells, keys) =>` |
| 8 | 113 | `const PracticesView = ({ user, practices, onAddPractice, onUpdatePractice, onDeletePractice, onNotify }) =>` |
| 9 | 143 | `const normalize = (str) =>` |
| 10 | 147 | `const renderDescriptionWithLinks = (text) =>` |
| 11 | 172 | `const parseDurationMinutes = (practice) =>` |
| 12 | 180 | `const getDurationLabel = (practice) =>` |
| 13 | 187 | `const splitReflectionQuestions = (value) =>` |
| 14 | 217 | `const handleSave = () =>` |
| 15 | 241 | `const openAddModal = () =>` |
| 16 | 246 | `const openEditModal = (practice, e) =>` |
| 17 | 256 | `const openImportModal = () =>` |
| 18 | 263 | `const refreshCsvPreview = (nextText) =>` |
| 19 | 270 | `const handleCsvFile = async (event) =>` |
| 20 | 284 | `const handleDownloadTemplate = () =>` |
| 21 | 296 | `const handleImportCsv = async () =>` |

## `views/ProfileView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 10 | `const TagsInput = ({ label, value = [], onChange, placeholder = "Добавить...", options = [] }) =>` |
| 2 | 13 | `const commitTag = (raw) =>` |
| 3 | 27 | `const handleKeyDown = (e) =>` |
| 4 | 40 | `const addTag = () =>` |
| 5 | 45 | `const removeTag = (tagToRemove) =>` |
| 6 | 59 | `const addSuggestion = (suggestion) =>` |
| 7 | 65 | `const renderHighlighted = (text) =>` |
| 8 | 130 | `const ProfileView = ({ user, onUpdateProfile, onLogout, onDeleteAccount, onNotify, skillOptions = [], onOpenLeaderPage, onEnablePushNotifications, pushStatus = {} }) =>` |
| 9 | 154 | `const calculateProgress = () =>` |
| 10 | 171 | `const handleSave = () =>` |
| 11 | 185 | `const handlePhotoUpload = async (e) =>` |
| 12 | 202 | `const handlePasswordUpdate = async () =>` |

## `views/PvlCalendarBlock.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 9 | `function readCalendarUiPrefs()` |
| 2 | 18 | `function monthDateFromPrefsYm(ym)` |
| 3 | 34 | `export function calendarEventDotClass(eventType)` |
| 4 | 52 | `function formatCalendarMonthYearRu(d)` |
| 5 | 61 | `function eventDayKey(ev)` |
| 6 | 71 | `function eventsForMonth(events, year, monthIndex)` |
| 7 | 75 | `const pad = (n) =>` |
| 8 | 79 | `function parseCalendarEventIdFromRoute(route)` |
| 9 | 90 | `function groupByDay(list)` |
| 10 | 100 | `function openEventNavigation(ev, navigate, routePrefix)` |
| 11 | 120 | `function CalendarLegendDot({ eventType })` |
| 12 | 128 | `function CalendarDayButton({     day,     dayEvts,     isSelected,     isToday,     showTodayHighlight,     onClick, })` |
| 13 | 165 | `function sortEventsChronologically(list)` |
| 14 | 173 | `export function PvlDashboardCalendarBlock({     viewerRole,     cohortId,     navigate,     routePrefix = '/student',     title = 'Календарь курса',     onOpenFullCalendar,     /** Текст зелёной кнопки под сеткой (если передан onOpenFullCalendar) */     scheduleCtaLabel = '+ Запланировать',     eventTypeFilter = [], })` |
| 15 | 232 | `const handleMonthNav = (delta) =>` |
| 16 | 381 | `export function PvlAdminCalendarScreen({ navigate, refresh, route = '/admin/calendar' })` |
| 17 | 462 | `const bump = () =>` |
| 18 | 477 | `const createNewCalendarEvent = () =>` |

## `views/PvlMenteeCardView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 52 | `const statusTone = (status) =>` |
| 2 | 61 | `const Pill = ({ children, tone }) =>` |
| 3 | 69 | `const resultsStatusTone = (status) =>` |
| 4 | 79 | `function ResultsStatusBadge({ children })` |
| 5 | 87 | `export function filterTasksByStatus(tasks, statusFilter)` |
| 6 | 93 | `export function filterMessagesByUnread(messages, unreadOnly)` |
| 7 | 98 | `export function calculateMenteeRiskLevel(risks)` |
| 8 | 104 | `export function getNextRequiredAction(tasks, risks)` |
| 9 | 114 | `export function openTaskDetail(taskId, setSelectedTaskId)` |
| 10 | 118 | `export function navigateBackToMentorDashboard(onBack)` |
| 11 | 122 | `export function MenteeHeader({     profile,     onBack,     coursePathLine,     closedTasksPercent,     nearestDeadlineLine,     riskHint,     backLabel = '← Назад в дашборд ментора',     showBackButton = true, })` |
| 12 | 158 | `export function MenteeCoursePathShort({ stats, lastLessonTitle, courseProgressPercent })` |
| 13 | 177 | `export function menteeHomeworkNeedsHighlight(t)` |
| 14 | 181 | `export function MenteeHomeworkResultsList({ tasks, onOpenTask })` |
| 15 | 185 | `const toStatus = (t) =>` |
| 16 | 186 | `const statusRank = (t) =>` |
| 17 | 195 | `const acceptedAtMs = (t) =>` |
| 18 | 200 | `const isArchivedAccepted = (t) =>` |
| 19 | 292 | `function attentionRank(status)` |
| 20 | 301 | `export function MenteeHomeworkPrioritized({ tasks, onOpenTask })` |
| 21 | 307 | `const byWeek = (list) =>` |
| 22 | 351 | `export function MenteeTaskGroupByWeek({ weekNumber, tasks, onOpenTask })` |
| 23 | 386 | `export function renderTaskGroups(tasks, statusFilter, onOpenTask)` |
| 24 | 399 | `export function MenteeTasksList({ tasks, statusFilter, setStatusFilter, onOpenTask })` |
| 25 | 419 | `export function renderControlPoints(points)` |
| 26 | 437 | `export function ControlPointsPanel({ points })` |
| 27 | 446 | `export function renderDeadlineRisks(risks, onOpenTask)` |
| 28 | 463 | `export function DeadlineRiskPanel({ risks, onOpenTask })` |
| 29 | 472 | `export function renderMentorMeetings(items)` |
| 30 | 487 | `export function MentorMeetingsPanel({ meetings })` |
| 31 | 496 | `export function renderThreadFeed(feed, unreadOnly)` |
| 32 | 509 | `export function MenteeThreadFeed({ feed, unreadOnly, setUnreadOnly, taskFilter, setTaskFilter })` |
| 33 | 531 | `export function renderCertificationProgress(progress)` |
| 34 | 552 | `export function CertificationProgressPanel({ progress })` |
| 35 | 556 | `export function MentorQuickActions({ tasks, risks = deadlineRisks, onOpenTask })` |
| 36 | 576 | `function buildRiskHint(risks)` |
| 37 | 578 | `const active = (risks \|\| []) =>` |
| 38 | 583 | `export function renderMenteeCard({     profile,     homeworkResults,     coursePathLine,     closedTasksPercent,     risks,     meetings,     certification,     nearestDeadlineLine,     onOpenTask,     onBack,     backLabel,     showHeaderBack = true, })` |
| 39 | 624 | `function riskLevelRu(level)` |
| 40 | 629 | `function meetingStatusRu(s)` |
| 41 | 634 | `function reflectionStatusRu(s)` |
| 42 | 639 | `function certFieldRu(v)` |
| 43 | 656 | `export default function PvlMenteeCardView({     menteeId = 'u-st-1',     onBack,     navigate,     refreshKey = 0,     /** 'mentor' \| 'admin' — база маршрутов для открытия задания */     linkMode = 'mentor',     backLabel,     /** false — когда «назад» показывает общая шапка учительской (AdminDrilldownNavBar) */     showHeaderBack = true, })` |
| 44 | 708 | `const risks = (card.risks \|\| []) =>` |
| 45 | 719 | `const meetings = (card.meetings \|\| []) =>` |
| 46 | 762 | `const onOpenTask = (taskId) =>` |

## `views/PvlPrototypeApp.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 92 | `function pvlDevToolsEnabled()` |
| 2 | 105 | `function resolveActorUser(id)` |
| 3 | 114 | `function resolveActorDisplayName(id)` |
| 4 | 121 | `function resolveStudentDashboardHeroName(studentId)` |
| 5 | 139 | `function getFirstCohortStudentId()` |
| 6 | 161 | `function normalizeContentStatus(s)` |
| 7 | 166 | `function buildMergedCmsState()` |
| 8 | 204 | `function resolvePvlMentorActorId(actingUserId)` |
| 9 | 209 | `function pvlPersonInitials(displayName)` |
| 10 | 217 | `function toRoute(name)` |
| 11 | 279 | `function sidebarRoutePath(route)` |
| 12 | 285 | `function courseSidebarItemActive(currentRoute, prefix, label)` |
| 13 | 291 | `function mentorSectionForRoute(allowedRoute)` |
| 14 | 304 | `function adminSectionForRoute(allowedRoute)` |
| 15 | 327 | `const STATUS_TONE = (status) =>` |
| 16 | 338 | `const StatusBadge = ({ children, compact = false }) =>` |
| 17 | 346 | `function shortTaskStatusLabel(status)` |
| 18 | 358 | `function sortHomeworkByRecency(items = [])` |
| 19 | 360 | `const safeDate = (v) =>` |
| 20 | 370 | `function deadlineUrgencyTone(deadlineAt)` |
| 21 | 382 | `function hideDeadlineForAcceptedWithScore(task)` |
| 22 | 388 | `function pointsSourceLabel(sourceType)` |
| 23 | 400 | `function printMaterialSheet(title, bodyText)` |
| 24 | 435 | `const RiskBadge = ({ level }) =>` |
| 25 | 437 | `const DeadlineBadge = ({ value }) =>` |
| 26 | 438 | `const PointsHistoryList = ({ items = [] }) =>` |
| 27 | 449 | `const MentorBonusUsageBadge = ({ used }) =>` |
| 28 | 451 | `const ControlPointsSummary = ({ accepted }) =>` |
| 29 | 452 | `function pvlSidebarNavClass(active)` |
| 30 | 501 | `function MenuLabel({ iconMap, label })` |
| 31 | 514 | `const SidebarMenu = ({     role,     route: currentRoute,     studentSection,     setStudentSection,     adminSection,     setAdminSection,     mentorSection,     setMentorSection,     navigate,     onGardenExit,     studentId = 'u-st-1',     actingUserId = 'u-st-1',     className = '', }) =>` |
| 32 | 734 | `function breadcrumbSegmentLabel(seg)` |
| 33 | 745 | `function adminRoutePath(route)` |
| 34 | 748 | `function shouldShowSubtleTrail(route)` |
| 35 | 757 | `function resolveAdminDrilldownNav(route)` |
| 36 | 834 | `function AdminDrilldownNavBar({ route, navigate })` |
| 37 | 857 | `const SubtleTrail = ({ path }) =>` |
| 38 | 865 | `function exportMaterialMarkdown(title = '', html = '')` |
| 39 | 897 | `const CabinetSwitcher = ({ role, setRole, navigate, onEmbeddedDemoRoleChange }) =>` |
| 40 | 898 | `const tab = (r, label, home) =>` |
| 41 | 925 | `const ScreenState = ({ loading, error, empty, children, emptyText = 'Пока ничего нет.' }) =>` |
| 42 | 932 | `function createContentItem(items, payload)` |
| 43 | 936 | `function updateContentItem(items, id, patch)` |
| 44 | 940 | `function publishContentItem(items, id)` |
| 45 | 944 | `function archiveContentItem(items, id)` |
| 46 | 948 | `function unpublishToDraftItems(items, id)` |
| 47 | 952 | `async function pvlRichEditorUploadImage(file)` |
| 48 | 961 | `function assignContentToSection(placements, contentId, targetSection, targetRole, targetCohort)` |
| 49 | 965 | `function filterContentItems(items, filters)` |
| 50 | 1017 | `function labelTargetSection(key)` |
| 51 | 1021 | `function practicumEventTypeRu(t)` |
| 52 | 1046 | `function getPublishedContentBySection(sectionKey, role = 'student', items = [], placements = [], cohortId = 'cohort-2026-1')` |
| 53 | 1084 | `function isPvlNoiseTrackerLessonTitle(title)` |
| 54 | 1092 | `function buildTrackerModulesFromCms(cmsItems = [], cmsPlacements = [])` |
| 55 | 1122 | `function isPvlJunkLibraryPreviewItem(item)` |
| 56 | 1133 | `function AdminContentSectionPreview({     section,     items,     placements,     cohortId = 'cohort-2026-1',     moduleFilter = 'all', })` |
| 57 | 1242 | `function GardenContentCards({ items })` |
| 58 | 1263 | `function filterLibraryItems(items, filters)` |
| 59 | 1271 | `function searchLibraryItems(items, query)` |
| 60 | 1280 | `function sortLibraryItems(items, sortBy = 'order')` |
| 61 | 1287 | `function escapeHtml(source = '')` |
| 62 | 1296 | `function normalizeImportedTitle(raw = '')` |
| 63 | 1309 | `function parseImportedPvlDocWithFileName(text = '', fileName = '')` |
| 64 | 1319 | `function buildCategoryIdFromTitle(title = '')` |
| 65 | 1329 | `function clampPvlModule(value)` |
| 66 | 1335 | `function LibraryPage({ studentId, navigate, initialItemId = '', routePrefix = '/student', refresh = null, refreshKey = 0 })` |
| 67 | 1448 | `const goLibraryRoot = () =>` |
| 68 | 1454 | `const goLibraryCategory = () =>` |
| 69 | 1643 | `function navigateToStudentCard(navigate, studentId)` |
| 70 | 1647 | `function navigateToMentorCard(navigate, mentorId)` |
| 71 | 1651 | `function navigateToTaskDetail(navigate, studentId, taskId)` |
| 72 | 1662 | `function buildTaskDetailStateFromApi(studentId, taskId, viewerRole = 'student')` |
| 73 | 1668 | `const thread = (detail.thread \|\| []) =>` |
| 74 | 1684 | `const firstLessonId = (task.linkedLessonIds \|\| []) =>` |
| 75 | 1739 | `function StudentDashboard({ studentId, navigate, routePrefix = '/student', gardenBridgeRef = null })` |
| 76 | 1760 | `const fmtDeadline = (ymd) =>` |
| 77 | 1953 | `function practicumStatusRu(status)` |
| 78 | 1965 | `function StudentLessonsLive({ studentId, navigate })` |
| 79 | 1985 | `function groupPracticumEventsByCalendarDay(events)` |
| 80 | 2005 | `function StudentPracticumsCalendar({ studentId })` |
| 81 | 2049 | `function StudentAboutEnriched({ navigate, routePrefix = '/student', cmsItems = [], cmsPlacements = [] })` |
| 82 | 2057 | `const goTracker = () =>` |
| 83 | 2250 | `function StudentGlossarySearch({ studentId = '', cmsItems = [], cmsPlacements = [] })` |
| 84 | 2257 | `const escapeRegExp = (value = '') =>` |
| 85 | 2258 | `const cleanTerm = (value = '') =>` |
| 86 | 2349 | `const termFirstLetter = (term) =>` |
| 87 | 2367 | `const exportGlossaryPdf = () =>` |
| 88 | 2388 | `const blockHeight = (lines.length * 4) =>` |
| 89 | 2477 | `function StudentCertificationReference({ navigate })` |
| 90 | 2597 | `function StudentResults({ studentId, navigate, routePrefix = '/student' })` |
| 91 | 2607 | `const pointsHistory = (pvlDomainApi.db.pointsHistory \|\| []) =>` |
| 92 | 2751 | `function DirectMessageThread({ messages, actorId })` |
| 93 | 2777 | `function StudentDirectMessages({ studentId = 'u-st-1' })` |
| 94 | 2802 | `const onSend = () =>` |
| 95 | 2846 | `function MentorDirectMessages({ mentorId = 'u-men-1' })` |
| 96 | 2868 | `const onSend = () =>` |
| 97 | 2920 | `function StudentGeneric({ title, children })` |
| 98 | 2929 | `function PvlContentStub({ title, hint })` |
| 99 | 2938 | `function PvlCabinetSettingsStub()` |
| 100 | 2947 | `function PvlMergeOnboardingRedirect({ navigate, to })` |
| 101 | 2958 | `function StudentPage({ route, studentId, navigate, cmsItems, cmsPlacements, refresh, refreshKey = 0, routePrefix = '/student', gardenBridgeRef = null })` |
| 102 | 3058 | `function MentorMaterialsPage({ cmsItems, cmsPlacements })` |
| 103 | 3075 | `function riskLevelDisplay(level)` |
| 104 | 3080 | `function buildTeacherStudentRows()` |
| 105 | 3117 | `function buildMentorMenteeRows(mentorId)` |
| 106 | 3165 | `function mentorMenteeInitials(fullName)` |
| 107 | 3172 | `function menteeStatusSurface(stateLine)` |
| 108 | 3179 | `function MentorMenteesGardenGrid({ navigate, menteeRows, heading })` |
| 109 | 3267 | `function kanbanColumnToStatus(col)` |
| 110 | 3274 | `function MentorKanbanBoard({ mentorId, navigate, refreshKey, onStatusChanged })` |
| 111 | 3280 | `const update = () =>` |
| 112 | 3289 | `const handleDrop = (col, e) =>` |
| 113 | 3303 | `const moveCardTo = (studentId, taskId, col) =>` |
| 114 | 3308 | `const renderCard = (q, col) =>` |
| 115 | 3377 | `const emptyColumn = (title, body) =>` |
| 116 | 3384 | `const col = (key, title, hint, items, emptyTitle, emptyBody) =>` |
| 117 | 3433 | `function MentorApplicantsPanel({ mentorId, refreshKey = 0 })` |
| 118 | 3504 | `function MentorMenteesPanel({ navigate, mentorId, refreshKey = 0 })` |
| 119 | 3514 | `function MentorReviewQueuePanel({ navigate, mentorId, refresh, refreshKey = 0 })` |
| 120 | 3523 | `function MentorDashboard({ navigate, mentorId, refresh, refreshKey = 0 })` |
| 121 | 3551 | `function MentorPage({ route, navigate, cmsItems, cmsPlacements, refresh, refreshKey = 0, mentorId = 'u-men-1' })` |
| 122 | 3555 | `const direct = (mp?.menteeIds \|\| []) =>` |
| 123 | 3559 | `const mentorMirrorUnavailable = (         <div className="rounded-3xl bg-white p-8 text-center text-slate-600 text-sm shadow-[0_12px_40px_-12px_rgba(15,23,42,0.07)]">             <p className="font-medium text-slate-800">Нет ученицы для предпросмотра</p>             <p className="mt-2 text-slate-500 max-w-md mx-auto">Когда учительская закрепит менти, здесь откроется такой же вид, как в кабинете ученицы.</p>         </div>     ) =>` |
| 124 | 3633 | `const mentorCourseNavigate = (r) =>` |
| 125 | 3658 | `function TeacherPvlHome({ navigate })` |
| 126 | 3734 | `function ParticipantMaterialPreviewCard({ roleTitle, item, visible, disabledHint })` |
| 127 | 3791 | `function createQuizOption(seed = '')` |
| 128 | 3795 | `function createQuizQuestion(type = 'single')` |
| 129 | 3810 | `function createDefaultLessonQuiz()` |
| 130 | 3818 | `function normalizeLessonQuiz(raw)` |
| 131 | 3853 | `function validateLessonQuiz(quiz)` |
| 132 | 3869 | `function LessonQuizBuilder({ value, onChange, validation = {} })` |
| 133 | 3873 | `const setQuiz = (updater) =>` |
| 134 | 3877 | `const updateQuestion = (qid, updater) =>` |
| 135 | 3883 | `const moveQuestion = (qid, dir) =>` |
| 136 | 3894 | `const duplicateQuestion = (qid) =>` |
| 137 | 3910 | `const removeQuestion = (qid) =>` |
| 138 | 4020 | `function createDefaultLessonHomework()` |
| 139 | 4044 | `function normalizeLessonHomework(raw)` |
| 140 | 4082 | `function validateLessonHomework(hw, opts = {})` |
| 141 | 4104 | `function LessonHomeworkBuilder({ value, onChange, validation = {} })` |
| 142 | 4107 | `const setHw = (updater) =>` |
| 143 | 4111 | `const updateList = (key, idx, val) =>` |
| 144 | 4114 | `const moveListItem = (key, idx, dir) =>` |
| 145 | 4204 | `function AdminContentItemScreen({     contentId,     navigate,     cmsItems,     setCmsItems,     cmsPlacements,     setCmsPlacements,     forceRefresh, })` |
| 146 | 4246 | `const beginEdit = () =>` |
| 147 | 4276 | `const cancelEdit = () =>` |
| 148 | 4281 | `const applyPatchToState = (patch) =>` |
| 149 | 4286 | `const saveFieldUpdatesFromForm = async () =>` |
| 150 | 4291 | `const videoSummaryMode = (editForm.targetSection === 'lessons' && editForm.lessonKind === 'text_video') =>` |
| 151 | 4342 | `const commitPublish = async () =>` |
| 152 | 4377 | `const handleSaveDraft = async () =>` |
| 153 | 4382 | `const handleUnpublish = async () =>` |
| 154 | 4398 | `const handleArchive = async () =>` |
| 155 | 4415 | `const handleAssignPlacement = async () =>` |
| 156 | 4438 | `const startPlacementEdit = (p) =>` |
| 157 | 4453 | `const cancelPlacementEdit = () =>` |
| 158 | 4458 | `const savePlacementEdit = async () =>` |
| 159 | 4484 | `const deletePlacementRow = async (pid) =>` |
| 160 | 4534 | `const openPublishedCardPreview = () =>` |
| 161 | 4874 | `function ContentNavigator({ items, placements, onOpen })` |
| 162 | 4980 | `function AdminContentCenter({ cmsItems, setCmsItems, cmsPlacements, setCmsPlacements, navigate })` |
| 163 | 5088 | `const handleCreate = async () =>` |
| 164 | 5192 | `const handleCoverUpload = async (e) =>` |
| 165 | 5212 | `const handleImportContentDocument = async (e) =>` |
| 166 | 5240 | `const handleDeleteItem = async (i) =>` |
| 167 | 5254 | `const handleDropReorder = (targetId) =>` |
| 168 | 5302 | `const canPublishItem = (row) =>` |
| 169 | 5856 | `function AdminStudents({ navigate, route, refreshKey = 0 })` |
| 170 | 5887 | `const assignStudentMentor = async (studentId, mentorUserId) =>` |
| 171 | 6042 | `function buildAdminMentorWorkloadRows()` |
| 172 | 6075 | `function AdminMentors()` |
| 173 | 6098 | `const handleAddMentee = async (mentorUserId) =>` |
| 174 | 6113 | `const handleRemoveMentee = async (mentorUserId, studentUserId) =>` |
| 175 | 6242 | `function AdminCohorts()` |
| 176 | 6274 | `function AdminReview({ navigate })` |
| 177 | 6307 | `function AdminCertification()` |
| 178 | 6341 | `function AdminSettings()` |
| 179 | 6375 | `function AdminLegacyRedirect({ navigate, target })` |
| 180 | 6386 | `function AdminPage({     route,     navigate,     cmsItems,     setCmsItems,     cmsPlacements,     setCmsPlacements,     refreshKey,     forceRefresh, })` |
| 181 | 6441 | `const wrapNav = (next) =>` |
| 182 | 6527 | `function DebugPanel({ role, setRole, setActingUserId, actingUserId, setNowDate, nowDate, forceRefresh, navigate })` |
| 183 | 6529 | `const goHomeForRole = (r) =>` |
| 184 | 6621 | `function CheckMark({ ok })` |
| 185 | 6625 | `function QaScreen({ navigate, role, setRole, setActingUserId, forceRefresh })` |
| 186 | 6664 | `const runScenario = (id) =>` |
| 187 | 6817 | `function NotificationCenter({ userId })` |
| 188 | 6879 | `export default function PvlPrototypeApp({     embeddedInGarden = false,     gardenResolvedRole = null,     gardenBridgeRef,     onGardenRouteChange,     onGardenExit,     onEmbeddedDemoRoleChange,     hideEmbeddedRoleSwitch = false, } = {})` |
| 189 | 6916 | `const forceRefresh = () =>` |

## `views/PvlStudentCabinetView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 120 | `export function statusBadge(status)` |
| 2 | 134 | `export function progressWidget(label, done, total)` |
| 3 | 147 | `function renderAboutPage()` |
| 4 | 203 | `function renderGlossaryPage()` |
| 5 | 219 | `export function renderLibraryPage(items = libraryItems, filter = 'all')` |
| 6 | 254 | `export function renderLessonsPage()` |
| 7 | 274 | `function renderMentorPracticesPage()` |
| 8 | 291 | `function renderChecklistPage()` |
| 9 | 305 | `export function renderResultsPage(items = resultItems, statusFilter = 'all', onOpenTask = null)` |
| 10 | 350 | `export function renderCertificationPage()` |
| 11 | 451 | `function renderLeagueCodePage()` |
| 12 | 464 | `export function renderStudentDashboard(onNavigate, profile = studentProfile, stats = dashboardStats, dashboardItems = studentDashboard)` |
| 13 | 520 | `export function renderMenu(active, onSelect)` |
| 14 | 538 | `const readUiState = () =>` |
| 15 | 551 | `const saveUiState = (state) =>` |
| 16 | 553 | `export default function PvlStudentCabinetView({ user })` |
| 17 | 572 | `const loadApiState = async () =>` |
| 18 | 601 | `const currentWeek = (() => {                     const start = new Date('2026-04-15');                     const now = new Date();                     const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));                     if (diffDays < 0) return 0;                     return Math.max(0, Math.min(12, Math.floor(diffDays / 7)));                 }) =>` |

## `views/PvlStudentTrackerView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 5 | `export function platformStepsStorageKey(studentId)` |
| 2 | 19 | `function moduleNumClass(cls)` |
| 3 | 26 | `function tagPillClass(tag)` |
| 4 | 36 | `function trackerStepKey(moduleId, item, index)` |
| 5 | 47 | `function computePlatformStepStats(checked)` |
| 6 | 74 | `export function computePvlTrackerDashboardStats(checked)` |
| 7 | 116 | `export function usePlatformStepChecklist(studentId)` |
| 8 | 167 | `export function PlatformCourseModulesGrid({     studentId,     modules: modulesProp = null,     variant = 'tracker',     checkedOverride = null,     onToggleItem = null,     onOpenItem = null,     interactionMode = 'toggle',     /** Показать один модуль (шаги уроков/тестов) — после выбора карточки на корне трекера */     onlyModuleId = null,     navigate = null,     routePrefix = '/student', })` |
| 9 | 183 | `const tagLabelFor = (tag) =>` |
| 10 | 187 | `const getHomeworkStatus = (item) =>` |
| 11 | 328 | `export function StudentCourseTracker({     studentId,     modules: modulesProp = null,     routePrefix = '/student',     navigate = null, })` |
| 12 | 594 | `export function StudentWeeklyChecklistStub({ navigate })` |

## `views/PvlSzAssessmentFlow.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 9 | `function loadDraft(studentId)` |
| 2 | 19 | `function saveDraft(studentId, data)` |
| 3 | 27 | `function emptyReflections()` |
| 4 | 31 | `function emptyScores()` |
| 5 | 35 | `function emptyCritical()` |
| 6 | 39 | `function totalScores(arr)` |
| 7 | 43 | `function sectionSums(scores)` |
| 8 | 50 | `function levelLabel(total)` |
| 9 | 58 | `export default function PvlSzAssessmentFlow({ studentId, navigate, certPoints, onCommitted })` |
| 10 | 83 | `const setScore = (idx, val) =>` |
| 11 | 90 | `const setMentorScore = (idx, val) =>` |

## `views/PvlTaskDetailView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 2 | `function threadEventLabel(messageType)` |
| 2 | 151 | `const statusTone = (status) =>` |
| 3 | 161 | `function shortStatusLabel(status)` |
| 4 | 172 | `const Pill = ({ children, tone }) =>` |
| 5 | 178 | `function RevisionCyclesMeter({ revisionCycles = 0, maxCycles = 3 })` |
| 6 | 191 | `export function detectTooManyRevisions(nextActionsText = '')` |
| 7 | 200 | `export function changeTaskStatus(setter, toStatus, actor = 'system', comment = '')` |
| 8 | 219 | `export function addThreadMessage(setter, message)` |
| 9 | 241 | `export function uploadNewSubmissionVersion(setter, payload)` |
| 10 | 244 | `const nextVersion = (prev.submissionVersions?.length \|\| 0) =>` |
| 11 | 245 | `const nextList = (prev.submissionVersions \|\| []) =>` |
| 12 | 278 | `export function saveDraftSubmission(setDraft, text)` |
| 13 | 283 | `export function submitForReview(setter)` |
| 14 | 287 | `function buildTaskHeaderDateParts(data)` |
| 15 | 309 | `export function TaskHeader({ data, onBack, backLabel = '← Назад в «Результаты»', showBackButton = true })` |
| 16 | 349 | `export function MentorTaskHeaderCompact({ data, onBack, backLabel, showBackButton = true })` |
| 17 | 372 | `export function TaskMeta({ data })` |
| 18 | 383 | `function TaskRevisionSummary({ revisionCyclesFromHistory, storedRevisionCycles })` |
| 19 | 404 | `export function TaskDescription({ data, showControlPointNote = false })` |
| 20 | 430 | `export function SubmissionVersionCard({ version })` |
| 21 | 445 | `export function renderSubmissionVersions(versions)` |
| 22 | 449 | `export function SubmissionHistory({     versions,     role,     onUploadVersion,     onSaveDraft,     onSubmit,     draftText,     setDraftText,     canEditStudentSubmission = true, })` |
| 23 | 506 | `export function renderStatusTimeline(history)` |
| 24 | 519 | `export function StatusTimeline({ history })` |
| 25 | 528 | `export function renderCommentsThread(messages)` |
| 26 | 530 | `const visibleMessages = (messages \|\| []) =>` |
| 27 | 548 | `export function CommentsThread({     messages,     onSend,     role,     disputeOpen,     threadLocked,     onOpenDispute, })` |
| 28 | 618 | `export function renderMentorResponseForm(form, setForm, onSave)` |
| 29 | 647 | `export function MentorResponseForm({ role, form, setForm, onSave })` |
| 30 | 652 | `export function ControlPointMeta({ taskData })` |
| 31 | 668 | `export function RelatedLinks()` |
| 32 | 683 | `export function MentorStudentAnswerCompact({ versions = [] })` |
| 33 | 701 | `function MentorTaskSlim({     state,     onBack,     backLabel,     navigate,     onMentorReview,     onRefresh,     mentorRoutePrefix = '/mentor',     showHeaderBack = true, })` |
| 34 | 717 | `const sendRevision = () =>` |
| 35 | 733 | `const sendAccept = () =>` |
| 36 | 755 | `const openLesson = () =>` |
| 37 | 827 | `export function renderTaskDetail({     role = 'student',     state,     onBack,     onChangeStatus,     onSendThreadMessage,     onUploadVersion,     onSaveDraft,     onSubmitForReview,     draftText,     setDraftText,     mentorForm,     setMentorForm,     onSaveMentorForm,     backLabel,     showHeaderBack = true,     threadLocked,     disputeOpen,     onOpenDispute,     canEditStudentSubmission, })` |
| 38 | 875 | `export default function PvlTaskDetailView({     role = 'student',     onBack,     initialData = null,     onStudentSaveDraft,     onStudentSubmit,     onStudentReply,     onMentorReply,     onMentorReview,     taskStudentId,     taskId,     mentorActorId,     onRefresh,     navigate,     mentorRoutePrefix = '/mentor',     showHeaderBack = true,     backLabelOverride, })` |
| 39 | 903 | `const threadLocked = (state.taskDetail.isAcceptedWork \|\| state.taskDetail.status === 'принято') =>` |
| 40 | 911 | `const handleOpenDispute = () =>` |
| 41 | 920 | `const handleSendThreadMessage = (message) =>` |
| 42 | 937 | `const handleUploadVersion = (payload) =>` |
| 43 | 941 | `const handleSaveMentorForm = () =>` |

## `views/StatsDashboardView.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 6 | `const StatsDashboardView = ({ user, meetings = [], knowledgeBase = [], clients = [], practices = [], scenarios = [], goals = [], onNavigate, onOpenLeaderPage, newsItems = [] }) =>` |
| 2 | 8 | `const decodeEntities = (value) =>` |
| 3 | 19 | `const formatNewsBody = (value) =>` |
| 4 | 53 | `const getTreeStage = (s) =>` |
| 5 | 69 | `const AiryCard = ({ icon: Icon, label, value, onClick, delay = 0 }) =>` |

## `views/SubscriptionExpiredScreen.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 2 | `const SubscriptionExpiredScreen = ({ renewUrl, onRetry, message }) =>` |

## `views/UserApp.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 28 | `const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) =>` |
| 2 | 48 | `const UserApp = ({ user, users, knowledgeBase, news, librarySettings, onLogout, onNotify, onSwitchToAdmin, onUpdateUser, onSendRay, onMarkAsRead }) =>` |
| 3 | 68 | `const normalizedRole = (user?.role \|\| '') =>` |
| 4 | 115 | `const manualNews = (news \|\| []) =>` |
| 5 | 145 | `const loadData = async () =>` |
| 6 | 214 | `const handleViewChange = (newView, tab = null) =>` |
| 7 | 268 | `const handleOpenLeader = (leader) =>` |
| 8 | 292 | `const handleUpdateProfile = async (updated) =>` |
| 9 | 306 | `const handleAddMeeting = async (meetingData) =>` |
| 10 | 337 | `const handleUpdateMeeting = async (updatedMeeting) =>` |
| 11 | 344 | `const nextPayload = (!wasCompleted && willBeCompleted && !alreadyAwarded) =>` |
| 12 | 380 | `const handleDeleteMeeting = async (meetingId) =>` |
| 13 | 391 | `const handleAddPractice = async (practice, options = {}) =>` |
| 14 | 416 | `const handleUpdatePractice = async (updatedPractice) =>` |
| 15 | 427 | `const handleDeletePractice = async (practiceId) =>` |
| 16 | 448 | `const handleCloseNotification = () =>` |
| 17 | 455 | `const handleScenarioAdded = (isPublic) =>` |
| 18 | 461 | `const handleLessonCompleted = (material, course) =>` |
| 19 | 468 | `const handleLeagueScenarioCompleted = (scenario) =>` |
| 20 | 474 | `const handleUpdateClient = async (updatedClient) =>` |
| 21 | 499 | `const handleAddClient = async (client) =>` |
| 22 | 515 | `const handleDeleteClient = async (clientId) =>` |
| 23 | 526 | `const handleAddGoal = async (goal) =>` |
| 24 | 543 | `const handleUpdateGoal = async (updatedGoal) =>` |
| 25 | 564 | `const handleDeleteGoal = async (goalId) =>` |
| 26 | 575 | `const handleEnablePushNotifications = async () =>` |

## `views/pvlLibraryMaterialShared.jsx`

| # | Строка | Сигнатура |
|---|--------|-----------|
| 1 | 3 | `export function stripMaterialNumbering(title)` |
| 2 | 8 | `function escapeHtml(source = '')` |
| 3 | 19 | `export function isVideoLessonLayout(item)` |
| 4 | 23 | `function sanitizeLessonVideoEmbedHtml(snippet = '')` |
| 5 | 32 | `export function buildLessonVideoPlayerHtml(item)` |
| 6 | 58 | `export function normalizeMaterialHtml(source = '')` |
| 7 | 78 | `export function scorePvlQuizAttempt(rawQuiz, selections)` |
| 8 | 106 | `export function LibraryQuizRunner({ quiz: rawQuiz, onPassed })` |
| 9 | 129 | `const handleSubmit = () =>` |
| 10 | 145 | `const handleRetry = () =>` |
| 11 | 274 | `export function PvlLibraryMaterialBody({ selectedItem, lessonVideoPlayerHtml, onQuizPassed, variant = 'library', studentId = null, navigate = null, routePrefix = '/student' })` |
| 12 | 373 | `function HomeworkInlineForm({ selectedItem, studentId, navigate, routePrefix = '/student' })` |
| 13 | 405 | `const handleSaveDraft = () =>` |
| 14 | 411 | `const handleSubmit = () =>` |
| 15 | 417 | `const handleOpenFull = () =>` |
