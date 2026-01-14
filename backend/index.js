require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const token = process.env.BOT_TOKEN;
const adminId = Number(process.env.ADMIN_ID);
const bot = new TelegramBot(token, { polling: true });

// Ma'lumotlarni yuklash funksiyasi
const loadStudents = () => {
    try {
        const filePath = path.join(__dirname, 'data.json');
        if (!fs.existsSync(filePath)) return [];
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

// Ma'lumotlarni saqlash funksiyasi
const saveStudents = (students) => {
    fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(students, null, 2));
};

// --- SERVER YO'LLARI (Ping va Status) ---

app.get('/', (req, res) => {
    res.send('Server ishlamoqda. Status: Online');
});

app.get('/ping', (req, res) => {
    res.status(200).json({ status: "success", message: "pong" });
});

// --- BOT BUYRUQLARI ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    const inline_keyboard = [
        [{ text: 'DevCore (Ariza topshirish)', web_app: { url: 'https://front-end-kursi.netlify.app/' } }],
        [{ text: '💬 Admin bilan boglanish', url: 'https://t.me/bro_xvv' }]
    ];

    let welcomeText = "Assalomu alaykum, " + firstName + "!\n\n" +
                      "Dasturlash kurslariga ariza topshirish uchun quyidagi tugmani bosing.";

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
});

// --- POST YARATISH QISMI ---

bot.onText(/\/post/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== adminId) return;

    bot.sendMessage(chatId, "Post matnini yoki rasm/videoni yuboring. Men uni saqlab olaman va keyin qanday yuborishni so'rayman.");

    // Bir martalik listener: admin xabar yuborishini kutadi
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
bot.onText(/\/students/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== adminId) return;

    const students = loadStudents();
    if (students.length === 0) return bot.sendMessage(chatId, "Royxat bosh.");

 let message = "Talabalar royxati:\n\n";
students.forEach((s) => {
    message += "ID: " + s.id + "\n" +
               "Ism: " + s.name + "\n" +
               "Guruh: " + s.group + "\n" +
               "Tel: " + s.phone + "\n" +
               "Kontakt: " + s.contact + "\n\n"; // Har bir talabadan keyin 2 ta bo'sh joy
});

    bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: "Talabani ochirish", callback_data: "remove_student" }]]
        }
    });
});
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data; // <--- Bu yerda 'data'ni aniqlab olish shart

    // 1. Talabani o'chirish logikasi
    if (data === "remove_student") {
        bot.sendMessage(chatId, "O'chirish kerak bo'lgan talabaning ID raqamini yozing:");
        
        const idListener = (msg) => {
            if (msg.chat.id === adminId && !msg.text.startsWith('/')) {
                const targetId = parseInt(msg.text);
                let students = loadStudents();
                const initialCount = students.length;

                students = students.filter(s => s.id !== targetId);

                if (students.length < initialCount) {
                    saveStudents(students);
                    bot.sendMessage(chatId, `ID: ${targetId} o'chirildi.`);
                } else {
                    bot.sendMessage(chatId, "Bunday ID topilmadi.");
                }
                bot.removeListener('message', idListener);
            }
        };
        bot.on('message', idListener);
    }

    // 2. Post yuborish logikasi
    if (data.startsWith('send_fwd_') || data.startsWith('send_bot_')) {
        const action = data.split('_')[1]; // fwd yoki bot
        const messageId = data.split('_')[2];
        const students = loadStudents();
        let count = 0;

        // Adminni o'ziga yuborishni kutish xabari
        const statusMsg = await bot.sendMessage(chatId, "Yuborish boshlandi...");

        for (const student of students) {
            try {
                // MUHIM: student.id bazada Telegram chatId bo'lishi kerak!
                if (action === 'fwd') {
                    await bot.forwardMessage(student.id, adminId, messageId);
                } else {
                    await bot.copyMessage(student.id, adminId, messageId);
                }
                count++;
            } catch (err) {
                console.log(`${student.id} ga yuborib bo'lmadi (Botni bloklagan bo'lishi mumkin).`);
            }
        }

        bot.editMessageText(`Tayyor! Xabar ${count} ta foydalanuvchiga muvaffaqiyatli yuborildi.`, {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });
    }

    // 3. Bekor qilish
    if (data === "cancel_post") {
        bot.deleteMessage(chatId, query.message.message_id);
        bot.sendMessage(chatId, "Post yuborish bekor qilindi.");
    }
});
// --- API ENDPOINT ---

app.post('/add-student', async (req, res) => {
    const { name, group, phone, contact, time } = req.body;
    let students = loadStudents();

    const lastId = students.length > 0 ? students[students.length - 1].id : 0;
    const newId = lastId + 1;

    const newStudent = { id: newId, name, group, phone, contact, time };
    students.push(newStudent);

    try {
        saveStudents(students);

        const adminMessage = "Yangi ariza:\n\n" +
                             "ID: " + newId + "\n" +
                             "Ism: " + name + "\n" +
                             "Guruh: " + group + "\n" +
                             "Tel: " + phone + "\n" +
                             "Kontakt: " + contact + "\n" +
                             "Vaqt: " + time;

        await bot.sendMessage(adminId, adminMessage);
        res.status(200).send({ message: "Saqlandi", id: newId });
    } catch (error) {
        res.status(500).send({ message: "Xato" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server ishlamoqda..."));
