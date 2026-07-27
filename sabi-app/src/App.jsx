import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const GREEN = "#00E676";
const DARK = "#0E1116";

function App() {
  const [name, setName] = useState("friend");
  const [userId, setUserId] = useState(null);
  const [balance, setBalance] = useState(0);
  const [markets, setMarkets] = useState([]);
  const [betSheet, setBetSheet] = useState(null); // { optionId, marketId, label }
  const [stakeInput, setStakeInput] = useState("");

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
          .from("users").select("*").eq("telegram_id", telegramUser.id).maybeSingle();
        let userRow = existing;
        if (!userRow) {
          const { data: inserted } = await supabase
            .from("users")
            .insert({ telegram_id: telegramUser.id, first_name: telegramUser.first_name })
            .select().single();
          userRow = inserted;
        }
        if (userRow) {
          setUserId(userRow.id);
          setBalance(Number(userRow.wallet_balance));
        }
      }
      const { data: marketData } = await supabase
        .from("markets").select("*, options(*)").eq("status", "open");
      setMarkets(marketData || []);
    }
    setup();
  }, []);

  async function confirmBet() {
    const amount = Number(stakeInput);
    if (!amount || amount <= 0) return;
    const { error } = await supabase.rpc("place_bet", {
      p_user_id: userId,
      p_market_id: betSheet.marketId,
      p_option_id: betSheet.optionId,
      p_amount: amount,
    });
    if (error) return alert(error.message);
    setBetSheet(null);
    setStakeInput("");
    window.location.reload();
  }

  return (
    <div style={{ background: DARK, minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif" }}>
      <div style={{ padding: "1.5rem 1.25rem 0.5rem" }}>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.6rem", margin: 0 }}>
          Hello, {name}
        </h1>
        <p style={{ color: "#8A9099", margin: "0.4rem 0 0", fontSize: "0.95rem" }}>
          Balance <span style={{ color: GREEN, fontWeight: 600 }}>₦{balance.toLocaleString()}</span>
        </p>
      </div>

      <div style={{ padding: "1rem 1.25rem" }}>
        <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1.05rem", margin: "0 0 0.75rem" }}>
          Open Markets
        </p>

        {markets.map((m) => {
          const total = m.options.reduce((s, o) => s + Number(o.total_staked), 0) || 1;
          return (
            <div key={m.id} style={{
              background: "#171B21", borderRadius: "16px", padding: "1rem",
              marginBottom: "0.85rem", border: "1px solid #232830",
            }}>
              <p style={{ fontWeight: 600, fontSize: "0.98rem", margin: "0 0 0.2rem", lineHeight: 1.35 }}>
                {m.title}
              </p>
              <p style={{ color: "#6C7280", fontSize: "0.8rem", margin: "0 0 0.85rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {m.category}
              </p>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                {m.options.map((o) => {
                  const pct = Math.round((Number(o.total_staked) / total) * 100);
                  return (
                    <button
                      key={o.id}
                      onClick={() => setBetSheet({ optionId: o.id, marketId: m.id, label: o.label })}
                      style={{
                        flex: 1, padding: "0.7rem 0.5rem", borderRadius: "10px",
                        border: `1px solid ${o.label === "Yes" ? GREEN : "#3A3F47"}`,
                        background: o.label === "Yes" ? "rgba(0,230,118,0.08)" : "transparent",
                        color: o.label === "Yes" ? GREEN : "#D6D9DE",
                        fontWeight: 600, fontSize: "0.9rem",
                      }}
                    >
                      {o.label} · {pct}%
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {betSheet && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, background: "#171B21",
          borderTop: `1px solid ${GREEN}`, borderRadius: "20px 20px 0 0", padding: "1.25rem",
        }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, margin: "0 0 0.75rem" }}>
            Stake on "{betSheet.label}"
          </p>
          <input
            type="number"
            value={stakeInput}
            onChange={(e) => setStakeInput(e.target.value)}
            placeholder="Amount in ₦"
            style={{
              width: "100%", padding: "0.75rem", borderRadius: "10px", border: "1px solid #3A3F47",
              background: "#0E1116", color: "#fff", fontSize: "1rem", marginBottom: "0.75rem", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => setBetSheet(null)} style={{
              flex: 1, padding: "0.75rem", borderRadius: "10px", border: "1px solid #3A3F47",
              background: "transparent", color: "#D6D9DE", fontWeight: 600,
            }}>Cancel</button>
            <button onClick={confirmBet} style={{
              flex: 1, padding: "0.75rem", borderRadius: "10px", border: "none",
              background: GREEN, color: "#0E1116", fontWeight: 700,
            }}>Confirm</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;