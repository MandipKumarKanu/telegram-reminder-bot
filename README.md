# ⏰ Reminder Bot

A simple Telegram bot to set reminders and manage tasks. Never forget anything again!

**👉 Try it now: [t.me/myy_reminder_bot](http://t.me/myy_reminder_bot)**

---

## What Can It Do?

### 🔔 Set Reminders
- Quick reminders: "Remind me in 5 minutes"
- Pick exact time from a visual clock
- Pick date from a calendar
- Snooze when it goes off

### 🔄 Recurring Reminders
- Daily (every day)
- Weekly (same day each week)
- Weekdays only (Mon-Fri)
- Weekends only (Sat-Sun)

### 📋 To-Do Lists
- Add tasks with categories (Work, Personal, Health, etc.)
- Mark as done with one tap
- Set priority (Low, Medium, High, Urgent)

### 🌍 Works in Your Timezone
Supports 16 timezones including US, UK, Europe, India, Nepal, Japan, and more.

---

## How to Use

1. Open [@myy_reminder_bot](http://t.me/myy_reminder_bot) in Telegram
2. Press **Start**
3. Tap buttons to set reminders or add tasks

That's it! Everything works with buttons - no commands needed.

---

## Quick Commands (Optional)

| Command | What it does |
|---------|--------------|
| `/start` | Open menu |
| `/remind 10m Call mom` | Remind in 10 minutes |
| `/remind 2h Meeting` | Remind in 2 hours |
| `/add Buy milk` | Add a task |
| `/time` | Show current time |

---

## Self-Hosting Guide

Want to run your own copy? Here's how:

### 1. Get a Bot Token
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow steps
3. Copy the token it gives you

### 2. Get Upstash Redis (Free Database)
1. Go to [console.upstash.com](https://console.upstash.com)
2. Create account → Create database
3. Copy the **REST URL** and **REST Token**

### 3. Set Up the Bot
```bash
# Clone the repo
git clone https://github.com/MandipKumarKanu/telegram-reminder-bot.git
cd telegram-reminder-bot

# Install packages
npm install

# Create .env file with your tokens
cp .env.example .env
# Edit .env and add your tokens

# Run the bot
npm start
```

### 4. Deploy Free (Optional)
For 24/7 running, deploy to [Koyeb](https://koyeb.com):
1. Sign up with GitHub
2. Create new service → Select this repo
3. Add your 3 environment variables
4. Deploy!

---

## Environment Variables

| Name | Where to get it |
|------|-----------------|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `UPSTASH_REDIS_REST_URL` | From Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash dashboard |

---

## Tech Stack

- Node.js
- node-telegram-bot-api
- Upstash Redis

---

## License

MIT - Use it however you want!
