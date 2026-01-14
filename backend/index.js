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

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    
    if (query.data === "remove_student") {
        bot.sendMessage(chatId, "Ochirish kerak bolgan talabaning ID raqamini yozing:");
        
        const idListener = (msg) => {
            if (msg.chat.id === adminId && !msg.text.startsWith('/')) {
                const targetId = parseInt(msg.text);
                let students = loadStudents();
                const initialCount = students.length;

                students = students.filter(s => s.id !== targetId);

                if (students.length < initialCount) {
                    saveStudents(students);
                    bot.sendMessage(chatId, "ID: " + targetId + " ochirildi.");
                } else {
                    bot.sendMessage(chatId, "Bunday ID topilmadi.");
                }
                bot.removeListener('message', idListener);
            }
        };
        bot.on('message', idListener);
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
