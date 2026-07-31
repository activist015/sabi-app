import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

serve(async (req) => {
  const payload = await req.json();

  if (payload.table === "markets" && payload.type === "INSERT") {
    const market = payload.record;
    const { data: users } = await supabase.from("users").select("telegram_id");
    for (const u of users || []) {
      await sendMessage(u.telegram_id, `🆕 New market: "${market.title}"\nCategory: ${market.category}\nOpen Sabi to place your bet.`);
    }
  }

  if (payload.table === "bets" && payload.type === "UPDATE") {
    const bet = payload.record;
    const old = payload.old_record;
    if (old.status === "active" && bet.status === "won") {
      const { data: user } = await supabase.from("users").select("telegram_id").eq("id", bet.user_id).single();
      if (user) {
        await sendMessage(user.telegram_id, `🎉 You won ₦${bet.payout_amount}! Check Sabi for details.`);
      }
    }
  }

  return new Response("OK");
});