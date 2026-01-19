# ⏰ Reminder Bot

A feature-rich Telegram bot with beautiful interactive buttons for reminders, recurring tasks, and to-do lists. Uses Upstash Redis for cloud storage - perfect for hosting on Render, Railway, or any cloud platform.

## ✨ Features

### 🔔 Reminders
- **One-time reminders** with quick options (5m, 15m, 30m, 1h, 2h, 4h, 1d)
- **Precise time picker** - Hour/minute selection with AM/PM
- **Calendar date picker** - Visual calendar for future dates
- **Priority levels** - 🟢 Low, 🟡 Medium, 🔴 High, 🚨 Urgent
- **Snooze options** - 5min, 15min, 30min, 1hr when triggered

### 🔄 Recurring Reminders
- **Daily** - Every day at a specific time
- **Weekly** - Same day each week
- **Weekdays** - Monday to Friday only
- **Weekends** - Saturday & Sunday only

### 📋 Task Management
- **Categories** - 💼 Work, 👤 Personal, 💪 Health, 🛒 Shopping, 💰 Finance, 📚 Learning, 👥 Social
- **Priority levels** - Visual indicators for urgency
- **Quick actions** - ✅ Complete, 🗑️ Delete with one tap
- **Category view** - Group tasks by category

### 🌍 Timezone Support
16 timezone presets including:
- 🇺🇸 US (Pacific, Mountain, Central, Eastern)
- 🇬🇧 UK, 🇪🇺 Europe (Central, Eastern)
- 🇦🇪 Dubai, 🇮🇳 India, 🇳🇵 Nepal, 🇧🇩 Bangladesh
- 🇹🇭 Thailand, 🇸🇬 Singapore, 🇯🇵 Japan/Korea
- 🇦🇺 Australia, 🇳🇿 New Zealand

### ⚙️ User Settings
- **Timezone** - All times displayed in your local time
- **Time format** - 12-hour (AM/PM) or 24-hour
- **Default priority** - Set your preferred default
- **Quick reminder duration** - Customize quick options

### 📊 Statistics & Achievements
- Track completed tasks
- Daily streak counter
- Unlock achievements: 🏆 Task Master, ⭐ Productivity Pro, 🔥 Week Warrior, 👑 Centurion

## 📱 Screenshots

The bot features a beautiful interactive menu:
- 🏠 Dashboard with live stats
- ⏰ Visual time picker (AM/PM grid)
- 📅 Calendar date picker
- 📋 Task list with inline actions
- 😴 Snooze buttons when reminders fire

## 🚀 Setup

### 1. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create new bot with `/newbot`
3. Copy the bot token

### 2. Create Upstash Redis Database (Free)

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database
3. Copy the **REST URL** and **REST Token**

### 3. Configure Environment

Create `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

### 4. Install & Run

```bash
npm install
npm start

# For development with auto-reload:
npm run dev
```

## ☁️ Deploy to Render

1. Push your code to GitHub
2. Create new **Web Service** on [Render](https://render.com)
3. Connect your repository
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `npm start`
6. Add environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
7. Deploy!

## ⌨️ Commands

All features are accessible via buttons, but commands still work:

| Command | Description |
|---------|-------------|
| `/start` | Open main menu |
| `/remind 10m Call mom` | Quick reminder |
| `/remind 2h30m Meeting` | Combined time |
| `/remind 14:30 Doctor` | Specific time |
| `/add Buy groceries` | Add task |
| `/list` | Show tasks |
| `/time` | Show current time in your timezone |

## ⏱️ Time Formats for `/remind`

| Format | Example | Description |
|--------|---------|-------------|
| Minutes | `10m` | 10 minutes from now |
| Hours | `2h` | 2 hours from now |
| Days | `1d` | 24 hours from now |
| Combined | `1h30m` | 1 hour 30 minutes |
| Clock time | `14:30` | Today at 2:30 PM (or tomorrow if passed) |

## 🗄️ Data Storage

All data is stored in Upstash Redis with this structure:
- `reminders[]` - All user reminders
- `todos{}` - Tasks grouped by chat ID
- `stats{}` - User statistics
- `settings{}` - User preferences (timezone, format, etc.)

### Why Upstash Redis?

| Feature | Free Tier |
|---------|-----------|
| Requests | 10,000/day |
| Storage | 256MB |
| Persistence | ✅ Yes |
| REST API | ✅ No SDK needed |
| Global | ✅ Low latency |

Perfect for bots hosted on platforms that don't persist filesystem data.

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Bot Framework**: node-telegram-bot-api
- **Database**: Upstash Redis (REST API)
- **Config**: dotenv

## 📄 License

MIT
