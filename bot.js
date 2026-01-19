require("dotenv").config({ override: true });
const TelegramBot = require("node-telegram-bot-api");
const http = require("http");

// ============================================
// HEALTH CHECK SERVER (for Koyeb/Render)
// ============================================
const PORT = process.env.PORT || 8000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
}).listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

// ============================================
// CONFIG
// ============================================
const token = process.env.TELEGRAM_BOT_TOKEN;
const UPSTASH_REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const UPSTASH_REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;

// Validate required config
if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN is required! Add it to your .env file.");
  process.exit(1);
}
if (!UPSTASH_REDIS_URL) {
  console.error(
    "❌ UPSTASH_REDIS_REST_URL is required! Add it to your .env file.",
  );
  process.exit(1);
}
if (!UPSTASH_REDIS_TOKEN) {
  console.error(
    "❌ UPSTASH_REDIS_REST_TOKEN is required! Add it to your .env file.",
  );
  process.exit(1);
}

// ============================================
// UPSTASH REDIS STORAGE
// ============================================
async function redisGet(key) {
  try {
    const url = `${UPSTASH_REDIS_URL}/get/${key}`;
    console.log(`📡 GET ${url} ...`);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_TOKEN}` },
    });

    if (!res.ok) {
      console.error(`❌ Redis GET failed: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(`Error details: ${text}`);
      return null;
    }

    const json = await res.json();
    console.log(`✅ Redis GET success. Result type: ${typeof json.result}`);
    return json.result ? JSON.parse(json.result) : null;
  } catch (err) {
    console.error("Redis GET error:", err.message);
    return null;
  }
}

async function redisSet(key, value) {
  try {
    const url = `${UPSTASH_REDIS_URL}/set/${key}`;
    console.log(`📡 SET ${url} ...`); // Log URL to check for double slashes

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_TOKEN}` },
      body: JSON.stringify(value),
    });

    if (!res.ok) {
      console.error(`❌ Redis SET failed: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(`Error details: ${text}`);
    } else {
      const json = await res.json();
      console.log("✅ Redis SET success:", json);
    }
  } catch (err) {
    console.error("Redis SET error:", err.message);
  }
}

// ============================================
// DATA MANAGEMENT
// ============================================
let data = { reminders: [], todos: {}, stats: {}, settings: {} };

async function loadData() {
  const stored = await redisGet("reminder_bot_data");
  if (stored) {
    data = stored;
    console.log(
      `📦 Loaded ${data.reminders ? data.reminders.length : 0} reminders from Redis`,
    );
  } else {
    console.log("🆕 No data found in Redis, starting fresh.");
  }

  if (!data.stats) data.stats = {};
  if (!data.settings) data.settings = {};
  if (!data.reminders) data.reminders = [];
  if (!data.todos) data.todos = {};
}

async function saveData() {
  await redisSet("reminder_bot_data", data);
}

function getUserStats(chatId) {
  if (!data.stats[chatId]) {
    data.stats[chatId] = {
      completed: 0,
      streak: 0,
      lastActive: null,
      totalReminders: 0,
    };
  }
  return data.stats[chatId];
}

function getUserSettings(chatId) {
  if (!data.settings) data.settings = {};
  if (!data.settings[chatId]) {
    data.settings[chatId] = {
      timezone: 0, // UTC offset in hours
      timeFormat: "12h", // 12h or 24h
      defaultPriority: "medium",
      soundEnabled: true,
      quickReminderMins: 15, // default quick reminder duration
    };
  }
  return data.settings[chatId];
}

// Timezone presets (sorted by offset)
const TIMEZONES = [
  { name: "🇺🇸 US Pacific (LA)", offset: -8 },
  { name: "🇺🇸 US Mountain", offset: -7 },
  { name: "🇺🇸 US Central", offset: -6 },
  { name: "🇺🇸 US Eastern (NY)", offset: -5 },
  { name: "🇬🇧 UK (London)", offset: 0 },
  { name: "🇪🇺 Europe Central", offset: 1 },
  { name: "🇪🇺 Europe Eastern", offset: 2 },
  { name: "🇦🇪 Dubai (GST)", offset: 4 },
  { name: "🇮🇳 India (IST)", offset: 5.5 },
  { name: "🇳🇵 Nepal (NPT)", offset: 5.75 },
  { name: "🇧🇩 Bangladesh (BST)", offset: 6 },
  { name: "🇹🇭 Thailand (ICT)", offset: 7 },
  { name: "🇸🇬 Singapore", offset: 8 },
  { name: "🇯🇵 Japan/Korea", offset: 9 },
  { name: "🇦🇺 Australia East", offset: 10 },
  { name: "🇳🇿 New Zealand", offset: 12 },
];

// ============================================
// TIMEZONE HELPERS
// ============================================
// Convert user's local time to UTC timestamp
function userTimeToUtc(userDate, chatId) {
  const settings = getUserSettings(chatId);
  const offsetMs = settings.timezone * 3600000;
  // User selected time in their timezone, convert to UTC
  return userDate.getTime() - offsetMs + userDate.getTimezoneOffset() * 60000;
}

// Convert UTC timestamp to user's local Date object
function utcToUserTime(utcTs, chatId) {
  const settings = getUserSettings(chatId);
  const offsetMs = settings.timezone * 3600000;
  const serverOffsetMs = new Date().getTimezoneOffset() * 60000;
  return new Date(utcTs + offsetMs + serverOffsetMs);
}

// Get current time in user's timezone
function getUserNow(chatId) {
  return utcToUserTime(Date.now(), chatId);
}

// ============================================
// TELEGRAM BOT
// ============================================
const bot = new TelegramBot(token, { polling: true });
bot.on("polling_error", (error) =>
  console.error("Polling error:", error.code, error.message),
);

// Pending user states
global.userStates = {};

// ============================================
// SAFE EDIT MESSAGE (prevents crash on duplicate edits)
// ============================================
async function safeEditMessage(chatId, messageId, text, options = {}) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options,
    });
  } catch (err) {
    // Ignore "message is not modified" errors (Telegram error code 400)
    const errMsg = err.message || err.description || String(err);
    if (!errMsg.includes("message is not modified") && !errMsg.includes("Bad Request")) {
      console.error("Edit message error:", errMsg);
    }
  }
}

// ============================================
// EMOJI & VISUAL CONSTANTS
// ============================================
const PRIORITY_EMOJI = { low: "🟢", medium: "🟡", high: "🔴", urgent: "🚨" };

const RECURRING_EMOJI = {
  daily: "📅",
  weekly: "📆",
  weekdays: "💼",
  weekends: "🎉",
};

const RECURRING_LABEL = {
  daily: "Every day",
  weekly: "Every week",
  weekdays: "Mon-Fri",
  weekends: "Sat-Sun",
};

const CATEGORY_EMOJI = {
  work: "💼",
  personal: "👤",
  health: "💪",
  shopping: "🛒",
  finance: "💰",
  learning: "📚",
  social: "👥",
  other: "📌",
};
const TIME_EMOJI = {
  morning: "🌅",
  afternoon: "☀️",
  evening: "🌆",
  night: "🌙",
};

// ============================================
// HTML ESCAPE HELPER
// ============================================
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================
// USER STATE CLEANUP (prevent memory leak)
// ============================================
function cleanupUserState(chatId) {
  delete userStates[chatId];
}

// Auto-cleanup stale user states every 30 minutes
setInterval(
  () => {
    const now = Date.now();
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    for (const chatId in userStates) {
      const state = userStates[chatId];
      if (state.createdAt && now - state.createdAt > STALE_THRESHOLD) {
        delete userStates[chatId];
      }
    }
  },
  30 * 60 * 1000,
);

// ============================================
// UX HELPERS
// ============================================
async function answerToast(queryId, text, showAlert = false) {
  try {
    await bot.answerCallbackQuery(queryId, { text, show_alert: showAlert });
  } catch (err) {
    // Ignore if query expired
  }
}

// ============================================
// BEAUTIFUL MAIN MENU
// ============================================
bot.onText(/\/start/, (msg) =>
  sendMainMenu(msg.chat.id, null, msg.from.first_name),
);

async function sendMainMenu(chatId, messageId = null, firstName = "Friend") {
  const stats = getUserStats(chatId);
  const todos = data.todos[chatId] || [];
  const pendingTasks = todos.filter((t) => !t.done).length;
  const completedTasks = todos.filter((t) => t.done).length;
  const activeReminders = data.reminders.filter(
    (r) => r.chatId === chatId,
  ).length;

  const text = `
🎯 <b>REMINDER BOT</b>
━━━━━━━━━━━━━━━━━
👋 <b>Hi, ${firstName}!</b>

📊 <b>Your Dashboard</b>
├ 🔔 Active Reminders: <b>${activeReminders}</b>
├ 📋 Pending Tasks: <b>${pendingTasks}</b>
├ ✅ Completed: <b>${completedTasks}</b>
└ 🔥 Streak: <b>${stats.streak} days</b>

<i>What would you like to do?</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "⏰ Set Reminder", callback_data: "rm_start" },
        { text: "📋 Tasks", callback_data: "todo_menu" },
      ],
      [
        { text: "🔄 Recurring", callback_data: "rec_menu" },
        { text: "📜 My Reminders", callback_data: "rm_list" },
      ],
      [
        { text: "📊 Statistics", callback_data: "stats_menu" },
        { text: "⚙️ Settings", callback_data: "settings_menu" },
      ],
      [{ text: "❓ Help & Tips", callback_data: "help_menu" }],
    ],
  };

  if (messageId) {
    await bot
      .editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: keyboard,
      })
      .catch(() => {});
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
}

// ============================================
// REMINDER FLOW - STEP BY STEP
// ============================================
async function startReminderFlow(chatId, messageId) {
  userStates[chatId] = {
    flow: "reminder",
    step: "when",
    createdAt: Date.now(),
  };

  const text = `
⏰ <b>CREATE REMINDER</b>
━━━━━━━━━━━━━━━━━

<b>Step 1/4:</b> When do you need this reminder?

Choose a quick option or set custom time:`;

  const now = new Date();
  const keyboard = {
    inline_keyboard: [
      [{ text: "━━━ ⚡ QUICK OPTIONS ━━━", callback_data: "ignore" }],
      [
        { text: "🕐 5 min", callback_data: "rm_quick_5m" },
        { text: "🕐 15 min", callback_data: "rm_quick_15m" },
        { text: "🕐 30 min", callback_data: "rm_quick_30m" },
      ],
      [
        { text: "🕐 1 hour", callback_data: "rm_quick_1h" },
        { text: "🕑 2 hours", callback_data: "rm_quick_2h" },
        { text: "🕓 4 hours", callback_data: "rm_quick_4h" },
      ],
      [{ text: "📅 Tomorrow at This Time", callback_data: "rm_quick_1d" }],
      [{ text: "━━━ 🎯 PRECISE TIME ━━━", callback_data: "ignore" }],
      [
        { text: "🕐 Pick Exact Time", callback_data: "rm_picktime" },
        { text: "📅 Pick Date & Time", callback_data: "rm_pickdate" },
      ],
      [{ text: "❌ Cancel", callback_data: "main_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// TIME PICKER - BEAUTIFUL AM/PM INTERFACE
// ============================================
async function showTimePicker(chatId, messageId, selectedDate = null) {
  const currentState = userStates[chatId] || {};
  userStates[chatId] = {
    ...currentState,
    flow: currentState.flow === "recurring" ? "recurring" : "reminder",
    step: "pick_hour",
    selectedDate,
  };

  const dateStr = selectedDate ? formatDateShort(selectedDate) : "Today";

  const text = `
🕐 <b>SELECT TIME</b>
━━━━━━━━━━━━━━━━━

📅 Date: <b>${dateStr}</b>

<b>Step 2/4:</b> Select the hour:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "━━━ 🌅 MORNING ━━━", callback_data: "ignore" }],
      [
        { text: "6 AM", callback_data: "rm_hour_6_am" },
        { text: "7 AM", callback_data: "rm_hour_7_am" },
        { text: "8 AM", callback_data: "rm_hour_8_am" },
        { text: "9 AM", callback_data: "rm_hour_9_am" },
      ],
      [
        { text: "10 AM", callback_data: "rm_hour_10_am" },
        { text: "11 AM", callback_data: "rm_hour_11_am" },
        { text: "12 PM", callback_data: "rm_hour_12_pm" },
      ],
      [{ text: "━━━ ☀️ AFTERNOON ━━━", callback_data: "ignore" }],
      [
        { text: "1 PM", callback_data: "rm_hour_1_pm" },
        { text: "2 PM", callback_data: "rm_hour_2_pm" },
        { text: "3 PM", callback_data: "rm_hour_3_pm" },
        { text: "4 PM", callback_data: "rm_hour_4_pm" },
      ],
      [
        { text: "5 PM", callback_data: "rm_hour_5_pm" },
        { text: "6 PM", callback_data: "rm_hour_6_pm" },
        { text: "7 PM", callback_data: "rm_hour_7_pm" },
      ],
      [{ text: "━━━ 🌙 EVENING/NIGHT ━━━", callback_data: "ignore" }],
      [
        { text: "8 PM", callback_data: "rm_hour_8_pm" },
        { text: "9 PM", callback_data: "rm_hour_9_pm" },
        { text: "10 PM", callback_data: "rm_hour_10_pm" },
        { text: "11 PM", callback_data: "rm_hour_11_pm" },
      ],
      [
        { text: "« Back", callback_data: "rm_start" },
        { text: "❌ Cancel", callback_data: "main_menu" },
      ],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// MINUTE PICKER
// ============================================
async function showMinutePicker(chatId, messageId, hour, ampm) {
  const state = userStates[chatId] || {};
  const hour24 =
    ampm === "pm" && hour !== 12
      ? hour + 12
      : ampm === "am" && hour === 12
        ? 0
        : hour;
  userStates[chatId] = { ...state, step: "pick_minute", hour: hour24 };

  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayAmPm = hour24 >= 12 ? "PM" : "AM";

  const text = `
🕐 <b>SELECT MINUTES</b>
━━━━━━━━━━━━━━━━━

🕐 Selected: <b>${displayHour}:__ ${displayAmPm}</b>

<b>Step 3/4:</b> Select the minutes:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: ":00", callback_data: "rm_min_0" },
        { text: ":05", callback_data: "rm_min_5" },
        { text: ":10", callback_data: "rm_min_10" },
        { text: ":15", callback_data: "rm_min_15" },
      ],
      [
        { text: ":20", callback_data: "rm_min_20" },
        { text: ":25", callback_data: "rm_min_25" },
        { text: ":30", callback_data: "rm_min_30" },
        { text: ":35", callback_data: "rm_min_35" },
      ],
      [
        { text: ":40", callback_data: "rm_min_40" },
        { text: ":45", callback_data: "rm_min_45" },
        { text: ":50", callback_data: "rm_min_50" },
        { text: ":55", callback_data: "rm_min_55" },
      ],
      [{ text: "⌨️ Type exact minute (0-59)", callback_data: "rm_min_custom" }],
      [
        { text: "« Back", callback_data: "rm_picktime" },
        { text: "❌ Cancel", callback_data: "main_menu" },
      ],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// CUSTOM MINUTE INPUT
// ============================================
async function askCustomMinute(chatId, messageId) {
  const state = userStates[chatId] || {};
  userStates[chatId] = { ...state, step: "input_minute", messageId };

  const displayHour =
    state.hour === 0 ? 12 : state.hour > 12 ? state.hour - 12 : state.hour;
  const displayAmPm = state.hour >= 12 ? "PM" : "AM";

  const text = `
⌨️ <b>ENTER MINUTE</b>
━━━━━━━━━━━━━━━━━

🕐 Selected: <b>${displayHour}:__ ${displayAmPm}</b>

<b>Type the minute (0-59):</b>

<i>Examples: 0, 7, 13, 42, 59</i>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "« Back to presets", callback_data: "rm_picktime_back" }],
      [{ text: "❌ Cancel", callback_data: "main_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// DATE PICKER - CALENDAR VIEW
// ============================================

// Helper to format date as YYYY-MM-DD in local timezone
function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function showDatePicker(chatId, messageId, monthOffset = 0) {
  const currentState = userStates[chatId] || {};
  userStates[chatId] = {
    ...currentState,
    flow: currentState.flow === "recurring" ? "recurring" : "reminder",
    step: "pick_date",
    monthOffset,
  };

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthName = viewDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const text = `
📅 <b>SELECT DATE</b>
━━━━━━━━━━━━━━━━━

<b>${monthName}</b>`;

  const keyboard = { inline_keyboard: [] };

  // Day headers
  keyboard.inline_keyboard.push([
    { text: "Mo", callback_data: "ignore" },
    { text: "Tu", callback_data: "ignore" },
    { text: "We", callback_data: "ignore" },
    { text: "Th", callback_data: "ignore" },
    { text: "Fr", callback_data: "ignore" },
    { text: "Sa", callback_data: "ignore" },
    { text: "Su", callback_data: "ignore" },
  ]);

  // Calendar days
  const firstDay = (viewDate.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(
    viewDate.getFullYear(),
    viewDate.getMonth() + 1,
    0,
  ).getDate();

  let row = [];
  for (let i = 0; i < firstDay; i++)
    row.push({ text: " ", callback_data: "ignore" });

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const isPast =
      date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isToday = date.toDateString() === now.toDateString();

    const dayText = isToday ? `[${day}]` : isPast ? `·` : `${day}`;
    const callback = isPast ? "ignore" : `rm_date_${formatLocalDate(date)}`;

    row.push({ text: dayText, callback_data: callback });

    if (row.length === 7) {
      keyboard.inline_keyboard.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    while (row.length < 7) row.push({ text: " ", callback_data: "ignore" });
    keyboard.inline_keyboard.push(row);
  }

  // Navigation
  keyboard.inline_keyboard.push([
    { text: "« Prev Month", callback_data: `rm_month_${monthOffset - 1}` },
    { text: "Next Month »", callback_data: `rm_month_${monthOffset + 1}` },
  ]);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  keyboard.inline_keyboard.push([
    {
      text: "📅 Today",
      callback_data: `rm_date_${formatLocalDate(now)}`,
    },
    {
      text: "📅 Tomorrow",
      callback_data: `rm_date_${formatLocalDate(tomorrow)}`,
    },
  ]);
  keyboard.inline_keyboard.push([
    { text: "« Back", callback_data: "rm_start" },
    { text: "❌ Cancel", callback_data: "main_menu" },
  ]);

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// PRIORITY PICKER
// ============================================
async function showPriorityPicker(chatId, messageId) {
  const state = userStates[chatId] || {};
  userStates[chatId] = { ...state, step: "pick_priority" };

  const timeStr = formatDateTime(state.time);

  const text = `
🎯 <b>SET PRIORITY</b>
━━━━━━━━━━━━━━━━━

⏰ Time: <b>${timeStr}</b>

<b>Step 4/4:</b> Select priority level:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🟢 Low - No rush", callback_data: "rm_priority_low" }],
      [{ text: "🟡 Medium - Important", callback_data: "rm_priority_medium" }],
      [{ text: "🔴 High - Must do!", callback_data: "rm_priority_high" }],
      [{ text: "🚨 Urgent - Critical!", callback_data: "rm_priority_urgent" }],
      [{ text: "⏭️ Skip (Normal)", callback_data: "rm_priority_medium" }],
      [{ text: "« Back", callback_data: "rm_picktime" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// MESSAGE INPUT - ASK FOR REMINDER TEXT
// ============================================
async function askReminderText(chatId, messageId, priority) {
  const state = userStates[chatId] || {};
  userStates[chatId] = { ...state, step: "input_text", priority, messageId };

  const timeStr = formatDateTime(state.time);
  const priorityEmoji = PRIORITY_EMOJI[priority] || "🟡";

  const text = `
✏️ <b>ENTER REMINDER TEXT</b>
━━━━━━━━━━━━━━━━━

⏰ Time: <b>${timeStr}</b>
${priorityEmoji} Priority: <b>${priority}</b>

<b>Now type your reminder message:</b>

<i>Example: "Call mom", "Meeting with John", "Take medicine"</i>`;

  const keyboard = {
    inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// RECURRING REMINDER TEXT INPUT
// ============================================
async function askRecurringText(chatId, messageId) {
  const state = userStates[chatId] || {};
  userStates[chatId] = { ...state, step: "input_text", messageId };

  const recurringLabel =
    {
      daily: "📅 Every day",
      weekly: `📆 Every week`,
      weekdays: "💼 Every weekday (Mon-Fri)",
      weekends: "🎉 Every weekend (Sat-Sun)",
    }[state.recurring] || "🔄 Recurring";

  const hour = state.hour || 9;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayAmPm = hour >= 12 ? "PM" : "AM";
  const minute = state.minute || 0;

  const text = `
✏️ <b>ENTER REMINDER TEXT</b>
━━━━━━━━━━━━━━━━━

🔄 Type: <b>${recurringLabel}</b>
⏰ Time: <b>${displayHour}:${String(minute).padStart(2, "0")} ${displayAmPm}</b>

<b>Now type your reminder message:</b>

<i>Example: "Morning standup", "Weekly review", "Take vitamins"</i>`;

  const keyboard = {
    inline_keyboard: [[{ text: "❌ Cancel", callback_data: "rec_menu" }]],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// TODO MENU - BEAUTIFUL TASK LIST
// ============================================
async function showTodoMenu(chatId, messageId) {
  const todos = data.todos[chatId] || [];
  const pending = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);

  let text = `
📋 <b>MY TASKS</b>
━━━━━━━━━━━━━━━━━

`;

  if (todos.length === 0) {
    text += `<i>No tasks yet! Add your first task.</i>\n`;
  } else {
    if (pending.length > 0) {
      text += `<b>📌 Pending (${pending.length})</b>\n`;
      pending.slice(0, 8).forEach((t, i) => {
        const priority = PRIORITY_EMOJI[t.priority] || "⬜";
        const category = CATEGORY_EMOJI[t.category] || "";
        text += `${priority} ${i + 1}. ${t.text} ${category}\n`;
      });
      if (pending.length > 8)
        text += `<i>   ...and ${pending.length - 8} more</i>\n`;
      text += `\n`;
    }

    if (completed.length > 0) {
      text += `<b>✅ Completed (${completed.length})</b>\n`;
      completed.slice(0, 3).forEach((t, i) => {
        text += `<s>${t.text}</s>\n`;
      });
      if (completed.length > 3)
        text += `<i>   ...and ${completed.length - 3} more</i>\n`;
    }
  }

  const keyboard = { inline_keyboard: [] };

  // Task action buttons
  pending.slice(0, 5).forEach((t, i) => {
    keyboard.inline_keyboard.push([
      { text: `✅`, callback_data: `todo_done_${t.id}` },
      {
        text: `${t.text.substring(0, 25)}${t.text.length > 25 ? "..." : ""}`,
        callback_data: `todo_view_${t.id}`,
      },
      { text: `🗑️`, callback_data: `todo_del_${t.id}` },
    ]);
  });

  keyboard.inline_keyboard.push([
    { text: "━━━━━━━━━━━━━━━", callback_data: "ignore" },
  ]);
  keyboard.inline_keyboard.push([
    { text: "➕ Add Task", callback_data: "todo_add" },
    { text: "📂 Categories", callback_data: "todo_categories" },
  ]);

  if (completed.length > 0) {
    keyboard.inline_keyboard.push([
      { text: "🗑️ Clear Completed", callback_data: "todo_clear" },
    ]);
  }

  keyboard.inline_keyboard.push([
    { text: "« Main Menu", callback_data: "main_menu" },
  ]);

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// TODO CATEGORIES VIEW
// ============================================
async function showTodoCategoriesMenu(chatId, messageId) {
  const todos = data.todos[chatId] || [];
  const pending = todos.filter((t) => !t.done);

  // Group by category
  const byCategory = {};
  for (const cat of Object.keys(CATEGORY_EMOJI)) {
    byCategory[cat] = pending.filter((t) => t.category === cat);
  }

  let text = `
📂 <b>TASKS BY CATEGORY</b>
━━━━━━━━━━━━━━━━━

`;

  for (const [cat, tasks] of Object.entries(byCategory)) {
    if (tasks.length > 0) {
      text += `${CATEGORY_EMOJI[cat]} <b>${cat.charAt(0).toUpperCase() + cat.slice(1)}</b> (${tasks.length})\n`;
      tasks.slice(0, 3).forEach((t) => {
        text += `   ${PRIORITY_EMOJI[t.priority]} ${t.text}\n`;
      });
      if (tasks.length > 3)
        text += `   <i>...and ${tasks.length - 3} more</i>\n`;
      text += `\n`;
    }
  }

  if (pending.length === 0) {
    text += `<i>No tasks yet!</i>`;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "➕ Add Task", callback_data: "todo_add" }],
      [{ text: "📋 List View", callback_data: "todo_menu" }],
      [{ text: "« Main Menu", callback_data: "main_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// TASK DETAIL VIEW
// ============================================
async function showTaskDetail(chatId, messageId, taskId) {
  const todos = data.todos[chatId] || [];
  const task = todos.find((t) => t.id === taskId);

  if (!task) {
    return showTodoMenu(chatId, messageId);
  }

  const createdDate = new Date(task.createdAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const text = `
📝 <b>TASK DETAILS</b>
━━━━━━━━━━━━━━━━━

${task.done ? "✅" : "⬜"} <b>${task.text}</b>

${CATEGORY_EMOJI[task.category]} Category: <b>${task.category}</b>
${PRIORITY_EMOJI[task.priority]} Priority: <b>${task.priority}</b>
📅 Created: <b>${createdDate}</b>
📊 Status: <b>${task.done ? "Completed" : "Pending"}</b>`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: task.done ? "↩️ Mark Incomplete" : "✅ Mark Complete",
          callback_data: `todo_done_${task.id}`,
        },
      ],
      [{ text: "🗑️ Delete", callback_data: `todo_del_${task.id}` }],
      [{ text: "« Back to Tasks", callback_data: "todo_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// ADD TASK FLOW
// ============================================
async function startAddTaskFlow(chatId, messageId) {
  userStates[chatId] = { flow: "todo", step: "category", messageId };

  const text = `
➕ <b>ADD NEW TASK</b>
━━━━━━━━━━━━━━━━━

<b>Step 1/3:</b> Select a category:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "💼 Work", callback_data: "todo_cat_work" },
        { text: "👤 Personal", callback_data: "todo_cat_personal" },
      ],
      [
        { text: "💪 Health", callback_data: "todo_cat_health" },
        { text: "🛒 Shopping", callback_data: "todo_cat_shopping" },
      ],
      [
        { text: "💰 Finance", callback_data: "todo_cat_finance" },
        { text: "📚 Learning", callback_data: "todo_cat_learning" },
      ],
      [
        { text: "👥 Social", callback_data: "todo_cat_social" },
        { text: "📌 Other", callback_data: "todo_cat_other" },
      ],
      [{ text: "⏭️ Skip Category", callback_data: "todo_cat_other" }],
      [{ text: "« Back", callback_data: "todo_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function askTaskPriority(chatId, messageId, category) {
  const state = userStates[chatId] || {};
  userStates[chatId] = { ...state, step: "priority", category };

  const text = `
➕ <b>ADD NEW TASK</b>
━━━━━━━━━━━━━━━━━

${CATEGORY_EMOJI[category]} Category: <b>${category}</b>

<b>Step 2/3:</b> Select priority:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🟢 Low", callback_data: "todo_pri_low" },
        { text: "🟡 Medium", callback_data: "todo_pri_medium" },
      ],
      [
        { text: "🔴 High", callback_data: "todo_pri_high" },
        { text: "🚨 Urgent", callback_data: "todo_pri_urgent" },
      ],
      [{ text: "« Back", callback_data: "todo_add" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function askTaskText(chatId, messageId, priority) {
  const state = userStates[chatId] || {};
  userStates[chatId] = { ...state, step: "input_text", priority, messageId };

  const text = `
➕ <b>ADD NEW TASK</b>
━━━━━━━━━━━━━━━━━

${CATEGORY_EMOJI[state.category]} Category: <b>${state.category}</b>
${PRIORITY_EMOJI[priority]} Priority: <b>${priority}</b>

<b>Step 3/3:</b> Type your task:

<i>Example: "Buy groceries", "Finish report"</i>`;

  const keyboard = {
    inline_keyboard: [[{ text: "❌ Cancel", callback_data: "todo_menu" }]],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// RECURRING REMINDERS MENU
// ============================================
async function showRecurringMenu(chatId, messageId) {
  const text = `
🔄 <b>RECURRING REMINDERS</b>
━━━━━━━━━━━━━━━━━

Reminders that repeat automatically!

📅 <b>Daily</b> - Every single day
💼 <b>Weekdays</b> - Mon to Fri only  
🎉 <b>Weekends</b> - Sat & Sun only
📆 <b>Weekly</b> - Same day each week`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "━━━ 📅 DAILY ━━━", callback_data: "ignore" }],
      [
        { text: "🌅 Morning 8AM", callback_data: "rec_daily_8" },
        { text: "🌙 Evening 8PM", callback_data: "rec_daily_20" },
      ],
      [{ text: "🕐 Custom Time...", callback_data: "rec_daily_custom" }],
      [{ text: "━━━ 💼 WEEKDAYS (Mon-Fri) ━━━", callback_data: "ignore" }],
      [{ text: "💼 Every Weekday", callback_data: "rec_weekdays" }],
      [{ text: "━━━ 🎉 WEEKENDS (Sat-Sun) ━━━", callback_data: "ignore" }],
      [{ text: "🎉 Every Weekend", callback_data: "rec_weekends" }],
      [{ text: "━━━ 📆 WEEKLY ━━━", callback_data: "ignore" }],
      [
        { text: "Mon", callback_data: "rec_weekly_1" },
        { text: "Tue", callback_data: "rec_weekly_2" },
        { text: "Wed", callback_data: "rec_weekly_3" },
        { text: "Thu", callback_data: "rec_weekly_4" },
      ],
      [
        { text: "Fri", callback_data: "rec_weekly_5" },
        { text: "Sat", callback_data: "rec_weekly_6" },
        { text: "Sun", callback_data: "rec_weekly_0" },
      ],
      [{ text: "« Back", callback_data: "rm_list" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// STATISTICS MENU
// ============================================
async function showStatsMenu(chatId, messageId) {
  const stats = getUserStats(chatId);
  const todos = data.todos[chatId] || [];
  const reminders = data.reminders.filter((r) => r.chatId === chatId);

  const completedTasks = todos.filter((t) => t.done).length;
  const pendingTasks = todos.filter((t) => !t.done).length;

  // Calculate completion rate
  const totalTasks = completedTasks + pendingTasks;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Progress bar
  const filled = Math.round(completionRate / 10);
  const progressBar = "█".repeat(filled) + "░".repeat(10 - filled);

  const text = `
📊 <b>YOUR STATISTICS</b>
━━━━━━━━━━━━━━━━━

🔥 <b>Streak:</b> ${stats.streak} days
✅ <b>Total Completed:</b> ${stats.completed}

<b>Current Progress</b>
[${progressBar}] ${completionRate}%
├ ✅ Completed: ${completedTasks}
└ ⏳ Pending: ${pendingTasks}

<b>Active Reminders:</b> ${reminders.length}

<b>Achievements:</b>
${stats.completed >= 10 ? "🏆" : "🔒"} Task Master (10 tasks)
${stats.completed >= 50 ? "⭐" : "🔒"} Productivity Pro (50 tasks)
${stats.streak >= 7 ? "🔥" : "🔒"} Week Warrior (7 day streak)
${stats.completed >= 100 ? "👑" : "🔒"} Centurion (100 tasks)`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔄 Refresh", callback_data: "stats_menu" }],
      [{ text: "« Main Menu", callback_data: "main_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// HELP MENU
// ============================================
async function showHelpMenu(chatId, messageId) {
  const text = `
❓ <b>HELP & TIPS</b>
━━━━━━━━━━━━━━━━━

<b>⏰ Setting Reminders</b>
1. Tap "Set Reminder"
2. Choose when (quick or exact time)
3. Set priority
4. Type your message

<b>📋 Managing Tasks</b>
• Tap ✅ to complete
• Tap 🗑️ to delete
• Use categories to organize

<b>🔄 Recurring Reminders</b>
• Daily, weekly options
• Perfect for routines

<b>💡 Pro Tips</b>
• Use high priority for urgent items
• Set morning reminders for planning
• Clear completed tasks weekly

<b>⌨️ Quick Commands</b>
<code>/remind 10m Call mom</code>
<code>/daily 09:00 Standup</code>
<code>/add Buy groceries</code>`;

  const keyboard = {
    inline_keyboard: [[{ text: "« Main Menu", callback_data: "main_menu" }]],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// REMINDER LIST
// ============================================
async function showRemindersList(chatId, messageId) {
  const reminders = data.reminders
    .filter((r) => r.chatId === chatId && !r.fired)
    .sort((a, b) => a.time - b.time);

  // Separate one-time and recurring
  const oneTime = reminders.filter((r) => !r.recurring);
  const recurring = reminders.filter((r) => r.recurring);

  let text = `
📜 <b>MY REMINDERS</b>
━━━━━━━━━━━━━━━━━
`;

  if (reminders.length === 0) {
    text += `\n<i>No active reminders.</i>\n`;
  } else {
    // One-time reminders
    if (oneTime.length > 0) {
      text += `\n⏰ <b>One-time</b> (${oneTime.length})\n`;
      oneTime.slice(0, 5).forEach((r) => {
        const priority = PRIORITY_EMOJI[r.priority] || "🔔";
        const snoozed = r.snoozed ? ` 😴x${r.snoozed}` : "";
        text += `${priority} ${r.text}${snoozed}\n`;
        text += `   └ ${formatDateTime(r.time)}\n`;
      });
      if (oneTime.length > 5)
        text += `   <i>...+${oneTime.length - 5} more</i>\n`;
    }

    // Recurring reminders
    if (recurring.length > 0) {
      text += `\n🔄 <b>Recurring</b> (${recurring.length})\n`;
      recurring.slice(0, 5).forEach((r) => {
        const recIcon = RECURRING_EMOJI[r.recurring] || "🔄";
        const recLabel = RECURRING_LABEL[r.recurring] || r.recurring;
        const priority = PRIORITY_EMOJI[r.priority] || "🔔";
        text += `${recIcon} ${r.text}\n`;
        text += `   └ <i>${recLabel}</i> • Next: ${formatDateTime(r.time)}\n`;
      });
      if (recurring.length > 5)
        text += `   <i>...+${recurring.length - 5} more</i>\n`;
    }
  }

  const keyboard = { inline_keyboard: [] };

  // Show delete buttons with proper icons
  if (oneTime.length > 0) {
    keyboard.inline_keyboard.push([
      { text: "━━━ ⏰ One-time ━━━", callback_data: "ignore" },
    ]);
    oneTime.slice(0, 3).forEach((r) => {
      keyboard.inline_keyboard.push([
        {
          text: `🗑️ ${r.text.substring(0, 28)}`,
          callback_data: `rm_del_${r.id}`,
        },
      ]);
    });
  }

  if (recurring.length > 0) {
    keyboard.inline_keyboard.push([
      { text: "━━━ 🔄 Recurring ━━━", callback_data: "ignore" },
    ]);
    recurring.slice(0, 3).forEach((r) => {
      const icon = RECURRING_EMOJI[r.recurring] || "🔄";
      keyboard.inline_keyboard.push([
        {
          text: `${icon} 🗑️ ${r.text.substring(0, 25)}`,
          callback_data: `rm_del_${r.id}`,
        },
      ]);
    });
  }

  keyboard.inline_keyboard.push([
    { text: "━━━━━━━━━━━━━━━", callback_data: "ignore" },
  ]);
  keyboard.inline_keyboard.push([
    { text: "➕ One-time", callback_data: "rm_start" },
    { text: "🔄 Recurring", callback_data: "rec_menu" },
  ]);
  keyboard.inline_keyboard.push([
    { text: "« Main Menu", callback_data: "main_menu" },
  ]);

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// CALLBACK QUERY HANDLER
// ============================================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const cb = query.data;

  // We will answer specifically for each action now, or fallback to empty
  // await bot.answerCallbackQuery(query.id);

  // if (cb === "ignore") return bot.answerCallbackQuery(query.id);

  if (cb === "ignore") return;

  // Main menu
  if (cb === "main_menu")
    return sendMainMenu(chatId, messageId, query.from.first_name);

  // Reminder flow
  if (cb === "rm_start") return startReminderFlow(chatId, messageId);
  if (cb === "rm_picktime") return showTimePicker(chatId, messageId);
  if (cb === "rm_pickdate") return showDatePicker(chatId, messageId);
  if (cb === "rm_list") return showRemindersList(chatId, messageId);

  // Quick reminders
  if (cb.startsWith("rm_quick_")) {
    const code = cb.replace("rm_quick_", "");
    const ms = {
      "5m": 5 * 60000,
      "15m": 15 * 60000,
      "30m": 30 * 60000,
      "1h": 3600000,
      "2h": 7200000,
      "4h": 14400000,
      "1d": 86400000,
    }[code];
    userStates[chatId] = {
      flow: "reminder",
      step: "priority",
      time: Date.now() + ms,
    };
    return showPriorityPicker(chatId, messageId);
  }

  // Period shortcuts
  if (cb.startsWith("rm_period_")) {
    const period = cb.replace("rm_period_", "");
    const hours = { morning: 9, afternoon: 14, evening: 19 }[period];
    const target = new Date();
    target.setHours(hours, 0, 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    userStates[chatId] = {
      flow: "reminder",
      step: "priority",
      time: target.getTime(),
    };
    return showPriorityPicker(chatId, messageId);
  }

  // Hour selection
  if (cb.startsWith("rm_hour_")) {
    const parts = cb.replace("rm_hour_", "").split("_");
    const hour = parseInt(parts[0]);
    const ampm = parts[1];
    return showMinutePicker(chatId, messageId, hour, ampm);
  }

  // Minute selection
  if (cb === "rm_min_custom") {
    return askCustomMinute(chatId, messageId);
  }

  if (cb === "rm_picktime_back") {
    const state = userStates[chatId] || {};
    const hour = state.hour || 9;
    const ampm = hour >= 12 ? "pm" : "am";
    const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return showMinutePicker(chatId, messageId, hour12, ampm);
  }

  if (cb.startsWith("rm_min_")) {
    const state = userStates[chatId] || {};
    const minute = parseInt(cb.replace("rm_min_", ""));

    // For recurring reminders, store hour/minute and ask for text directly
    if (state.flow === "recurring") {
      userStates[chatId] = { ...state, minute };
      return askRecurringText(chatId, messageId);
    }

    // For one-time reminders, calculate target time
    let target;
    if (state.selectedDate) {
      // Parse YYYY-MM-DD as local date
      const [year, month, day] = state.selectedDate.split("-").map(Number);
      target = new Date(year, month - 1, day);
    } else {
      target = new Date();
    }
    target.setHours(state.hour, minute, 0, 0);
    if (target <= new Date() && !state.selectedDate)
      target.setDate(target.getDate() + 1);
    userStates[chatId] = { ...state, time: target.getTime() };
    return showPriorityPicker(chatId, messageId);
  }

  // Month navigation
  if (cb.startsWith("rm_month_")) {
    const offset = parseInt(cb.replace("rm_month_", ""));
    return showDatePicker(chatId, messageId, offset);
  }

  // Date selection
  if (cb.startsWith("rm_date_")) {
    const dateStr = cb.replace("rm_date_", "");
    // Parse as local date (YYYY-MM-DD) to avoid UTC timezone shift
    const [year, month, day] = dateStr.split("-").map(Number);
    const selectedDate = new Date(year, month - 1, day);
    userStates[chatId] = {
      ...userStates[chatId],
      selectedDate: dateStr, // Store as YYYY-MM-DD string
    };
    return showTimePicker(chatId, messageId, dateStr);
  }

  // Priority selection
  if (cb.startsWith("rm_priority_")) {
    const priority = cb.replace("rm_priority_", "");
    return askReminderText(chatId, messageId, priority);
  }

  // Delete reminder
  if (cb.startsWith("rm_del_")) {
    const id = parseInt(cb.replace("rm_del_", ""));
    data.reminders = data.reminders.filter((r) => r.id !== id);
    await saveData();
    return showRemindersList(chatId, messageId);
  }

  // Snooze
  if (cb.startsWith("snooze_")) {
    const [_, id, mins] = cb.split("_");
    const reminder = data.reminders.find((r) => r.id === parseInt(id));
    if (reminder) {
      reminder.time = Date.now() + parseInt(mins) * 60000;
      reminder.snoozed = (reminder.snoozed || 0) + 1;
      reminder.fired = false; // Reset fired status
      await saveData();
      await answerToast(query.id, `😴 Snoozed for ${mins} mins`);
      const nextTime = formatDateTime(reminder.time);
      await safeEditMessage(chatId, messageId,
        `😴 <b>Snoozed!</b>\n\n📝 ${reminder.text}\n⏰ Next: ${nextTime}\n🔕 Snoozed ${reminder.snoozed}x`,
        { parse_mode: "HTML" },
      );
    } else {
      await safeEditMessage(chatId, messageId, `❌ Reminder not found`, {});
    }
    return;
  }

  if (cb.startsWith("dismiss_")) {
    const id = parseInt(cb.split("_")[1]);
    data.reminders = data.reminders.filter((r) => r.id !== id);
    await saveData();
    await answerToast(query.id, "✅ Done! Reminder dismissed.");
    await bot.deleteMessage(chatId, messageId).catch(() => {});
    return;
  }

  // Todo menu
  if (cb === "todo_menu") return showTodoMenu(chatId, messageId);
  if (cb === "todo_add") return startAddTaskFlow(chatId, messageId);
  if (cb === "todo_categories")
    return showTodoCategoriesMenu(chatId, messageId);

  // Todo view
  if (cb.startsWith("todo_view_")) {
    const id = parseInt(cb.replace("todo_view_", ""));
    return showTaskDetail(chatId, messageId, id);
  }

  // Todo category
  if (cb.startsWith("todo_cat_")) {
    const category = cb.replace("todo_cat_", "");
    return askTaskPriority(chatId, messageId, category);
  }

  // Todo priority
  if (cb.startsWith("todo_pri_")) {
    const priority = cb.replace("todo_pri_", "");
    return askTaskText(chatId, messageId, priority);
  }

  // Todo done
  if (cb.startsWith("todo_done_")) {
    const id = parseInt(cb.replace("todo_done_", ""));
    const todos = data.todos[chatId] || [];
    const task = todos.find((t) => t.id === id);
    if (task) {
      task.done = !task.done;
      if (task.done) {
        const stats = getUserStats(chatId);
        stats.completed++;
        stats.lastActive = Date.now();
      }
      await saveData();
      const status = task.done ? "Completed! 🎉" : "Marked incomplete";
      await answerToast(query.id, status);
    }
    return showTodoMenu(chatId, messageId);
  }

  // Todo delete
  if (cb.startsWith("todo_del_")) {
    const id = parseInt(cb.replace("todo_del_", ""));
    if (data.todos[chatId]) {
      data.todos[chatId] = data.todos[chatId].filter((t) => t.id !== id);
      await saveData();
      await answerToast(query.id, "🗑️ Task deleted");
    }
    return showTodoMenu(chatId, messageId);
  }

  // Todo clear
  if (cb === "todo_clear") {
    if (data.todos[chatId]) {
      data.todos[chatId] = data.todos[chatId].filter((t) => !t.done);
      await saveData();
    }
    return showTodoMenu(chatId, messageId);
  }

  // Recurring menu
  if (cb === "rec_menu") return showRecurringMenu(chatId, messageId);

  // Daily recurring
  if (cb.startsWith("rec_daily_")) {
    const hour = cb.replace("rec_daily_", "");
    if (hour === "custom") {
      userStates[chatId] = {
        flow: "recurring",
        step: "pick_hour",
        recurring: "daily",
      };
      return showTimePicker(chatId, messageId);
    }
    userStates[chatId] = {
      flow: "recurring",
      recurring: "daily",
      hour: parseInt(hour),
      messageId,
    };
    const text = `🔄 <b>Daily at ${parseInt(hour) > 12 ? parseInt(hour) - 12 : hour}:00 ${parseInt(hour) >= 12 ? "PM" : "AM"}</b>\n\nType your reminder text:`;
    await safeEditMessage(chatId, messageId, text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "rec_menu" }]],
      },
    });
    userStates[chatId].step = "input_text";
    return;
  }

  // Weekly recurring
  if (cb.startsWith("rec_weekly_")) {
    const day = parseInt(cb.replace("rec_weekly_", ""));
    userStates[chatId] = {
      flow: "recurring",
      recurring: "weekly",
      day,
      step: "pick_hour",
      messageId,
    };
    return showTimePicker(chatId, messageId);
  }

  // Weekdays recurring (Mon-Fri)
  if (cb === "rec_weekdays") {
    userStates[chatId] = {
      flow: "recurring",
      recurring: "weekdays",
      step: "pick_hour",
      messageId,
    };
    return showTimePicker(chatId, messageId);
  }

  // Weekends recurring (Sat-Sun)
  if (cb === "rec_weekends") {
    userStates[chatId] = {
      flow: "recurring",
      recurring: "weekends",
      step: "pick_hour",
      messageId,
    };
    return showTimePicker(chatId, messageId);
  }

  // Stats
  if (cb === "stats_menu") return showStatsMenu(chatId, messageId);

  // Help
  if (cb === "help_menu") return showHelpMenu(chatId, messageId);

  // Settings
  if (cb === "settings_menu") return showSettingsMenu(chatId, messageId);

  // Timezone settings
  if (cb === "settings_timezone") return showTimezoneMenu(chatId, messageId);
  if (cb.startsWith("set_tz_")) {
    const offset = parseFloat(cb.replace("set_tz_", ""));
    const settings = getUserSettings(chatId);
    settings.timezone = offset;
    await saveData();
    return showSettingsMenu(chatId, messageId);
  }

  // Time format settings
  if (cb === "settings_timeformat")
    return showTimeFormatMenu(chatId, messageId);
  if (cb.startsWith("set_tf_")) {
    const format = cb.replace("set_tf_", "");
    const settings = getUserSettings(chatId);
    settings.timeFormat = format;
    await saveData();
    return showSettingsMenu(chatId, messageId);
  }

  // Default priority settings
  if (cb === "settings_priority")
    return showDefaultPriorityMenu(chatId, messageId);
  if (cb.startsWith("set_defpri_")) {
    const priority = cb.replace("set_defpri_", "");
    const settings = getUserSettings(chatId);
    settings.defaultPriority = priority;
    await saveData();
    return showSettingsMenu(chatId, messageId);
  }

  // Sound toggle
  if (cb === "settings_sound_toggle") {
    const settings = getUserSettings(chatId);
    settings.soundEnabled = !settings.soundEnabled;
    await saveData();
    return showSettingsMenu(chatId, messageId);
  }

  // Quick reminder duration
  if (cb === "settings_quickreminder")
    return showQuickReminderMenu(chatId, messageId);
  if (cb.startsWith("set_qr_")) {
    const mins = parseInt(cb.replace("set_qr_", ""));
    const settings = getUserSettings(chatId);
    settings.quickReminderMins = mins;
    await saveData();
    return showSettingsMenu(chatId, messageId);
  }

  // Clear all data
  if (cb === "settings_cleardata")
    return showClearDataConfirm(chatId, messageId);
  if (cb === "settings_cleardata_confirm") {
    delete data.todos[chatId];
    data.reminders = data.reminders.filter((r) => r.chatId !== chatId);
    delete data.stats[chatId];
    delete data.settings[chatId];
    await saveData();
    await safeEditMessage(chatId, messageId,
      "🗑️ <b>All your data has been cleared!</b>\n\nUse /start to begin fresh.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🏠 Start Fresh", callback_data: "main_menu" }],
          ],
        },
      },
    );
    if (cb === "rm_close_confirm") {
      await answerToast(query.id, "Closed");
      return bot.deleteMessage(chatId, messageId).catch(() => {});
    }
    return;
  }
});

// ============================================
// SETTINGS MENUS
// ============================================
async function showSettingsMenu(chatId, messageId) {
  const settings = getUserSettings(chatId);

  const tzHours = Math.floor(Math.abs(settings.timezone));
  const tzMins = Math.round((Math.abs(settings.timezone) % 1) * 60);
  const tzOffset = `UTC${settings.timezone >= 0 ? "+" : "-"}${tzHours}${tzMins ? `:${String(tzMins).padStart(2, "0")}` : ""}`;
  const tzName =
    TIMEZONES.find((t) => t.offset === settings.timezone)?.name || tzOffset;
  const timeFormatDisplay =
    settings.timeFormat === "12h" ? "12-hour (AM/PM)" : "24-hour";
  const priorityEmoji = PRIORITY_EMOJI[settings.defaultPriority] || "🟡";
  const soundStatus = settings.soundEnabled ? "🔔 On" : "🔕 Off";

  const text = `
⚙️ <b>SETTINGS</b>
━━━━━━━━━━━━━━━━━

🌍 <b>Timezone:</b> ${tzName}
🕐 <b>Time Format:</b> ${timeFormatDisplay}
${priorityEmoji} <b>Default Priority:</b> ${settings.defaultPriority}
${soundStatus} <b>Sound:</b> ${settings.soundEnabled ? "Enabled" : "Disabled"}
⚡ <b>Quick Remind:</b> ${settings.quickReminderMins} min

<i>Tap an option to change it:</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `🌍 Timezone: ${tzName.split(" ")[0]}`,
          callback_data: "settings_timezone",
        },
      ],
      [
        {
          text: `🕐 Time: ${timeFormatDisplay}`,
          callback_data: "settings_timeformat",
        },
      ],
      [
        {
          text: `${priorityEmoji} Priority: ${settings.defaultPriority}`,
          callback_data: "settings_priority",
        },
      ],
      [{ text: `${soundStatus}`, callback_data: "settings_sound_toggle" }],
      [
        {
          text: `⚡ Quick Remind: ${settings.quickReminderMins}m`,
          callback_data: "settings_quickreminder",
        },
      ],
      [{ text: "━━━━━━━━━━━━━━━", callback_data: "ignore" }],
      [{ text: "🗑️ Clear All My Data", callback_data: "settings_cleardata" }],
      [{ text: "« Main Menu", callback_data: "main_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function showTimezoneMenu(chatId, messageId) {
  const settings = getUserSettings(chatId);

  const tzHours = Math.floor(Math.abs(settings.timezone));
  const tzMins = Math.round((Math.abs(settings.timezone) % 1) * 60);
  const tzOffset = `UTC${settings.timezone >= 0 ? "+" : "-"}${tzHours}${tzMins ? `:${String(tzMins).padStart(2, "0")}` : ""}`;

  const text = `
🌍 <b>SELECT TIMEZONE</b>
━━━━━━━━━━━━━━━━━

Current: <b>${tzOffset}</b>

<i>Select your timezone:</i>`;

  const keyboard = { inline_keyboard: [] };

  // Add timezone buttons in pairs
  for (let i = 0; i < TIMEZONES.length; i += 2) {
    const row = [];
    const tz1 = TIMEZONES[i];
    const isSelected1 = settings.timezone === tz1.offset;
    row.push({
      text: `${isSelected1 ? "✓ " : ""}${tz1.name.split(" ")[0]}`,
      callback_data: `set_tz_${tz1.offset}`,
    });

    if (TIMEZONES[i + 1]) {
      const tz2 = TIMEZONES[i + 1];
      const isSelected2 = settings.timezone === tz2.offset;
      row.push({
        text: `${isSelected2 ? "✓ " : ""}${tz2.name.split(" ")[0]}`,
        callback_data: `set_tz_${tz2.offset}`,
      });
    }
    keyboard.inline_keyboard.push(row);
  }

  keyboard.inline_keyboard.push([
    { text: "« Back to Settings", callback_data: "settings_menu" },
  ]);

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function showTimeFormatMenu(chatId, messageId) {
  const settings = getUserSettings(chatId);

  const now = new Date();
  const time12 = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const time24 = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const text = `
🕐 <b>TIME FORMAT</b>
━━━━━━━━━━━━━━━━━

Current: <b>${settings.timeFormat === "12h" ? "12-hour" : "24-hour"}</b>

<b>12-hour:</b> ${time12}
<b>24-hour:</b> ${time24}

<i>Select your preferred format:</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `${settings.timeFormat === "12h" ? "✓ " : ""}🕐 12-hour (3:30 PM)`,
          callback_data: "set_tf_12h",
        },
      ],
      [
        {
          text: `${settings.timeFormat === "24h" ? "✓ " : ""}🕑 24-hour (15:30)`,
          callback_data: "set_tf_24h",
        },
      ],
      [{ text: "« Back to Settings", callback_data: "settings_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function showDefaultPriorityMenu(chatId, messageId) {
  const settings = getUserSettings(chatId);

  const text = `
🎯 <b>DEFAULT PRIORITY</b>
━━━━━━━━━━━━━━━━━

Current: <b>${PRIORITY_EMOJI[settings.defaultPriority]} ${settings.defaultPriority}</b>

<i>New reminders will use this priority by default:</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `${settings.defaultPriority === "low" ? "✓ " : ""}🟢 Low`,
          callback_data: "set_defpri_low",
        },
      ],
      [
        {
          text: `${settings.defaultPriority === "medium" ? "✓ " : ""}🟡 Medium`,
          callback_data: "set_defpri_medium",
        },
      ],
      [
        {
          text: `${settings.defaultPriority === "high" ? "✓ " : ""}🔴 High`,
          callback_data: "set_defpri_high",
        },
      ],
      [
        {
          text: `${settings.defaultPriority === "urgent" ? "✓ " : ""}🚨 Urgent`,
          callback_data: "set_defpri_urgent",
        },
      ],
      [{ text: "« Back to Settings", callback_data: "settings_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function showQuickReminderMenu(chatId, messageId) {
  const settings = getUserSettings(chatId);

  const text = `
⚡ <b>QUICK REMINDER DURATION</b>
━━━━━━━━━━━━━━━━━

Current: <b>${settings.quickReminderMins} minutes</b>

<i>Default time for quick reminders:</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `${settings.quickReminderMins === 5 ? "✓ " : ""}5m`,
          callback_data: "set_qr_5",
        },
        {
          text: `${settings.quickReminderMins === 10 ? "✓ " : ""}10m`,
          callback_data: "set_qr_10",
        },
        {
          text: `${settings.quickReminderMins === 15 ? "✓ " : ""}15m`,
          callback_data: "set_qr_15",
        },
      ],
      [
        {
          text: `${settings.quickReminderMins === 20 ? "✓ " : ""}20m`,
          callback_data: "set_qr_20",
        },
        {
          text: `${settings.quickReminderMins === 30 ? "✓ " : ""}30m`,
          callback_data: "set_qr_30",
        },
        {
          text: `${settings.quickReminderMins === 60 ? "✓ " : ""}1h`,
          callback_data: "set_qr_60",
        },
      ],
      [{ text: "« Back to Settings", callback_data: "settings_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function showClearDataConfirm(chatId, messageId) {
  const stats = getUserStats(chatId);
  const todoCount = (data.todos[chatId] || []).length;
  const reminderCount = data.reminders.filter(
    (r) => r.chatId === chatId,
  ).length;

  const text = `
⚠️ <b>CLEAR ALL DATA?</b>
━━━━━━━━━━━━━━━━━

<b>This will permanently delete:</b>
• 📋 ${todoCount} tasks
• 🔔 ${reminderCount} reminders
• 📊 ${stats.completed} completed stats
• ⚙️ All your settings

<b>This action cannot be undone!</b>`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🗑️ Yes, Delete Everything",
          callback_data: "settings_cleardata_confirm",
        },
      ],
      [{ text: "« No, Go Back", callback_data: "settings_menu" }],
    ],
  };

  await safeEditMessage(chatId, messageId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ============================================
// FUNNY EXCUSE API
// ============================================
async function getFunnyExcuse() {
  try {
    const res = await fetch("https://naas.isalman.dev/no");
    const json = await res.json();
    return json.reason || "I'm just a reminder bot, not a magician! 🎩";
  } catch {
    const fallbacks = [
      "I'm on a coffee break ☕",
      "My brain cells are currently on vacation 🏖️",
      "I tried, but my hamster wheel stopped spinning 🐹",
      "Error 404: Intelligence not found 🤖",
      "I would help, but I'm busy doing nothing 😴",
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// ============================================
// MESSAGE HANDLER - TEXT INPUT
// ============================================
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const state = userStates[chatId];

  // No active state - user sent random text
  if (!state) {
    const excuse = await getFunnyExcuse();
    return bot.sendMessage(
      chatId,
      `🤷 <b>I don't understand that!</b>\n\n<i>"${excuse}"</i>\n\n💡 Use /start to see what I can do!`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🏠 Open Menu", callback_data: "main_menu" }],
          ],
        },
      }
    );
  }

  const text = msg.text;

  // Custom minute input
  if (state.step === "input_minute") {
    const minute = parseInt(text.trim());
    if (isNaN(minute) || minute < 0 || minute > 59) {
      return bot
        .sendMessage(chatId, "❌ Please enter a valid minute (0-59)")
        .then((m) => {
          setTimeout(
            () => bot.deleteMessage(chatId, m.message_id).catch(() => {}),
            3000,
          );
        });
    }

    let target;
    if (state.selectedDate) {
      // Parse YYYY-MM-DD as local date
      const [year, month, day] = state.selectedDate.split("-").map(Number);
      target = new Date(year, month - 1, day);
    } else {
      target = new Date();
    }
    target.setHours(state.hour, minute, 0, 0);
    if (target <= new Date() && !state.selectedDate)
      target.setDate(target.getDate() + 1);
    userStates[chatId] = {
      ...state,
      time: target.getTime(),
      step: "pick_priority",
    };

    bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    return showPriorityPicker(chatId, state.messageId);
  }

  if (state.step !== "input_text") return;

  // Creating reminder
  if (state.flow === "reminder") {
    const reminder = {
      id: Date.now(),
      chatId,
      text,
      time: state.time,
      priority: state.priority || "medium",
      recurring: null,
      createdAt: Date.now(),
    };

    data.reminders.push(reminder);
    await saveData();

    const stats = getUserStats(chatId);
    stats.totalReminders++;

    delete userStates[chatId];

    // Kept messages as requested

    await bot.sendMessage(
      chatId,
      `✅ <b>REMINDER SET</b>\n━━━━━━━━━━━━━━━━━\n\n📌 <b>${escapeHtml(text)}</b>\n⏰ ${formatDateTime(reminder.time, chatId)}\n${PRIORITY_EMOJI[reminder.priority]} Priority: ${reminder.priority}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📜 View All", callback_data: "rm_list" }],
          ],
        },
      },
    );
    return;
  }

  // Creating recurring reminder
  if (state.flow === "recurring") {
    const now = new Date();
    let target = new Date();
    const hour = state.hour || 9;
    const minute = state.minute || 0;

    if (state.recurring === "daily") {
      target.setHours(hour, minute, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
    } else if (state.recurring === "weekly") {
      target.setHours(hour, minute, 0, 0);
      const daysUntil = (state.day - now.getDay() + 7) % 7 || 7;
      target.setDate(target.getDate() + daysUntil);
    } else if (state.recurring === "weekdays") {
      target.setHours(hour, minute, 0, 0);
      // Find next weekday (Mon-Fri = 1-5)
      while (target <= now || target.getDay() === 0 || target.getDay() === 6) {
        target.setDate(target.getDate() + 1);
      }
    } else if (state.recurring === "weekends") {
      target.setHours(hour, minute, 0, 0);
      // Find next weekend day (Sat=6, Sun=0)
      while (
        target <= now ||
        (target.getDay() !== 0 && target.getDay() !== 6)
      ) {
        target.setDate(target.getDate() + 1);
      }
    }

    const recurringEmoji =
      {
        daily: "📅",
        weekly: "📆",
        weekdays: "💼",
        weekends: "🎉",
      }[state.recurring] || "🔄";

    const recurringLabel =
      {
        daily: "Every day",
        weekly: "Every week",
        weekdays: "Every weekday (Mon-Fri)",
        weekends: "Every weekend (Sat-Sun)",
      }[state.recurring] || state.recurring;

    // Format time display
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const displayAmPm = hour >= 12 ? "PM" : "AM";
    const timeDisplay = `${displayHour}:${String(minute).padStart(2, "0")} ${displayAmPm}`;

    const reminder = {
      id: Date.now(),
      chatId,
      text,
      time: target.getTime(),
      priority: "medium",
      recurring: state.recurring,
      recurringDay: state.day,
      recurringHour: hour,
      recurringMinute: minute,
      createdAt: Date.now(),
    };

    data.reminders.push(reminder);
    await saveData();

    delete userStates[chatId];
    bot.deleteMessage(chatId, state.messageId).catch(() => {});

    await bot.sendMessage(
      chatId,
      `✅ <b>RECURRING REMINDER SET!</b>\n━━━━━━━━━━━━━━━━━\n\n${recurringEmoji} <b>${escapeHtml(text)}</b>\n⏰ ${recurringLabel} at ${timeDisplay}\n\n<i>First reminder: ${formatDateTime(target.getTime())}</i>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📜 View Reminders", callback_data: "rm_list" }],
            [{ text: "« Main Menu", callback_data: "main_menu" }],
          ],
        },
      },
    );
    return;
  }

  // Creating todo
  if (state.flow === "todo") {
    if (!data.todos[chatId]) data.todos[chatId] = [];

    data.todos[chatId].push({
      id: Date.now(),
      text,
      done: false,
      category: state.category || "other",
      priority: state.priority || "medium",
      createdAt: Date.now(),
    });
    await saveData();

    delete userStates[chatId];
    bot.deleteMessage(chatId, state.messageId).catch(() => {});

    await bot.sendMessage(
      chatId,
      `✅ <b>TASK ADDED!</b>\n━━━━━━━━━━━━━━━━━\n\n${CATEGORY_EMOJI[state.category]} ${PRIORITY_EMOJI[state.priority]} <b>${escapeHtml(text)}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📋 View Tasks", callback_data: "todo_menu" },
              { text: "➕ Add More", callback_data: "todo_add" },
            ],
            [{ text: "« Main Menu", callback_data: "main_menu" }],
          ],
        },
      },
    );
  }
});

// ============================================
// COMMAND HANDLERS
// ============================================
bot.onText(/\/remind(?:er)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const parsed = parseTimeAndMessage(match[1].trim());
  if (!parsed || parsed.time <= Date.now())
    return bot.sendMessage(chatId, "❌ Invalid time format");

  data.reminders.push({
    id: Date.now(),
    chatId,
    text: parsed.message,
    time: parsed.time,
    priority: "medium",
    recurring: null,
    createdAt: Date.now(),
  });
  await saveData();

  bot.sendMessage(
    chatId,
    `✅ Reminder set!\n\n📝 ${parsed.message}\n⏰ ${formatDateTime(parsed.time)}`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📜 View All", callback_data: "rm_list" }]],
      },
    },
  );
});

bot.onText(/\/add\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!data.todos[chatId]) data.todos[chatId] = [];
  data.todos[chatId].push({
    id: Date.now(),
    text: match[1].trim(),
    done: false,
    category: "other",
    priority: "medium",
    createdAt: Date.now(),
  });
  await saveData();
  bot.sendMessage(chatId, `✅ Task added: ${match[1].trim()}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📋 View Tasks", callback_data: "todo_menu" }],
      ],
    },
  });
});

bot.onText(/\/list/, (msg) =>
  showTodoMenu(msg.chat.id, null).catch(() =>
    bot.sendMessage(msg.chat.id, "Use /start first"),
  ),
);

// ============================================
// /time - Show current time
// ============================================
bot.onText(/\/time/, (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);

  // Apply timezone offset
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const userTime = new Date(utc + settings.timezone * 3600000);

  const time12 = userTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const time24 = userTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const date = userTime.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const hour = userTime.getHours();
  let greeting, emoji;
  if (hour < 6) {
    greeting = "Good night";
    emoji = "🌙";
  } else if (hour < 12) {
    greeting = "Good morning";
    emoji = "🌅";
  } else if (hour < 17) {
    greeting = "Good afternoon";
    emoji = "☀️";
  } else if (hour < 21) {
    greeting = "Good evening";
    emoji = "🌆";
  } else {
    greeting = "Good night";
    emoji = "🌙";
  }

  const tzHours = Math.floor(Math.abs(settings.timezone));
  const tzMins = Math.round((Math.abs(settings.timezone) % 1) * 60);
  const tzDisplay = `UTC${settings.timezone >= 0 ? "+" : "-"}${tzHours}${tzMins ? `:${String(tzMins).padStart(2, "0")}` : ""}`;
  const primaryTime = settings.timeFormat === "12h" ? time12 : time24;
  const secondaryTime = settings.timeFormat === "12h" ? time24 : time12;

  const text = `
${emoji} <b>${greeting}!</b>
━━━━━━━━━━━━━━━━━

🕐 <b>${primaryTime}</b>
🕑 <code>${secondaryTime}</code>

📅 ${date}
🌍 ${tzDisplay}`;

  bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "⏰ Set Reminder", callback_data: "rm_start" }],
        [{ text: "⚙️ Change Timezone", callback_data: "settings_timezone" }],
      ],
    },
  });
});

// ============================================
// REMINDER CHECKER
// ============================================
let reminderCheckerStarted = false;

function startReminderChecker() {
  if (reminderCheckerStarted) return;
  reminderCheckerStarted = true;

  setInterval(async () => {
    const now = Date.now();
    let changed = false;

    for (let i = data.reminders.length - 1; i >= 0; i--) {
      const reminder = data.reminders[i];
      // Skip if already fired and waiting for user action (snooze/dismiss)
      if (reminder.fired) continue;

      if (reminder.time <= now) {
        const priority = PRIORITY_EMOJI[reminder.priority] || "🔔";
        const snoozedInfo = reminder.snoozed
          ? `\n😴 <i>Snoozed ${reminder.snoozed} time(s)</i>`
          : "";

        // Show recurring info
        const recurringInfo = reminder.recurring
          ? `\n${RECURRING_EMOJI[reminder.recurring] || "🔄"} <i>${RECURRING_LABEL[reminder.recurring] || "Recurring"}</i>`
          : "";

        const header = reminder.recurring
          ? "🔄 RECURRING REMINDER!"
          : "⏰ REMINDER!";

        await bot
          .sendMessage(
            reminder.chatId,
            `${priority} <b>${header}</b>\n━━━━━━━━━━━━━━━━━\n\n📝 <b>${reminder.text}</b>${recurringInfo}${snoozedInfo}\n\n<i>Set ${formatTimeAgo(reminder.createdAt)}</i>`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "😴 5m", callback_data: `snooze_${reminder.id}_5` },
                    {
                      text: "😴 15m",
                      callback_data: `snooze_${reminder.id}_15`,
                    },
                    {
                      text: "😴 30m",
                      callback_data: `snooze_${reminder.id}_30`,
                    },
                    {
                      text: "😴 1h",
                      callback_data: `snooze_${reminder.id}_60`,
                    },
                  ],
                  [
                    {
                      text: "✅ Done!",
                      callback_data: `dismiss_${reminder.id}`,
                    },
                  ],
                ],
              },
            },
          )
          .catch(console.error);

        if (reminder.recurring) {
          reminder.time = getNextRecurringTime(
            reminder.time,
            reminder.recurring,
          );
        } else {
          // Mark as fired instead of deleting - will be deleted when dismissed
          reminder.fired = true;
        }
        changed = true;
      }
    }

    if (changed) await saveData();
  }, 60000);
}

function getNextRecurringTime(time, type, reminder = null) {
  if (type === "weekdays") {
    // Find next weekday (Mon-Fri)
    const next = new Date(time);
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() === 0 || next.getDay() === 6);
    return next.getTime();
  }

  if (type === "weekends") {
    // Find next weekend day (Sat or Sun)
    const next = new Date(time);
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() !== 0 && next.getDay() !== 6);
    return next.getTime();
  }

  const ms =
    { hourly: 3600000, daily: 86400000, weekly: 604800000 }[type] || 86400000;
  return time + ms;
}

// ============================================
// HELPERS
// ============================================
function formatDateTime(ts, chatId = null) {
  // Convert to user's timezone if chatId provided
  const d = chatId ? utcToUserTime(ts, chatId) : new Date(ts);
  const now = chatId ? getUserNow(chatId) : new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get user's time format preference
  let hour12 = true;
  if (chatId) {
    const settings = getUserSettings(chatId);
    hour12 = settings.timeFormat === "12h";
  }

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12,
  });

  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString())
    return `Tomorrow at ${time}`;

  const date = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${date} at ${time}`;
}

function formatDateShort(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parseTimeAndMessage(input) {
  const rel = input.match(/^((?:\d+[hmd]\s*)+)\s+(.+)$/i);
  if (rel) {
    let ms = 0;
    const h = rel[1].match(/(\d+)h/),
      m = rel[1].match(/(\d+)m/),
      d = rel[1].match(/(\d+)d/);
    if (h) ms += parseInt(h[1]) * 3600000;
    if (m) ms += parseInt(m[1]) * 60000;
    if (d) ms += parseInt(d[1]) * 86400000;
    if (ms > 0) return { time: Date.now() + ms, message: rel[2] };
  }

  const today = input.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
  if (today) {
    const t = new Date();
    t.setHours(parseInt(today[1]), parseInt(today[2]), 0, 0);
    if (t <= new Date()) t.setDate(t.getDate() + 1);
    return { time: t.getTime(), message: today[3] };
  }

  return null;
}

// ============================================
// START
// ============================================
(async () => {
  try {
    await loadData();
    startReminderChecker(); // Start checker only after data is loaded
    console.log("🚀 Reminder Bot started!");
    console.log("☁️ Using Upstash Redis");
  } catch (err) {
    console.error("❌ Failed to start bot:", err.message);
    process.exit(1);
  }
})();
