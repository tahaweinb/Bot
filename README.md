# DownBot - Video Downloader Telegram Bot

A Telegram bot that downloads videos from TikTok, Instagram, and YouTube.

## Features

- **Auto-detect platform** - Send any link and the bot will detect if it's TikTok, Instagram, or YouTube
- **TikTok downloads** - Direct video download
- **Instagram downloads** - Direct video download
- **YouTube downloads** - Quality selection with reply buttons
- **Progress updates** - Shows download progress in real-time
- **Error handling** - Graceful error messages

## Setup

### 1. Get a Telegram Bot Token

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Copy the bot token

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Environment Variables

Create a `.env` file or set the environment variable:

```bash
export TELEGRAM_BOT_TOKEN=your_bot_token_here
```

Or copy `.env.example` to `.env` and fill in your token.

### 4. Run the Bot

```bash
node bot.js
```

## Usage

1. Start the bot by sending `/start`
2. Send a video link from any supported platform
3. The bot will auto-detect the platform and download the video
4. For YouTube, select the video quality when prompted
5. The video will be sent to you

## Supported Platforms

- **TikTok** - tiktok.com, vm.tiktok.com
- **Instagram** - instagram.com, instagr.am
- **YouTube** - youtube.com, youtu.be

## Commands

- `/start` - Show welcome message
- `/help` - Show help and usage instructions

## Notes

- The bot requires the video to be publicly accessible
- Large videos may take longer to download
- The bot cleans up temporary files automatically
- Some platforms may have rate limits

## License

MIT
