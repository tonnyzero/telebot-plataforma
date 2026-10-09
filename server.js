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

app.post('/api/bots/add', (req, res) => {
  const { name, token, welcomeMessage } = req.body;
  const db = getDB();
  const newBot = {
    id: 'bot_' + Date.now(),
    name,
    token,
    active: true,
    welcomeMessage: welcomeMessage || 'Bem-vindo ao nosso VIP!',
    plans: [
      {
        id: 'plan_' + Date.now(),
        name: 'Acesso VIP',
        price: 29.90,
        description: 'Acesso completo',
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

app.post('/api/plans/update', (req, res) => {
  const { botId, planId, price, inviteLink } = req.body;
  const db = getDB();
  const bot = db.bots.find(b => b.id === botId);
  if (bot) {
    const plan = bot.plans.find(p => p.id === planId);
    if (plan) {
      if (price !== undefined) plan.price = Number(price);
      if (inviteLink !== undefined) plan.inviteLink = inviteLink;
      saveDB(db);
    }
  }
  res.json({ success: true });
});

// ================= INTEGRAÇÃO PUSHIN PAY =================
// Criação de cobrança PIX via Pushin Pay API
async function createPushinPayPix(amountCents, webhookUrl) {
  const db = getDB();
  const token = db.pushinPayToken;

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: amountCents, // Valor em centavos (ex: 2990 para R$ 29,90)
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
    return response.data; // Retorna id, qr_code, qr_code_base64, etc.
  } catch (error) {
    console.error('Erro na Pushin Pay:', error.response?.data || error.message);
    throw error;
  }
}

// Webhook que escuta confirmações da Pushin Pay
app.post('/api/webhook/pushinpay', async (req, res) => {
  console.log('Pushin Pay Webhook recebido:', req.body);
  const payload = req.body;
  const db = getDB();

  // O identificador da transação retornado pela Pushin Pay
  const txId = payload.id || payload.transaction_id || payload.data?.id;
  const status = payload.status || payload.data?.status;

  if (status === 'paid' || status === 'PAID' || status === 'approved') {
    const order = db.orders.find(o => o.gatewayId == txId || o.id == txId);
    if (order && order.status !== 'PAID') {
      order.status = 'PAID';
      order.paidAt = new Date().toISOString();
      saveDB(db);

      // Entregar produto/link ao usuário no Telegram
      const bot = db.bots.find(b => b.id === order.botId);
      if (bot) {
        await deliverProduct(bot, order);
      }
    }
  }

  res.status(200).json({ received: true });
});

// Entrega automática do canal VIP ou conteúdo
async function deliverProduct(bot, order) {
  const text = `🎉 *PAGAMENTO CONFIRMADO!*\n\nOlá @${order.telegramUser || 'amigo'}, seu PIX de *R$ ${Number(order.amount).toFixed(2).replace('.', ',')}* foi aprovado com sucesso!\n\n👇 *Acesse o seu conteúdo exclusivo pelo link abaixo:*\n🔗 ${order.inviteLink}\n\n_Guarde este link com carinho e aproveite os conteúdos!_`;

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

// ================= MOTOR DO TELEGRAM (POLLING / WEBHOOK) =================
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

  // Quando o usuário manda mensagem de texto (ex: /start)
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const username = update.message.from.username || update.message.from.first_name;

    if (text.startsWith('/start')) {
      const keyboard = {
        inline_keyboard: (bot.plans || []).map(p => [
          {
            text: `💎 ${p.name} - R$ ${Number(p.price).toFixed(2).replace('.', ',')}`,
            callback_data: `buy_${p.id}`
          }
        ])
      };

      await telegramApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: bot.welcomeMessage || 'Escolha seu plano:',
        reply_markup: keyboard,
        parse_mode: 'Markdown'
      });
    }
  }

  // Quando o usuário clica em um botão inline
  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message.chat.id;
    const data = query.data;
    const username = query.from.username || query.from.first_name;

    if (data.startsWith('buy_')) {
      const planId = data.replace('buy_', '');
      const plan = (bot.plans || []).find(p => p.id === planId);

      if (!plan) return;

      // Responder o clique do botão
      await telegramApi(bot.token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: 'Gerando seu PIX seguro...'
      });

      // Gerar cobrança na Pushin Pay
      try {
        const amountCents = Math.round(plan.price * 100);
        const webhookUrl = `${process.env.BASE_URL || 'https://seu-dominio.up.railway.app'}/api/webhook/pushinpay`;
        
        let pixData;
        try {
          pixData = await createPushinPayPix(amountCents, webhookUrl);
        } catch (e) {
          // Fallback informativo se token ainda não estiver configurado
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

        // Gerar QR Code imagem para enviar ao usuário
        const qrCodeBuffer = await qrcode.toBuffer(pixData.qr_code, { width: 300 });

        const pixMsg = `👑 *PEDIDO #${orderId.slice(-6)} GERADO COM SUCESSO!*\n\n` +
          `📦 *Item:* ${plan.name}\n` +
          `💰 *Valor:* R$ ${Number(plan.price).toFixed(2).replace('.', ',')}\n\n` +
          `⚡ *Pague via PIX Copia e Cola:* \n` +
          `\`${pixData.qr_code}\`\n\n` +
          `_(Clique no código acima para copiar automaticamente)_\n\n` +
          `⏳ *Liberação Imediata:* Assim que você realizar o pagamento, nosso sistema identificará automaticamente em segundos e enviará seu link VIP aqui!`;

        await telegramApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: pixMsg,
          parse_mode: 'Markdown'
        });

      } catch (err) {
        console.error('Erro ao processar compra:', err);
        await telegramApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: '⚠️ Ocorreu um erro ao gerar a cobrança PIX. Tente novamente em instantes.'
        });
      }
    }
  }
}

// Loop contínuo para cada bot
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
      // aguardar antes de tentar novamente
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

// Inicializar todos os bots configurados
const initialDB = getDB();
if (initialDB.bots) {
  initialDB.bots.forEach(b => startBot(b));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🔥 Telebot Red - Painel Pessoal Rodando!`);
  console.log(`🌐 Acesse o painel em: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
