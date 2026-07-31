export default async function handler(req, res) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const update = req.body;

  async function sendMessage(chatId, text, replyMarkup) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    });
  }

  async function answerCallback(callbackId) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId }),
    });
  }

  if (update.message) {
    const chatId = update.message.chat.id;
    const text = update.message.text || "";

    if (text === "/start") {
      await sendMessage(chatId, "Welcome to Sabi 👋\nTap the menu button below to open the app.");
    } else if (text === "/help") {
      await sendMessage(chatId, "What do you need help with?", {
        inline_keyboard: [
          [{ text: "My bet didn't go through", callback_data: "help_bet_failed" }],
          [{ text: "My balance looks wrong", callback_data: "help_balance" }],
          [{ text: "How do payouts work?", callback_data: "help_payout" }],
          [{ text: "How do deposits/withdrawals work?", callback_data: "help_wallet" }],
        ],
      });
    } else if (text === "/support") {
      await sendMessage(chatId, "Need a human? Chat me directly: @defi_activist");
    }
  }

  if (update.callback_query) {
    const chatId = update.callback_query.message.chat.id;
    const data = update.callback_query.data;
    const answers = {
      help_bet_failed: "This usually means your balance was too low, or the market already closed — check the countdown on the market card.",
      help_balance: "Your balance updates instantly after a bet or a resolved market. Check the Profile tab for your latest confirmed balance.",
      help_payout: "Winners split the pool based on how much they staked, after a small platform fee. Bigger stake = bigger share.",
      help_wallet: "Deposits and withdrawals are handled manually right now — submit your request in the Wallet tab and it'll be processed within a short window, not instantly.",
    };
    await sendMessage(chatId, answers[data] || "Try /support for direct help.");
    await answerCallback(update.callback_query.id);
  }

  res.status(200).send("OK");
}