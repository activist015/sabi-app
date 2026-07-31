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

serve(async () => {
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "open")
    .lte("close_time", oneHourFromNow)
    .eq("notified_closing_soon", false);

  for (const m of markets || []) {
    const { data: bettors } = await supabase
      .from("bets")
      .select("user_id, users(telegram_id)")
      .eq("market_id", m.id);

    const seen = new Set();
    for (const b of bettors || []) {
      const tgId = b.users?.telegram_id;
      if (tgId && !seen.has(tgId)) {
        seen.add(tgId);
        await sendMessage(tgId, `⏰ "${m.title}" closes in under an hour — get your bet in!`);
      }
    }
    await supabase.from("markets").update({ notified_closing_soon: true }).eq("id", m.id);
  }

  return new Response("OK");
});