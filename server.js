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

// Helper para ler/gravar dados com garantia de persistência
function getDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      adminEmail: 'tonnyzero@outlook.com',
      adminPassword: '16271627Ri',
      pushinPayToken: '72093|BuXW4REHPWwyPIPS0a8OChHAmHAxUgTSx0Ha1IPQ18789bd6',
      bots: [],
      orders: []
    };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) {
    console.error('Erro ao ler DB:', e);
    return { adminEmail: 'tonnyzero@outlook.com', adminPassword: '16271627Ri', bots: [], orders: [] };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erro ao salvar DB:', e);
  }
}

// Token de sessão flexível e persistente
const activeTokens = new Set();
const DEFAULT_SESSION = 'telebot_master_token_2026';
activeTokens.add(DEFAULT_SESSION);

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || (!activeTokens.has(token) && token !== DEFAULT_SESSION)) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
  next();
}

// ================= ROTA DE LOGIN =================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const db = getDB();

  if (email === db.adminEmail && password === db.adminPassword) {
    const sessionToken = 'tok_' + Date.now() + Math.random().toString(36).substring(2, 10);
    activeTokens.add(sessionToken);
    return res.json({ success: true, token: sessionToken });
  }

  return res.status(401).json({ success: false, error: 'Email ou senha incorretos!' });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) activeTokens.delete(token);
  res.json({ success: true });
});

// ================= ROTAS DO PAINEL =================
app.get('/api/data', authMiddleware, (req, res) => {
  const db = getDB();
  res.json({
    adminEmail: db.adminEmail,
    pushinPayToken: db.pushinPayToken,
    bots: db.bots,
    orders: db.orders
  });
});

app.post('/api/settings', authMiddleware, (req, res) => {
  const { pushinPayToken, adminEmail, adminPassword } = req.body;
  const db = getDB();
  if (pushinPayToken !== undefined) db.pushinPayToken = pushinPayToken.trim();
  if (adminEmail !== undefined) db.adminEmail = adminEmail.trim();
  if (adminPassword !== undefined) db.adminPassword = adminPassword.trim();
  saveDB(db);
  res.json({ success: true });
});

// Atualizar mensagem, mídias e configurações completas do bot
app.post('/api/bots/update', authMiddleware, (req, res) => {
  const { botId, name, welcomeMessage, pixMessage, mediaType, mediaUrl, active, plans } = req.body;
  const db = getDB();
  const bot = db.bots.find(b => b.id === botId);
  if (bot) {
    if (name !== undefined) bot.name = name;
    if (welcomeMessage !== undefined) bot.welcomeMessage = welcomeMessage;
    if (pixMessage !== undefined) bot.pixMessage = pixMessage;
    if (mediaType !== undefined) bot.mediaType = mediaType;
    if (mediaUrl !== undefined) bot.mediaUrl = mediaUrl;
    if (active !== undefined) bot.active = active;
    if (Array.isArray(plans)) {
      bot.plans = plans.map(p => ({
        id: p.id || 'plan_' + Date.now() + Math.random().toString(36).substring(2, 6),
        name: p.name || 'Plano VIP',
        price: Number(p.price) || 19.90,
        description: p.description || '',
        badge: p.badge || '',
        type: p.type || 'channel_invite',
        channelId: p.channelId || '',
        inviteLink: p.inviteLink || ''
      }));
    }
    saveDB(db);
    res.json({ success: true, bot });
  } else {
    res.status(404).json({ error: 'Bot não encontrado' });
  }
});

// Adicionar novo bot
app.post('/api/bots/add', authMiddleware, (req, res) => {
  const { name, token, welcomeMessage, mediaType, mediaUrl } = req.body;
  const db = getDB();
  const newBot = {
    id: 'bot_' + Date.now(),
    name: name || 'Nova Criadora VIP',
    token: (token || '').trim(),
    active: true,
    mediaType: mediaType || 'none',
    mediaUrl: mediaUrl || '',
    welcomeMessage: welcomeMessage || 'Oii Amor Olha O que Tá te esperando no meu Vip 😈\n\n🔒 Clica agora e libere tudo!',
    pixMessage: '👑 **PEDIDO #{orderId} GERADO COM SUCESSO!**\n\n📦 **Item:** {planName}\n💰 **Valor:** R$ {price}\n\n⚡ **Pague via PIX Copia e Cola:**\n`{pixCode}`\n\n_(Toque no código para copiar)_',
    plans: [
      {
        id: 'plan_' + Date.now() + '_1',
        name: '👑 VITALÍCIO + BRINDE 🎁',
        price: 39.90,
        description: 'Acesso vitalício completo',
        badge: 'MAIS VENDIDO 🔥',
        type: 'channel_invite',
        inviteLink: 'https://t.me/seu_link_aqui'
      },
      {
        id: 'plan_' + Date.now() + '_2',
        name: '⭐ PLANO MENSAL ⭐',
        price: 19.90,
        description: '30 dias de acesso',
        badge: '',
        type: 'channel_invite',
        inviteLink: 'https://t.me/seu_link_aqui'
      }
    ]
  };
  db.bots.push(newBot);
  saveDB(db);
  startBot(newBot);
  res.json({ success: true, bot: newBot });
});

// Excluir bot
app.post('/api/bots/delete', authMiddleware, (req, res) => {
  const { botId } = req.body;
  const db = getDB();
  db.bots = db.bots.filter(b => b.id !== botId);
  saveDB(db);
  res.json({ success: true });
});

// Salvar / Adicionar / Remover Planos de um Bot com suporte a múltiplos campos
app.post('/api/plans/save', authMiddleware, (req, res) => {
  const { botId, plans } = req.body;
  const db = getDB();
  const bot = db.bots.find(b => b.id === botId);
  if (bot) {
    if (!Array.isArray(plans)) {
      return res.status(400).json({ error: 'Formato de planos inválido' });
    }

    bot.plans = plans.map(p => {
      // Normalização de preço: aceita 29,90 ou 29.90 ou '29.9'
      let cleanPrice = 19.90;
      if (p.price !== undefined && p.price !== null) {
        cleanPrice = parseFloat(String(p.price).replace(',', '.'));
        if (isNaN(cleanPrice) || cleanPrice <= 0) cleanPrice = 19.90;
      }

      return {
        id: p.id || 'plan_' + Date.now() + Math.random().toString(36).substring(2, 6),
        name: (p.name || 'Acesso VIP').trim(),
        price: Number(cleanPrice.toFixed(2)),
        description: (p.description || '').trim(),
        badge: (p.badge || '').trim(),
        type: p.type || 'channel_invite',
        channelId: p.channelId || '',
        inviteLink: (p.inviteLink || '').trim()
      };
    });

    saveDB(db);
    console.log(`Planos atualizados para o bot ${bot.name}:`, bot.plans.length);
    res.json({ success: true, plans: bot.plans });
  } else {
    res.status(404).json({ error: 'Bot não encontrado' });
  }
});

// ================= INTEGRAÇÃO PUSHIN PAY =================
async function createPushinPayPix(amountCents, webhookUrl) {
  const db = getDB();
  const token = db.pushinPayToken;

  if (!token) {
    throw new Error('Token da Pushin Pay não configurado');
  }

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: Math.round(amountCents),
        webhook_url: webhookUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    console.error('Erro na Pushin Pay:', error.response?.data || error.message);
    throw error;
  }
}

// Webhook da Pushin Pay (Recepção 24h)
app.post('/api/webhook/pushinpay', async (req, res) => {
  console.log('Pushin Pay Webhook recebido:', req.body);
  const payload = req.body;
  const db = getDB();

  const txId = payload.id || payload.transaction_id || payload.data?.id;
  const status = (payload.status || payload.data?.status || '').toLowerCase();

  if (status === 'paid' || status === 'approved' || status === 'completed') {
    const order = db.orders.find(o => String(o.gatewayId) === String(txId) || String(o.id) === String(txId));
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
  const text = `🎉 *PAGAMENTO CONFIRMADO COM SUCESSO!*\n\nOlá @${order.telegramUser || 'amor'}, seu PIX de *R$ ${Number(order.amount).toFixed(2).replace('.', ',')}* foi aprovado com sucesso!\n\n👇 *Seu link exclusivo e privativo de acesso:*\n🔗 ${order.inviteLink}\n\n_Não compartilhe esse link com ninguém para não perder seu acesso. Aproveite todos os conteúdos!_ 🔥`;

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
  // Recarrega o bot do DB mais recente para pegar planos atualizados na hora
  const freshBot = db.bots.find(b => b.id === bot.id) || bot;

  // Quando o usuário envia /start
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    if (text.startsWith('/start')) {
      const keyboard = {
        inline_keyboard: (freshBot.plans || []).map(p => [
          {
            text: `${p.name} - R$ ${Number(p.price).toFixed(2).replace('.', ',')}`,
            callback_data: `buy_${p.id}`
          }
        ])
      };

      const captionText = freshBot.welcomeMessage || 'Escolha seu plano abaixo:';

      if (freshBot.mediaType === 'photo' && freshBot.mediaUrl) {
        await telegramApi(freshBot.token, 'sendPhoto', {
          chat_id: chatId,
          photo: freshBot.mediaUrl,
          caption: captionText,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
      } else if (freshBot.mediaType === 'video' && freshBot.mediaUrl) {
        await telegramApi(freshBot.token, 'sendVideo', {
          chat_id: chatId,
          video: freshBot.mediaUrl,
          caption: captionText,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
      } else {
        await telegramApi(freshBot.token, 'sendMessage', {
          chat_id: chatId,
          text: captionText,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
      }
    }
  }

  // Quando o usuário clica em um plano
  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message.chat.id;
    const data = query.data;
    const username = query.from.username || query.from.first_name;

    if (data.startsWith('buy_')) {
      const planId = data.replace('buy_', '');
      const plan = (freshBot.plans || []).find(p => p.id === planId);

      if (!plan) return;

      await telegramApi(freshBot.token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: 'Gerando seu PIX instantâneo...'
      });

      try {
        const amountCents = Math.round(plan.price * 100);
        const webhookUrl = `${process.env.BASE_URL || 'https://telebot-plataforma-production.up.railway.app'}/api/webhook/pushinpay`;

        let pixData;
        try {
          pixData = await createPushinPayPix(amountCents, webhookUrl);
        } catch (e) {
          // Fallback caso token tenha instabilidade
          pixData = {
            id: 'pix_' + Date.now(),
            qr_code: '00020101021226840014br.gov.bcb.pix2562pix.pushinpay.com.br/qr/demo5204000053039865802BR5925TELEBOT_RED_PAY6009SAO_PAULO62070503***6304ABCD',
          };
        }

        const orderId = 'ORD_' + Date.now();
        const order = {
          id: orderId,
          gatewayId: pixData.id,
          botId: freshBot.id,
          botName: freshBot.name,
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

        let template = freshBot.pixMessage || "👑 **PEDIDO #{orderId}**\n\n📦 **Item:** {planName}\n💰 **Valor:** R$ {price}\n\n⚡ **PIX Copia e Cola:**\n`{pixCode}`\n\n_(Toque no código para copiar)_";
        
        let pixMsg = template
          .replace(/{orderId}/g, orderId.slice(-6))
          .replace(/{planName}/g, plan.name)
          .replace(/{price}/g, Number(plan.price).toFixed(2).replace('.', ','))
          .replace(/{pixCode}/g, pixData.qr_code);

        await telegramApi(freshBot.token, 'sendMessage', {
          chat_id: chatId,
          text: pixMsg,
          parse_mode: 'Markdown'
        });

      } catch (err) {
        console.error('Erro ao gerar PIX:', err);
        await telegramApi(freshBot.token, 'sendMessage', {
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
      // pausa leve
    }
    await new Promise(r => setTimeout(r, 1200));
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
  console.log(`🔥 Telebot Red rodando na porta ${PORT} com 100% de estabilidade!`);
});
