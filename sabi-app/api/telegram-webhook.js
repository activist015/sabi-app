export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const API = `https://api.telegram.org/bot${TOKEN}`;
  const update = req.body;
  const message = update.message;
  const callback = update.callback_query;

  async function sendMessage(chatId, text, replyMarkup) {
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    });
  }

  if (message?.text === "/help") {
    await sendMessage(message.chat.id, "What do you need help with?", {
      inline_keyboard: [
        [{ text: "Bet not going through", callback_data: "help_bet" }],
        [{ text: "Balance looks wrong", callback_data: "help_balance" }],
        [{ text: "How do payouts work?", callback_data: "help_payout" }],
      ],
    });
  } else if (message?.text === "/support") {
    await sendMessage(message.chat.id, "Need direct help? Message @yourusername and we'll sort it out.");
  } else if (callback) {
    const answers = {
      help_bet: "If a bet won't go through, check your balance is enough and the market hasn't closed yet. Still stuck? Use /support.",
      help_balance: "Balances update after every bet and after a market resolves. If something looks off, tell us the market name via /support.",
      help_payout: "Winners split the pool (minus a small platform fee), based on how much they staked versus everyone else who picked the same outcome.",
    };
    await sendMessage(callback.message.chat.id, answers[callback.data] || "Not sure on that one — try /support.");
    await fetch(`${API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callback.id }),
    });
  }

  res.status(200).send("ok");
}