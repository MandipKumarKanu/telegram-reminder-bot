# ⏰ Reminder Bot

A Telegram bot that remembers things so you don't have to. Finally, technology doing something useful instead of mining crypto.

**👉 [Try it now](http://t.me/myy_reminder_bot)** _(It's free. Probably.)_

---

## 🤔 What's This Thing Do?

### 🔔 Reminders

- "Remind me in 5 minutes" _(to check if the food is burning)_
- Pick exact time _(for people who have their life together)_
- Calendar picker _(because typing dates is so 2010)_
- Snooze button _(for the "5 more minutes" people - we see you)_

### 🔄 Recurring Reminders

- **Daily** - For daily vitamins you'll forget anyway
- **Weekly** - "It's leg day" notifications you'll ignore
- **Weekdays** - Work stuff. Boring but necessary.
- **Weekends** - Touch grass reminders

### 📋 To-Do Lists

- Categories: Work 💼, Personal 👤, Health 💪 _(lol)_, Shopping 🛒
- Priority levels from "meh" to "YOUR HOUSE IS ON FIRE 🚨"
- One-tap complete _(dopamine hit included)_

### 🌍 Timezones

Works in 16 timezones. Yes, even Nepal (UTC+5:45 - why?? 🇳🇵)

---

## 🚀 How to Use

1. Open [@myy_reminder_bot](http://t.me/myy_reminder_bot)
2. Press **Start**
3. Tap buttons like it's a video game

That's it. If you need more instructions, maybe this bot isn't for you. Try a sticky note.

---

## ⌨️ Commands (For Keyboard Warriors)

| Command                  | What happens                |
| ------------------------ | --------------------------- |
| `/start`                 | Opens the fancy menu        |
| `/remind 10m Call mom`   | She's been waiting          |
| `/remind 2h Touch grass` | Self-care is important      |
| `/add Buy milk`          | You forgot last time        |
| `/time`                  | In case you lost your clock |

---

## 🏠 Self-Hosting (For Nerds)

Want your own bot? Sure, trust issues are valid.

### Step 1: Get a Bot Token

1. Message [@BotFather](https://t.me/BotFather)
2. Type `/newbot`
3. Follow instructions _(they're not that hard)_
4. Copy the token. Guard it with your life. Or don't. It's just a bot.

### Step 2: Get a Free Database

1. Go to [Upstash](https://console.upstash.com)
2. Make account → Make database
3. Copy the REST URL and Token
4. Feel like a real developer

### Step 3: Actually Set It Up

```bash
# Clone it
git clone https://github.com/MandipKumarKanu/telegram-reminder-bot.git
cd telegram-reminder-bot

# Install stuff
npm install

# Set up secrets
cp .env.example .env
# Put your tokens in .env (don't commit this file, genius)

# Run it
npm start
```

### Step 4: Deploy (Optional)

Deploy to [Koyeb](https://koyeb.com) for free 24/7 hosting:

1. Sign up with GitHub _(they won't spam you... much)_
2. Create service → Pick repo
3. Add env variables
4. Deploy and pretend you're a DevOps engineer

---

## 🔐 Environment Variables

| Variable                   | Where to find it          |
| -------------------------- | ------------------------- |
| `TELEGRAM_BOT_TOKEN`       | @BotFather gave it to you |
| `UPSTASH_REDIS_REST_URL`   | Upstash dashboard         |
| `UPSTASH_REDIS_REST_TOKEN` | Also Upstash dashboard    |

---

## 🛠️ Tech Stack

- **Node.js** - JavaScript but make it backend
- **node-telegram-bot-api** - Does what it says
- **Upstash Redis** - A database that doesn't judge your forgetfulness

---

## 📄 License

MIT - Do whatever you want. Credit appreciated but we won't hunt you down.

---

<p align="center">
  <i>Made with ☕ and mass of mass</i><br>
  <i>Because I kept forgetting to take out the trash</i>
</p>
