import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function App() {
  const [name, setName] = useState("friend");
  const [userId, setUserId] = useState(null);
  const [balance, setBalance] = useState(0);
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    let telegramUser = null;
    if (tg) {
      tg.ready();
      tg.expand();
      telegramUser = tg.initDataUnsafe?.user;
      if (telegramUser?.first_name) setName(telegramUser.first_name);
    }

    async function setup() {
      if (telegramUser) {
        const { data: existing } = await supabase
          .from("users")
          .select("*")
          .eq("telegram_id", telegramUser.id)
          .maybeSingle();

        let userRow = existing;
        if (!userRow) {
          const { data: inserted, error } = await supabase
            .from("users")
            .insert({ telegram_id: telegramUser.id, first_name: telegramUser.first_name })
            .select()
            .single();
          if (error) console.error(error);
          userRow = inserted;
        }
        if (userRow) {
          setUserId(userRow.id);
          setBalance(Number(userRow.wallet_balance));
        }
      }

      const { data: marketData, error } = await supabase
        .from("markets")
        .select("*, options(*)")
        .eq("status", "open");
      if (error) console.error(error);
      else setMarkets(marketData);
    }
    setup();
  }, []);

  async function placeBet(optionId, marketId) {
  const amountStr = window.prompt("How much do you want to stake (₦)?");
  const amount = Number(amountStr);
  if (!amount || amount <= 0) return;

  const { error } = await supabase.rpc("place_bet", {
    p_user_id: userId,
    p_market_id: marketId,
    p_option_id: optionId,
    p_amount: amount,
  });

  if (error) return alert(error.message);
  alert("Bet placed!");
  window.location.reload();
}

    await supabase.from("bets").insert({ market_id: marketId, option_id: optionId, user_id: userId, amount });

    const { data: option } = await supabase.from("options").select("total_staked").eq("id", optionId).single();
    await supabase.from("options").update({ total_staked: Number(option.total_staked) + amount }).eq("id", optionId);

    const newBalance = balance - amount;
    await supabase.from("users").update({ wallet_balance: newBalance }).eq("id", userId);
    await supabase.from("transactions").insert({ user_id: userId, type: "bet", amount: -amount, balance_after: newBalance, market_id: marketId });

    setBalance(newBalance);
    alert("Bet placed!");
    window.location.reload();
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1>Hello, {name} 👋</h1>
      <p>Balance: ₦{balance}</p>
      <h2>Open Markets</h2>
      {markets.map((m) => (
        <div key={m.id} style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "1rem", marginBottom: "0.75rem" }}>
          <strong>{m.title}</strong>
          <p style={{ margin: "0.25rem 0", color: "#666" }}>{m.category}</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {m.options.map((o) => (
              <button key={o.id} onClick={() => placeBet(o.id, m.id)}
                style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "1px solid #ccc" }}>
                {o.label} (₦{o.total_staked})
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;