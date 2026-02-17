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
const adminId = Number(process.env.ADMIN_ID);
const bot = new TelegramBot(token, { polling: true });

const STUDENTS_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Ma'lumotlarni yuklash funksiyasi
const loadData = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return [];
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

// Ma'lumotlarni saqlash funksiyasi
const saveData = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// --- SERVER YO'LLARI ---
app.get('/', (req, res) => res.send('Server Online'));
app.get('/ping', (req, res) => res.status(200).json({ status: "success", message: "pong" }));

// --- BOT KOMANDALARI ---

// 1. START - Har qanday start bosgan odamni users.json ga qo'shish
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    let users = loadData(USERS_FILE);
    if (!users.includes(chatId)) {
        users.push(chatId);
        saveData(USERS_FILE, users);
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
    if (students.length === 0) return bot.sendMessage(chatId, "Ro'yxat bo'sh.");

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

// 3. POST - Admin xabar yuborishi
bot.onText(/\/post/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== adminId) return;

    bot.sendMessage(chatId, "Barcha foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring (rasm, matn, video):");

    bot.once('message', (postMsg) => {
        if (postMsg.text === '/post' || postMsg.chat.id !== adminId) return;

        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Uzatish (Forward)", callback_data: `send_fwd_${postMsg.message_id}` },
                        { text: "Bot nomidan", callback_data: `send_bot_${postMsg.message_id}` }
                    ],
                    [{ text: "❌ Bekor qilish", callback_data: "cancel_post" }]
                ]
            }
        };

        bot.sendMessage(chatId, "Ushbu postni qanday usulda tarqatamiz?", opts);
    });
});

// --- CALLBACK QUERY ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === "remove_student") {
        bot.sendMessage(chatId, "O'chirish kerak bo'lgan talabaning ID raqamini yozing:");
        const idListener = (msg) => {
            if (msg.chat.id === adminId && !msg.text.startsWith('/')) {
                const targetId = parseInt(msg.text);
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
    }

    // Hammaga yuborish logikasi
    if (data.startsWith('send_fwd_') || data.startsWith('send_bot_')) {
        const action = data.split('_')[1];
        const messageId = data.split('_')[2];
        const allUsers = loadData(USERS_FILE); // Start bosgan hamma odamlar
        let count = 0;

        const statusMsg = await bot.sendMessage(chatId, `Yuborish boshlandi... (Jami: ${allUsers.length} foydalanuvchi)`);

        for (const userId of allUsers) {
            try {
                if (action === 'fwd') {
                    await bot.forwardMessage(userId, adminId, messageId);
                } else {
                    await bot.copyMessage(userId, adminId, messageId);
                }
                count++;
                // Limitga tushmaslik uchun
                await new Promise(res => setTimeout(res, 50));
            } catch (err) {
                console.log(`${userId} botni bloklagan.`);
            }
        }

        bot.editMessageText(`Tayyor! Xabar ${count} ta foydalanuvchiga yuborildi.`, {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });
    }

    if (data === "cancel_post") {
        bot.deleteMessage(chatId, query.message.message_id);
    }
});

// --- API ENDPOINT ---
app.post('/add-student', async (req, res) => {
    const { name, group, phone, contact, time } = req.body;
    let students = loadData(STUDENTS_FILE);

    const lastId = students.length > 0 ? students[students.length - 1].id : 0;
    const newId = lastId + 1;

    const newStudent = { id: newId, name, group, phone, contact, time };
    students.push(newStudent);

    try {
        saveData(STUDENTS_FILE, students);
        const adminMessage = `Yangi ariza:\n\nID: ${newId}\nIsm: ${name}\nGuruh: ${group}\nTel: ${phone}\nKontakt: ${contact}\nVaqt: ${time}`;
        await bot.sendMessage(adminId, adminMessage);
        res.status(200).send({ message: "Saqlandi", id: newId });
    } catch (error) {
        res.status(500).send({ message: "Xato" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server ishlamoqda..."));

