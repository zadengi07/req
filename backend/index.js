require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- SOZLAMALAR ---
const token = process.env.BOT_TOKEN;
const adminId = parseInt(process.env.ADMIN_ID, 10);
const PORT = process.env.PORT || 3000;

if (!token) {
  console.error('BOT_TOKEN yo‘q. .env faylini tekshiring.');
  process.exit(1);
}
if (Number.isNaN(adminId)) {
  console.error('ADMIN_ID noto‘g‘ri yoki yo‘q. .env faylida raqam kiriting.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const STUDENTS_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Yordamchi: faylni yuklash/saqlash
const loadData = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('loadData xato:', err.message);
    return [];
  }
};

const saveData = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('saveData xato:', err.message);
    throw err;
  }
};

// --- SERVER YO'LLARI ---
app.get('/', (req, res) => res.send('Server Online'));
app.get('/ping', (req, res) => res.status(200).json({ status: "success", message: "pong" }));

// --- BOT KOMANDALARI ---

// 1. START - Har qanday start bosgan odamni users.json ga qo'shish
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from && msg.from.first_name ? msg.from.first_name : 'Foydalanuvchi';
  let users = loadData(USERS_FILE);

  // barcha idlarni number sifatida saqlashga ishonch hosil qilamiz
  if (!users.some(u => Number(u) === chatId)) {
    users.push(chatId);
    try {
      saveData(USERS_FILE, users);
    } catch (err) {
      console.error('Foydalanuvchini saqlashda xato:', err.message);
    }
  }

  const inline_keyboard = [
    [{ text: 'DevCore (Ariza topshirish)', web_app: { url: 'https://front-end-kursi.netlify.app/' } }],
    [{ text: '💬 Admin bilan boglanish', url: 'https://t.me/bro_xvv' }]
  ];

  bot.sendMessage(chatId, `Assalomu alaykum, ${firstName}!\nDasturlash kurslariga ariza topshirish uchun quyidagi tugmani bosing.`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard }
  });
});

// 2. STUDENTS - Faqat admin uchun
bot.onText(/\/students/, (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== adminId) return;
  const students = loadData(STUDENTS_FILE);
  if (!students || students.length === 0) return bot.sendMessage(chatId, "Ro'yxat bo'sh.");

  let message = "<b>Talabalar ro'yxati:</b>\n\n";
  students.forEach((s) => {
    message += `ID: ${s.id}\nIsm: ${s.name}\nGuruh: ${s.group}\nTel: ${s.phone}\nKontakt: ${s.contact}\n\n`;
  });

  bot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: "Talabani o'chirish", callback_data: "remove_student" }]]
    }
  });
});

// 3. POST - Admin xabar yuborishi (state bilan)
const awaitingPost = new Set();

bot.onText(/\/post/, (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== adminId) return;
  bot.sendMessage(chatId, "Barcha foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring (rasm, matn, video):");
  awaitingPost.add(adminId);
});

// umumiy message handler -> agar admin post yuborishi kutilayotgan bo'lsa uni tutamiz
bot.on('message', (postMsg) => {
  // agar bu oddiy /start yoki boshqa komandalar bo'lsa state emas
  if (!awaitingPost.has(postMsg.chat.id)) return;
  if (postMsg.chat.id !== adminId) return;

  // agar admin yana /post yuborsa bekor qilamiz
  if (postMsg.text && postMsg.text.trim() === '/post') return;

  awaitingPost.delete(adminId);

  const messageId = postMsg.message_id;
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Uzatish (Forward)", callback_data: `send_fwd_${messageId}` },
          { text: "Bot nomidan", callback_data: `send_bot_${messageId}` }
        ],
        [{ text: "❌ Bekor qilish", callback_data: "cancel_post" }]
      ]
    }
  };

  bot.sendMessage(adminId, "Ushbu postni qanday usulda tarqatamiz?", opts);
});

// --- CALLBACK QUERY ---
bot.on('callback_query', async (query) => {
  const chatId = query.message && query.message.chat ? query.message.chat.id : null;
  const data = query.data;

  // UI uchun callbackni javoblash
  try {
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    // ignor qiling
  }

  if (!chatId) return;

  if (data === "remove_student") {
    bot.sendMessage(chatId, "O'chirish kerak bo'lgan talabaning ID raqamini yozing:");
    const idListener = (msg) => {
      if (msg.chat.id === adminId && msg.text && !msg.text.startsWith('/')) {
        const targetId = parseInt(msg.text, 10);
        let students = loadData(STUDENTS_FILE);
        const initialCount = students.length;
        students = students.filter(s => s.id !== targetId);

        if (students.length < initialCount) {
          saveData(STUDENTS_FILE, students);
          bot.sendMessage(chatId, `ID: ${targetId} o'chirildi.`);
        } else {
          bot.sendMessage(chatId, "Bunday ID topilmadi.");
        }
        bot.removeListener('message', idListener);
      }
    };
    bot.on('message', idListener);
    return;
  }

  if (data === "cancel_post") {
    // Callback uchun tugmani o'chirish yoki xabarni tozalash
    try {
      await bot.deleteMessage(chatId, query.message.message_id);
    } catch (err) {
      // o'chirish mumkin bo'lmasa, xatoni log qilamiz
      console.error('deleteMessage xato:', err.message);
    }
    return;
  }

  if (data.startsWith('send_fwd_') || data.startsWith('send_bot_')) {
    const parts = data.split('_');
    const action = parts[1]; // 'fwd' yoki 'bot'
    const messageId = parseInt(parts[2], 10);
    const allUsers = loadData(USERS_FILE);
    let count = 0;

    const statusMsg = await bot.sendMessage(chatId, `Yuborish boshlandi... (Jami: ${allUsers.length} foydalanuvchi)`);

    for (const userId of allUsers) {
      try {
        if (action === 'fwd') {
          await bot.forwardMessage(userId, adminId, messageId);
        } else {
          // copyMessage(chatId, from_chat_id, message_id)
          await bot.copyMessage(userId, adminId, messageId);
        }
        count++;
        // Telegram limitlaridan qochish uchun kechikishni oshiramiz
        await new Promise(res => setTimeout(res, 200));
      } catch (err) {
        console.log(`${userId} ga yuborishda xato: ${err.message}`);
      }
    }

    try {
      await bot.editMessageText(`Tayyor! Xabar ${count} ta foydalanuvchiga yuborildi.`, {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
    } catch (err) {
      console.error('editMessageText xato:', err.message);
    }
    return;
  }
});

// --- API ENDPOINT ---
app.post('/add-student', async (req, res) => {
  const { name, group, phone, contact, time } = req.body || {};
  if (!name || !group || !phone) {
    return res.status(400).send({ message: "Noto'g'ri so'rov: name, group va phone majburiy." });
  }

  let students = loadData(STUDENTS_FILE);
  const lastId = students.length > 0 ? students[students.length - 1].id : 0;
  const newId = lastId + 1;

  const newStudent = { id: newId, name, group, phone, contact: contact || '', time: time || '' };
  students.push(newStudent);

  try {
    saveData(STUDENTS_FILE, students);
    const adminMessage = `Yangi ariza:\n\nID: ${newId}\nIsm: ${name}\nGuruh: ${group}\nTel: ${phone}\nKontakt: ${contact || '-'}\nVaqt: ${time || '-'}`;
    await bot.sendMessage(adminId, adminMessage);
    res.status(200).send({ message: "Saqlandi", id: newId });
  } catch (error) {
    console.error('add-student xato:', error.message);
    res.status(500).send({ message: "Xato" });
  }
});

// boshlash
app.listen(PORT, () => console.log(`Server ishlamoqda... PORT=${PORT}`));
