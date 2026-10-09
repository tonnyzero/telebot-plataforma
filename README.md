# 🚀 Telebot Red - Plataforma Pessoal de Vendas para Telegram com Pushin Pay

Sistema completo, moderno e pronto para uso, no estilo **Telebot**, com visual dark vermelho e preto. Desenvolvido para gerenciar múltiplos bots do Telegram simultaneamente, gerar cobranças PIX automáticas 24 horas por dia via **Pushin Pay** e entregar acessos/canais VIP na hora.

---

## 📋 Bots Pré-Configurados no Sistema
1. **Luna VIP** (Token: `8952562959:AAHpBiDXWCO03zh9m312FUP9BotLjcB7suQ`)
2. **Bia VIP** (Token: `8985315902:AAGULClOk2H0nXbpQfdbqohaSzNphdpTnU0`)
3. **Talia VIP** (Token: `8806621600:AAFbobZT4OXeLXoD6hL-sunsPrF3oug9AW4`)

**Token Pushin Pay Configurado:** `72093|BuXW4REHPWwyPIPS0a8OChHAmHAxUgTSx0Ha1IPQ18789bd6`

---

## ⚙️ Como Colocar os Bots como Administradores dos Seus Canais/Grupos

Para que o bot funcione e os compradores recebam acesso aos seus conteúdos:
1. Abra o seu Canal ou Grupo VIP no Telegram.
2. Vá em **Configurações do Canal** > **Administradores** > **Adicionar Administrador**.
3. Pesquise pelo `@` do bot (da Luna, Bia ou Talia).
4. Dê permissão de **Convidar Usuários via Link** (Invite Users via Link) e **Salvar**.
5. No painel web do **Telebot Red**, vá na aba **Planos & Produtos** e cole o link de convite do canal correspondente.

---

## 🌐 Como Hospedar Gratuitamente e com 1 Clique (Método Recomendado: Railway ou Render)

Como você não tem conhecimento prévio em programação, a maneira mais fácil e segura do mundo de colocar esse sistema no ar 24h por dia é usando o **Railway**:

### Passo 1: Criar Conta no GitHub e Railway
1. Acesse [github.com](https://github.com) e crie uma conta gratuita (caso ainda não tenha).
2. Crie um repositório chamado `telebot-red`.
3. Faça o upload de todos os arquivos desta pasta para lá.
4. Acesse [railway.app](https://railway.app) e entre com sua conta do GitHub.

### Passo 2: Subir a Aplicação no Railway
1. No painel do Railway, clique no botão **New Project** > **Deploy from GitHub repo**.
2. Selecione o repositório `telebot-red`.
3. O Railway vai detectar o projeto automaticamente e iniciar a hospedagem!
4. Vá na aba **Settings** do seu serviço no Railway, role até **Networking** e clique em **Generate Domain**.
5. Pronto! Você receberá uma URL com HTTPS seguro (ex: `https://telebot-red-production.up.railway.app`).

### Passo 3: Configurar o Webhook na Pushin Pay
1. Copie o endereço do seu site (ex: `https://telebot-red-production.up.railway.app`).
2. Acesse a sua conta na **Pushin Pay** > **Integrações** / **Webhooks**.
3. No campo de Webhook URL, cole:
   `https://telebot-red-production.up.railway.app/api/webhook/pushinpay`
4. Salve. Pronto! Agora qualquer PIX gerado e pago será reconhecido em 2 segundos e seu cliente receberá o acesso imediatamente no Telegram.

---

## 💻 Como Rodar no Computador (Se preferir testar localmente)

1. Instale o **Node.js** (baixando em nodejs.org).
2. Abra a pasta do projeto no Prompt de Comando (CMD) ou Terminal.
3. Digite:
   ```bash
   npm install
   npm start
   ```
4. Abra seu navegador em: `http://localhost:3000`
