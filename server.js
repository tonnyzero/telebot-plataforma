const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

// Helper para ler/gravar dados
function getDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { adminPassword: 'admin', pushinPayToken: '', bots: [], orders: [] };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ================= ROTAS DO PAINEL =================
app.get('/api/data', (req, res) => {
  const db = getDB();
  res.json({
    pushinPayToken: db.pushinPayToken,
    bots: db.bots,
    orders: db.orders
  });
});

app.post('/api/settings', (req, res) => {
  const { pushinPayToken, adminPassword } = req.body;
  const db = getDB();
  if (pushinPayToken) db.pushinPayToken = pushinPayToken;
  if (adminPassword) db.adminPassword = adminPassword;
  saveDB(db);
  res.json({ success: true });
});

// Atualizar mensagem, mídias e configurações completas do bot
app.post('/api/bots/update', (req, res) => {
  const { botId, name, welcomeMessage, pixMessage, mediaType, mediaUrl, active } = req.body;
  const db = getDB();
  const bot = db.bots.find(b => b.id === botId);
  if (bot) {
    if (name !== undefined) bot.name = name;
    if (welcomeMessage !== undefined) bot.welcomeMessage = welcomeMessage;
    if (pixMessage !== undefined) bot.pixMessage = pixMessage;
    if (mediaType !== undefined) bot.mediaType = mediaType;
    if (mediaUrl !== undefined) bot.mediaUrl = mediaUrl;
    if (active !== undefined) bot.active = active;
    saveDB(db);
    res.json({ success: true, bot });
  } else {
    res.status(404).json({ error: 'Bot não encontrado' });
  }
});

// Adicionar novo bot
app.post('/api/bots/add', (req, res) => {
  const { name, token, welcomeMessage, mediaType, mediaUrl } = req.body;
  const db = getDB();
  const newBot = {
    id: 'bot_' + Date.now(),
    name,
    token,
    active: true,
    mediaType: mediaType || 'none',
    mediaUrl: mediaUrl || '',
    welcomeMessage: welcomeMessage || 'Oii amor! Escolha um dos planos VIP abaixo para liberar tudo:',
    pixMessage: '👑 **PEDIDO #{orderId} GERADO COM SUCESSO!**\n\n📦 **Item:** {planName}\n💰 **Valor:** R$ {price}\n\n⚡ **Pague via PIX Copia e Cola:**\n`{pixCode}`\n\n_(Toque no código para copiar)_',
    plans: [
      {
        id: 'plan_' + Date.now(),
        name: '👑 ACESSO VIP COMPLETO',
        price: 29.90,
        description: 'Acesso liberado imediatamente',
        type: 'channel_invite',
        channelId: '',
        inviteLink: 'https://t.me/seu_link_aqui'
      }
    ]
  };
  db.bots.push(newBot);
  saveDB(db);
  startBot(newBot);
  res.json({ success: true, bot: newBot });
});

// Salvar / Adicionar / Remover Planos de um Bot
app.post('/api/plans/save', (req, res) => {
  const { botId, plans } = req.body;
  const db = getDB();
  const bot = db.bots.find(b => b.id === botId);
  if (bot) {
    bot.plans = plans.map(p => ({
      id: p.id || 'plan_' + Date.now() + Math.random().toString(36).substring(2, 6),
      name: p.name || 'Plano VIP',
      price: Number(p.price) || 19.90,
      description: p.description || '',
      type: p.type || 'channel_invite',
      channelId: p.channelId || '',
      inviteLink: p.inviteLink || ''
    }));
    saveDB(db);
    res.json({ success: true, plans: bot.plans });
  } else {
    res.status(404).json({ error: 'Bot não encontrado' });
  }
});

// ================= INTEGRAÇÃO PUSHIN PAY =================
async function createPushinPayPix(amountCents, webhookUrl) {
  const db = getDB();
  const token = db.pushinPayToken;

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: amountCents, // Centavos (ex: 2990 = R$ 29,90)
        webhook_url: webhookUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Erro na Pushin Pay:', error.response?.data || error.message);
    throw error;
  }
}

// Webhook da Pushin Pay
app.post('/api/webhook/pushinpay', async (req, res) => {
  console.log('Pushin Pay Webhook recebido:', req.body);
  const payload = req.body;
  const db = getDB();

  const txId = payload.id || payload.transaction_id || payload.data?.id;
  const status = payload.status || payload.data?.status;

  if (status === 'paid' || status === 'PAID' || status === 'approved') {
    const order = db.orders.find(o => o.gatewayId == txId || o.id == txId);
    if (order && order.status !== 'PAID') {
      order.status = 'PAID';
      order.paidAt = new Date().toISOString();
      saveDB(db);

      const bot = db.bots.find(b => b.id === order.botId);
      if (bot) {
        await deliverProduct(bot, order);
      }
    }
  }

  res.status(200).json({ received: true });
});

async function deliverProduct(bot, order) {
  const text = `🎉 *PAGAMENTO CONFIRMADO COM SUCESSO!*\n\nOlá @${order.telegramUser || 'amor'}, seu PIX de *R$ ${Number(order.amount).toFixed(2).replace('.', ',')}* foi aprovado!\n\n👇 *Seu link exclusivo e privativo de acesso:*\n🔗 ${order.inviteLink}\n\n_Não compartilhe esse link com ninguém para não perder seu acesso. Aproveite!_ 🔥`;

  try {
    await axios.post(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      chat_id: order.chatId,
      text: text,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error(`Erro ao entregar pedido #${order.id} no Telegram:`, err.message);
  }
}

// ================= MOTOR DO TELEGRAM =================
const botOffsets = {};

async function telegramApi(token, method, params = {}) {
  try {
    const res = await axios.post(`https://api.telegram.org/bot${token}/${method}`, params, { timeout: 15000 });
    return res.data;
  } catch (err) {
    return null;
  }
}

async function handleUpdate(bot, update) {
  const db = getDB();

  // Quando o usuário envia /start ou mensagem
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const username = update.message.from.username || update.message.from.first_name;

    if (text.startsWith('/start')) {
      const keyboard = {
        inline_keyboard: (bot.plans || []).map(p => [
          {
            text: `${p.name} - R$ ${Number(p.price).toFixed(2).replace('.', ',')}`,
            callback_data: `buy_${p.id}`
          }
        ])
      };

      const captionText = bot.welcomeMessage || 'Escolha seu plano abaixo:';

      // Enviar com Foto, Vídeo ou apenas Texto conforme configurado no painel
      if (bot.mediaType === 'photo' && bot.mediaUrl) {
        await telegramApi(bot.token, 'sendPhoto', {
          chat_id: chatId,
          photo: bot.mediaUrl,
          caption: captionText,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
      } else if (bot.mediaType === 'video' && bot.mediaUrl) {
        await telegramApi(bot.token, 'sendVideo', {
          chat_id: chatId,
          video: bot.mediaUrl,
          caption: captionText,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
      } else {
        await telegramApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: captionText,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
      }
    }
  }

  // Quando o usuário clica em um botão inline de plano
  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message.chat.id;
    const data = query.data;
    const username = query.from.username || query.from.first_name;

    if (data.startsWith('buy_')) {
      const planId = data.replace('buy_', '');
      const plan = (bot.plans || []).find(p => p.id === planId);

      if (!plan) return;

      await telegramApi(bot.token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: 'Gerando seu PIX instantâneo...'
      });

      try {
        const amountCents = Math.round(plan.price * 100);
        const webhookUrl = `${process.env.BASE_URL || 'https://seu-dominio.up.railway.app'}/api/webhook/pushinpay`;

        let pixData;
        try {
          pixData = await createPushinPayPix(amountCents, webhookUrl);
        } catch (e) {
          pixData = {
            id: 'demo_' + Date.now(),
            qr_code: '00020101021226840014br.gov.bcb.pix2562pix.pushinpay.com.br/qr/demo5204000053039865802BR5925TELEBOT_RED_PAY6009SAO_PAULO62070503***6304ABCD',
          };
        }

        const orderId = 'ORD_' + Date.now();
        const order = {
          id: orderId,
          gatewayId: pixData.id,
          botId: bot.id,
          botName: bot.name,
          planId: plan.id,
          planName: plan.name,
          amount: plan.price,
          chatId: chatId,
          telegramUser: username,
          inviteLink: plan.inviteLink,
          status: 'PENDING',
          createdAt: new Date().toISOString()
        };

        db.orders.push(order);
        saveDB(db);

        // Montar mensagem customizada de PIX com substituição de tags
        let template = bot.pixMessage || "👑 **PEDIDO #{orderId}**\n\n📦 **Item:** {planName}\n💰 **Valor:** R$ {price}\n\n⚡ **PIX Copia e Cola:**\n`{pixCode}`\n\n_(Toque no código para copiar)_";
        
        let pixMsg = template
          .replace(/{orderId}/g, orderId.slice(-6))
          .replace(/{planName}/g, plan.name)
          .replace(/{price}/g, Number(plan.price).toFixed(2).replace('.', ','))
          .replace(/{pixCode}/g, pixData.qr_code);

        await telegramApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: pixMsg,
          parse_mode: 'Markdown'
        });

      } catch (err) {
        console.error('Erro ao gerar PIX:', err);
        await telegramApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: '⚠️ Ocorreu um erro ao gerar a cobrança. Tente novamente em alguns segundos.'
        });
      }
    }
  }
}

async function runBotLoop(bot) {
  let offset = botOffsets[bot.id] || 0;
  while (true) {
    try {
      const res = await telegramApi(bot.token, 'getUpdates', {
        offset: offset,
        timeout: 20
      });

      if (res && res.ok && res.result.length > 0) {
        for (const update of res.result) {
          offset = update.update_id + 1;
          botOffsets[bot.id] = offset;
          await handleUpdate(bot, update);
        }
      }
    } catch (e) {
      // espera silenciosa
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

function startBot(bot) {
  if (bot.active && bot.token) {
    console.log(`Iniciando motor para o bot: ${bot.name}`);
    runBotLoop(bot);
  }
}

const initialDB = getDB();
if (initialDB.bots) {
  initialDB.bots.forEach(b => startBot(b));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Telebot Red rodando na porta ${PORT}`);
});
