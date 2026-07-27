import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const GREEN = "#00E676";
const DARK = "#0E1116";

const CATEGORY_GROUPS = {
  Sport: ["football", "basketball", "chess", "badminton"],
  Politics: ["politics"],
  National: ["national"],
  Global: ["global"],
};

function App() {
  const [name, setName] = useState("friend");
  const [userId, setUserId] = useState(null);
  const [balance, setBalance] = useState(0);
  const [markets, setMarkets] = useState([]);
  const [trendingIds, setTrendingIds] = useState([]);
  const [activeTab, setActiveTab] = useState("Trending");
  const [activeSub, setActiveSub] = useState("All");
  const [betSheet, setBetSheet] = useState(null);
  const [stakeInput, setStakeInput] = useState("");
  const [view, setView] = useState("markets"); // "markets" | "profile" | "leaderboard"
  const [profile, setProfile] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [openComments, setOpenComments] = useState(null);
  const [commentsByMarket, setCommentsByMarket] = useState({});
  const [commentInput, setCommentInput] = useState("");

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

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentBets } = await supabase
        .from("bets").select("market_id, amount").gte("placed_at", since);

      const totals = {};
      (recentBets || []).forEach((b) => {
        totals[b.market_id] = (totals[b.market_id] || 0) + Number(b.amount);
      });
      const top = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);
      setTrendingIds(top);
    }
    setup();
  }, []);

  async function loadProfile() {
    const { data } = await supabase.from("users").select("*").eq("id", userId).single();
    setProfile(data);
  }

  async function loadLeaderboard() {
    const { data } = await supabase
      .from("users")
      .select("first_name, win_rate, total_profit, best_streak")
      .not("win_rate", "is", null)
      .order("total_profit", { ascending: false })
      .limit(10);
    setLeaderboard(data || []);
  }

  async function loadComments(marketId) {
    const { data } = await supabase
      .from("comments")
      .select("*, users(first_name)")
      .eq("market_id", marketId)
      .order("created_at", { ascending: true });
    setCommentsByMarket((prev) => ({ ...prev, [marketId]: data || [] }));
  }

  function toggleComments(marketId) {
    if (openComments === marketId) setOpenComments(null);
    else { setOpenComments(marketId); loadComments(marketId); }
  }

  async function postComment(marketId) {
    if (!commentInput.trim()) return;
    const { error } = await supabase.from("comments").insert({
      market_id: marketId, user_id: userId, content: commentInput.trim(),
    });
    if (error) return alert(error.message);
    setCommentInput("");
    loadComments(marketId);
  }

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

  function estimatePayout() {
    if (!betSheet || !stakeInput) return 0;
    const market = markets.find((m) => m.id === betSheet.marketId);
    if (!market) return 0;

    const amount = Number(stakeInput);
    if (!amount || amount <= 0) return 0;

    const otherOptionsTotal = market.options
      .filter((o) => o.id !== betSheet.optionId)
      .reduce((s, o) => s + Number(o.total_staked), 0);
    const chosenOptionTotal = Number(
      market.options.find((o) => o.id === betSheet.optionId)?.total_staked || 0
    );

    const newWinningTotal = chosenOptionTotal + amount;
    const newTotalPool = chosenOptionTotal + otherOptionsTotal + amount;
    const payoutPool = newTotalPool * (1 - market.rake_percent / 100);

    return (amount / newWinningTotal) * payoutPool;
  }

  let visibleMarkets = markets;
  if (activeTab === "Trending") {
    visibleMarkets = markets
      .filter((m) => trendingIds.includes(m.id))
      .sort((a, b) => trendingIds.indexOf(a.id) - trendingIds.indexOf(b.id));
  } else {
    const allowedCategories = CATEGORY_GROUPS[activeTab] || [];
    visibleMarkets = markets.filter((m) => allowedCategories.includes(m.category));
    if (activeSub !== "All") {
      visibleMarkets = visibleMarkets.filter((m) => m.category === activeSub.toLowerCase());
    }
  }

  const subChips = CATEGORY_GROUPS[activeTab];

  return (
    <div style={{ background: DARK, minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif", paddingBottom: "4rem" }}>
      <div style={{ padding: "1.5rem 1.25rem 0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1.4rem", color: GREEN }}>●</span>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1.4rem" }}>Sabi</span>
        </div>
        <p style={{ color: "#8A9099", margin: "0.5rem 0 0", fontSize: "0.95rem" }}>
          Hello, {name} · <span style={{ color: GREEN, fontWeight: 600 }}>₦{balance.toLocaleString()}</span>
        </p>
      </div>

      {view === "markets" && (
        <>
          <div style={{ display: "flex", gap: "0.5rem", padding: "0.75rem 1.25rem 0", overflowX: "auto" }}>
            {["Trending", ...Object.keys(CATEGORY_GROUPS)].map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setActiveSub("All"); }}
                style={{
                  padding: "0.45rem 0.9rem", borderRadius: "20px", whiteSpace: "nowrap",
                  border: `1px solid ${activeTab === tab ? GREEN : "#3A3F47"}`,
                  background: activeTab === tab ? GREEN : "transparent",
                  color: activeTab === tab ? DARK : "#D6D9DE",
                  fontWeight: 600, fontSize: "0.85rem",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {subChips && subChips.length > 1 && (
            <div style={{ display: "flex", gap: "0.4rem", padding: "0.6rem 1.25rem 0", overflowX: "auto" }}>
              {["All", ...subChips].map((sub) => {
                const label = sub === "All" ? "All" : sub[0].toUpperCase() + sub.slice(1);
                return (
                  <button
                    key={sub}
                    onClick={() => setActiveSub(label)}
                    style={{
                      padding: "0.3rem 0.7rem", borderRadius: "16px", whiteSpace: "nowrap",
                      border: "1px solid #2A2F37",
                      background: activeSub === label ? "#232830" : "transparent",
                      color: activeSub === label ? GREEN : "#8A9099",
                      fontSize: "0.78rem", fontWeight: 500,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ padding: "1rem 1.25rem" }}>
            {visibleMarkets.length === 0 && (
              <p style={{ color: "#6C7280", fontSize: "0.9rem" }}>Nothing here yet.</p>
            )}

            {visibleMarkets.map((m) => {
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

                  <button
                    onClick={() => toggleComments(m.id)}
                    style={{ marginTop: "0.75rem", background: "none", border: "none", color: "#8A9099", fontSize: "0.8rem", padding: 0 }}
                  >
                    💬 {openComments === m.id ? "Hide comments" : "Comments"}
                  </button>

                  {openComments === m.id && (
                    <div style={{ marginTop: "0.6rem" }}>
                      {(commentsByMarket[m.id] || []).map((c) => (
                        <div key={c.id} style={{ marginBottom: "0.5rem" }}>
                          <span style={{ color: GREEN, fontWeight: 600, fontSize: "0.8rem" }}>{c.users?.first_name || "Anon"}:</span>{" "}
                          <span style={{ color: "#D6D9DE", fontSize: "0.85rem" }}>{c.content}</span>
                        </div>
                      ))}
                      {(commentsByMarket[m.id] || []).length === 0 && (
                        <p style={{ color: "#6C7280", fontSize: "0.8rem" }}>No comments yet — be the first.</p>
                      )}
                      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
                        <input
                          value={commentInput}
                          onChange={(e) => setCommentInput(e.target.value)}
                          placeholder="Say something..."
                          style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", fontSize: "0.85rem" }}
                        />
                        <button onClick={() => postComment(m.id)}
                          style={{ padding: "0.5rem 0.8rem", borderRadius: "8px", border: "none", background: GREEN, color: DARK, fontWeight: 700, fontSize: "0.85rem" }}>
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "profile" && profile && (
        <div style={{ padding: "1.5rem 1.25rem 5rem" }}>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.6rem", margin: "0 0 1.5rem" }}>
            {profile.first_name}'s Profile
          </h1>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {[
              { label: "Win Rate", value: `${profile.win_rate || 0}%` },
              { label: "Total Profit", value: `₦${Number(profile.total_profit).toLocaleString()}` },
              { label: "Current Streak", value: profile.current_streak },
              { label: "Best Streak", value: profile.best_streak },
            ].map((stat) => (
              <div key={stat.label} style={{
                background: "#171B21", border: "1px solid #232830", borderRadius: "14px", padding: "1rem",
              }}>
                <p style={{ color: "#6C7280", fontSize: "0.75rem", margin: "0 0 0.3rem", textTransform: "uppercase" }}>
                  {stat.label}
                </p>
                <p style={{ color: GREEN, fontWeight: 700, fontSize: "1.3rem", margin: 0 }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "1.5rem", background: "#171B21", border: "1px solid #232830", borderRadius: "14px", padding: "1rem" }}>
            <p style={{ color: "#6C7280", fontSize: "0.8rem", margin: "0 0 0.3rem" }}>Wallet Balance</p>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem", margin: 0 }}>
              ₦{Number(profile.wallet_balance).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {view === "leaderboard" && (
        <div style={{ padding: "1.5rem 1.25rem 5rem" }}>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.6rem", margin: "0 0 1.5rem" }}>
            Leaderboard
          </h1>
          {leaderboard.map((u, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#171B21", border: "1px solid #232830", borderRadius: "12px", padding: "0.85rem 1rem", marginBottom: "0.6rem" }}>
              <div>
                <span style={{ color: GREEN, fontWeight: 700, marginRight: "0.6rem" }}>#{i + 1}</span>
                <span style={{ fontWeight: 600 }}>{u.first_name}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, color: GREEN, fontWeight: 700 }}>₦{Number(u.total_profit).toLocaleString()}</p>
                <p style={{ margin: 0, color: "#6C7280", fontSize: "0.75rem" }}>{u.win_rate}% win rate</p>
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && <p style={{ color: "#6C7280" }}>No results yet.</p>}
        </div>
      )}

      {betSheet && (
        <div style={{
          position: "fixed", bottom: "3.5rem", left: 0, right: 0, background: "#171B21",
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
              background: "#0E1116", color: "#fff", fontSize: "1rem", marginBottom: "0.5rem", boxSizing: "border-box",
            }}
          />
          {stakeInput > 0 && (
            <p style={{ color: GREEN, fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
              Estimated payout: ₦{estimatePayout().toFixed(0)} (if odds stay the same)
            </p>
          )}
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

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: "#171B21",
        borderTop: "1px solid #232830", display: "flex", padding: "0.6rem 0",
      }}>
        <button
          onClick={() => setView("markets")}
          style={{ flex: 1, background: "none", border: "none", color: view === "markets" ? GREEN : "#8A9099", fontWeight: 600 }}
        >
          Markets
        </button>
        <button
          onClick={() => { setView("leaderboard"); loadLeaderboard(); }}
          style={{ flex: 1, background: "none", border: "none", color: view === "leaderboard" ? GREEN : "#8A9099", fontWeight: 600 }}
        >
          Leaderboard
        </button>
        <button
          onClick={() => { setView("profile"); loadProfile(); }}
          style={{ flex: 1, background: "none", border: "none", color: view === "profile" ? GREEN : "#8A9099", fontWeight: 600 }}
        >
          Profile
        </button>
      </div>
    </div>
  );
}

export default App;