const TelegramBot = require('node-telegram-bot-api');
const ytdl = require('ytdl-core');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

const userStates = new Map();
const tempDir = path.join(__dirname, 'temp');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function detectPlatform(url) {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('tiktok.com') || lowerUrl.includes('vm.tiktok.com')) {
    return 'tiktok';
  }
  
  if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
    return 'instagram';
  }
  
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return 'youtube';
  }
  
  return null;
}

async function downloadTikTok(url, chatId, msg) {
  const statusMsg = await bot.sendMessage(chatId, '📥 Downloading TikTok video...');
  
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.data || !response.data.data || !response.data.data.play) {
      throw new Error('Could not get video URL from TikTok');
    }
    
    const videoUrl = response.data.data.play;
    const fileName = `tiktok_${Date.now()}.mp4`;
    const filePath = path.join(tempDir, fileName);
    
    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream'
    });
    
    const totalLength = parseInt(videoResponse.headers['content-length'], 10);
    let downloaded = 0;
    
    videoResponse.data.on('data', (chunk) => {
      downloaded += chunk.length;
      const percent = ((downloaded / totalLength) * 100).toFixed(1);
      if (downloaded % (1024 * 1024) < chunk.length) {
        bot.editMessageText(`📥 Downloading TikTok video... ${percent}%`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
      }
    });
    
    const writer = fs.createWriteStream(filePath);
    videoResponse.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    await bot.editMessageText('✅ Download complete! Sending video...', {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
    
    await bot.sendVideo(chatId, filePath, {
      caption: `🎬 TikTok video from @${response.data.data.author?.unique_id || 'unknown'}`
    });
    
    fs.unlinkSync(filePath);
    
    await bot.deleteMessage(chatId, statusMsg.message_id);
    
    return true;
  } catch (error) {
    console.error('TikTok download error:', error);
    await bot.editMessageText(`❌ Error downloading TikTok video: ${error.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
    return false;
  }
}

async function downloadInstagram(url, chatId, msg) {
  const statusMsg = await bot.sendMessage(chatId, '📥 Downloading Instagram video...');
  
  try {
    const apiUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
    const oembedResponse = await axios.get(apiUrl);
    
    const thumbnailUrl = oembedResponse.data.thumbnail_url;
    const title = oembedResponse.data.title || 'Instagram video';
    
    const apiResponse = await axios.get(`https://www.instagram.com/p/${url.split('/p/')[1]?.split('/')[0]}/?__a=1&__d=dis`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    let videoUrl = null;
    if (apiResponse.data && apiResponse.data.graphql && apiResponse.data.graphql.shortcode_media) {
      const media = apiResponse.data.graphql.shortcode_media;
      if (media.is_video) {
        videoUrl = media.video_url;
      }
    }
    
    if (!videoUrl) {
      throw new Error('Could not find video URL. This might be an image post or Instagram is blocking the request.');
    }
    
    const fileName = `instagram_${Date.now()}.mp4`;
    const filePath = path.join(tempDir, fileName);
    
    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream'
    });
    
    const totalLength = parseInt(videoResponse.headers['content-length'], 10);
    let downloaded = 0;
    
    videoResponse.data.on('data', (chunk) => {
      downloaded += chunk.length;
      const percent = ((downloaded / totalLength) * 100).toFixed(1);
      if (downloaded % (1024 * 1024) < chunk.length) {
        bot.editMessageText(`📥 Downloading Instagram video... ${percent}%`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
      }
    });
    
    const writer = fs.createWriteStream(filePath);
    videoResponse.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    await bot.editMessageText('✅ Download complete! Sending video...', {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
    
    await bot.sendVideo(chatId, filePath, {
      caption: `📸 Instagram video: ${title}`
    });
    
    fs.unlinkSync(filePath);
    
    await bot.deleteMessage(chatId, statusMsg.message_id);
    
    return true;
  } catch (error) {
    console.error('Instagram download error:', error);
    await bot.editMessageText(`❌ Error downloading Instagram video: ${error.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
    return false;
  }
}

async function getYoutubeQualities(url) {
  try {
    const info = await ytdl.getInfo(url);
    const formats = info.formats.filter(f => f.hasVideo && f.hasAudio);
    
    const qualities = [];
    const seenQualities = new Set();
    
    for (const format of formats) {
      const quality = format.qualityLabel || `${format.height}p`;
      if (!seenQualities.has(quality) && format.height) {
        seenQualities.add(quality);
        qualities.push({
          quality,
          itag: format.itag,
          container: format.container,
          qualityLabel: format.qualityLabel
        });
      }
    }
    
    qualities.sort((a, b) => {
      const heightA = parseInt(a.quality) || 0;
      const heightB = parseInt(b.quality) || 0;
      return heightB - heightA;
    });
    
    return {
      qualities: qualities.slice(0, 5),
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url
    };
  } catch (error) {
    throw new Error(`Could not get video info: ${error.message}`);
  }
}

async function downloadYoutube(url, chatId, msg, qualityItag = null) {
  const statusMsg = await bot.sendMessage(chatId, '📥 Getting YouTube video info...');
  
  try {
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    
    if (!qualityItag) {
      const qualities = await getYoutubeQualities(url);
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: qualities.qualities.map(q => [{
            text: `${q.quality} (${q.container})`,
            callback_data: `yt_${q.itag}_${encodeURIComponent(url)}`
          }])
        }
      };
      
      await bot.editMessageText(`🎬 *${title}*\n\nSelect video quality:`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      
      return true;
    }
    
    await bot.editMessageText('📥 Downloading YouTube video...', {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
    
    const format = ytdl.chooseFormat(info.formats, { itag: parseInt(qualityItag) });
    const fileName = `youtube_${Date.now()}.mp4`;
    const filePath = path.join(tempDir, fileName);
    
    const stream = ytdl(url, { format });
    const writer = fs.createWriteStream(filePath);
    
    let downloaded = 0;
    const totalLength = format.contentLength ? parseInt(format.contentLength, 10) : 0;
    
    stream.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalLength > 0) {
        const percent = ((downloaded / totalLength) * 100).toFixed(1);
        if (downloaded % (1024 * 1024) < chunk.length) {
          bot.editMessageText(`📥 Downloading YouTube video... ${percent}%`, {
            chat_id: chatId,
            message_id: statusMsg.message_id
          }).catch(() => {});
        }
      }
    });
    
    stream.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      stream.on('error', reject);
    });
    
    await bot.editMessageText('✅ Download complete! Sending video...', {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
    
    await bot.sendVideo(chatId, filePath, {
      caption: `🎬 ${title}`,
      parse_mode: 'Markdown'
    });
    
    fs.unlinkSync(filePath);
    
    await bot.deleteMessage(chatId, statusMsg.message_id);
    
    return true;
  } catch (error) {
    console.error('YouTube download error:', error);
    await bot.editMessageText(`❌ Error downloading YouTube video: ${error.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
    return false;
  }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'there';
  
  bot.sendMessage(chatId, 
    `👋 Hello ${firstName}! I'm DownBot, your video downloader.\n\n` +
    `I can download videos from:\n` +
    `• TikTok\n` +
    `• Instagram\n` +
    `• YouTube\n\n` +
    `Just send me a link and I'll download it for you!\n\n` +
    `Commands:\n` +
    `/start - Show this message\n` +
    `/help - Get help`
  );
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `📥 *DownBot Help*\n\n` +
    `*How to use:*\n` +
    `1. Send me a video link from TikTok, Instagram, or YouTube\n` +
    `2. I'll detect the platform and download the video\n` +
    `3. For YouTube, you'll be asked to select quality\n` +
    `4. The video will be sent to you\n\n` +
    `*Supported platforms:*\n` +
    `• TikTok (tiktok.com)\n` +
    `• Instagram (instagram.com)\n` +
    `• YouTube (youtube.com, youtu.be)\n\n` +
    `*Tips:*\n` +
    `• Make sure the link is public\n` +
    `• For YouTube, I'll show available qualities\n` +
    `• Download progress will be shown`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);
  
  if (!urls || urls.length === 0) return;
  
  for (const url of urls) {
    const platform = detectPlatform(url);
    
    if (!platform) {
      await bot.sendMessage(chatId, '❌ I couldn\'t detect the platform. Please send a link from TikTok, Instagram, or YouTube.');
      continue;
    }
    
    switch (platform) {
      case 'tiktok':
        await downloadTikTok(url, chatId, msg);
        break;
      case 'instagram':
        await downloadInstagram(url, chatId, msg);
        break;
      case 'youtube':
        await downloadYoutube(url, chatId, msg);
        break;
    }
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  
  if (data.startsWith('yt_')) {
    const parts = data.split('_');
    const itag = parts[1];
    const url = decodeURIComponent(parts.slice(2).join('_'));
    
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Downloading...' });
    
    await bot.deleteMessage(chatId, messageId);
    
    await downloadYoutube(url, chatId, callbackQuery.message, itag);
  }
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 DownBot is running...');
console.log('Press Ctrl+C to stop');

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  bot.stopPolling();
  
  const files = fs.readdirSync(tempDir);
  for (const file of files) {
    fs.unlinkSync(path.join(tempDir, file));
  }
  
  process.exit(0);
});
