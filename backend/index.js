require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Muhit o'zgaruvchilari
const token = process.env.BOT_TOKEN;
const adminId = Number(process.env.ADMIN_ID);

if (!token || !adminId) {
    console.log("⚠️ Token yoki admin ID mavjud emas");
} else {
    console.log("✅ API sozlamalari joyida");
}

const bot = new TelegramBot(token, { polling: true });

// --- SERVER YO'LLARI (ROUTES) ---

// 1. Asosiy sahifa - Server ishlayotganini tekshirish uchun
app.get('/', (req, res) => {
    res.send(`
        <div style="text-align: center; font-family: sans-serif; pt: 50px;">
            <h1 style="color: #4CAF50;">DevCore Server ishlamoqda! ✅</h1>
            <p>Hozirgi vaqt: ${new Date().toLocaleString('uz-UZ')}</p>
            <p>Status: Online</p>
        </div>
    `);
});

// 2. Ping yo'li - UptimeRobot va monitoring xizmatlari uchun
app.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: "success", 
        message: "pong", 
        timestamp: new Date().toISOString() 
    });
});

// Talabalarni yuklash funksiyasi
const loadStudents = () => {
    try {
        const filePath = path.join(__dirname, 'data.json');
        if (!fs.existsSync(filePath)) return [];
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Fayl o'qishda xato:", err.message);
        return [];
    }
};

// --- BOT BUYRUQLARI ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    const inline_keyboard = [
        [{ text: 'DevCore (Ariza topshirish)', web_app: { url: 'https://front-end-kursi.netlify.app/' } }],
        [{ text: '💬 Admin bilan bog\'lanish', url: 'https://t.me/bro_xvv' }]
    ];

    let welcomeText = `<b>Assalomu alaykum, ${firstName}!</b>\n\n` +
                      `Dasturlash kurslariga ariza topshirish uchun quyidagi tugmani bosing.`;

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
});

// Statistika buyrug'i (Faqat admin uchun)
bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== adminId) return;

    const students = loadStudents();
    bot.sendMessage(chatId, `📊 <b>Statistika:</b>\n\nJami arizalar: ${students.length} ta`, { parse_mode: 'HTML' });
});

bot.onText(/\/students/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== adminId) {
        return bot.sendMessage(chatId, "Bu buyruq faqat admin uchun!");
    }

    const students = loadStudents();
    if (students.length === 0) return bot.sendMessage(chatId, "Hozircha arizalar yo'q.");

    let message = "<b>Barcha talabalar ro'yxati:</b>\n\n";

    students.forEach((student, index) => {
        message += `<b>${index + 1}. ${student.name}</b>\n`;
        message += `Guruh: ${student.group}\n`;
        message += `Tel: ${student.phone}\n`;
        message += `Vaqt: ${student.time}\n\n`;

        if (message.length > 3500) {
            bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            message = "";
        }
    });

    if (message.length > 0) {
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
});

// --- API ENDPOINT ---

app.post('/add-student', async (req, res) => { // async qo'shildi
    const { name, group, phone, contact, time } = req.body;
    const newStudent = { name, group, phone, contact, time };
    const students = loadStudents();
    students.push(newStudent);

    try {
        fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(students, null, 2));

        const adminMessage = `<b>DevCore jamoasiga yangi ariza kelib tushdi!</b>\n\n` +
                             `<b>Ism:</b> ${name}\n` +
                             `<b>Guruh:</b> ${group}\n` +
                             `<b>Tel:</b> ${phone}\n` +
                             `<b>Bog'lanish:</b> ${contact}\n` +
                             `<b>Vaqt:</b> ${time}`;

        // Xabar yuborishni await bilan tekshiramiz
        await bot.sendMessage(adminId, adminMessage, { parse_mode: 'HTML' });
        console.log(`✅ Adminga xabar yuborildi: ${adminId}`);
        
        res.status(200).send({ message: "Muvaffaqiyatli saqlandi" });
    } catch (error) {
        console.error("❌ Xatolik yuz berdi:", error.message); // Xatoni konsolda ko'rish uchun
        res.status(500).send({ message: "Serverda xatolik yoki Bot xatosi" });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda yugurmoqda...`);

});
