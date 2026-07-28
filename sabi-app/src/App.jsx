import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const GREEN = "#00E676";
const DARK = "#0E1116";
const CARD = "#171B21";
const BORDER = "#232830";
const MUTED = "#6C7280";

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
  const [betSheet, setBetSheet] = useState(null); // { optionId, marketId, label, groupOptions }
  const [stakeInput, setStakeInput] = useState("");
  const [view, setView] = useState("markets");
  const [profile, setProfile] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [detailMarket, setDetailMarket] = useState(null);
  const [detailTab, setDetailTab] = useState("rules");
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
        .from("markets")
        .select("*, options(*), candidates(*, options(*))")
        .eq("status", "open");
      setMarkets(marketData || []);

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentBets } = await supabase
        .from("bets").select("market_id, amount").gte("placed_at", since);
      const totals = {};
      (recentBets || []).forEach((b) => {
        totals[b.market_id] = (totals[b.market_id] || 0) + Number(b.amount);
      });
      const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
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
      .from("users").select("first_name, win_rate, total_profit, best_streak")
      .not("win_rate", "is", null).order("total_profit", { ascending: false }).limit(10);
    setLeaderboard(data || []);
  }

  async function loadComments(marketId) {
    const { data } = await supabase
      .from("comments").select("*, users(first_name)").eq("market_id", marketId)
      .order("created_at", { ascending: true });
    setCommentsByMarket((prev) => ({ ...prev, [marketId]: data || [] }));
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

  function openDetail(m) {
    setDetailMarket(m);
    setDetailTab("rules");
    loadComments(m.id);
  }

  function directOptions(m) {
    return (m.options || []).filter((o) => !o.candidate_id);
  }

  function openBetSheet(optionId, marketId, label, groupOptions) {
    setBetSheet({ optionId, marketId, label, groupOptions });
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
    const amount = Number(stakeInput);
    if (!amount || amount <= 0) return 0;

    const chosen = betSheet.groupOptions.find((o) => o.id === betSheet.optionId);
    const others = betSheet.groupOptions.filter((o) => o.id !== betSheet.optionId);
    const otherTotal = others.reduce((s, o) => s + Number(o.total_staked), 0);
    const chosenTotal = Number(chosen?.total_staked || 0);

    const newWinningTotal = chosenTotal + amount;
    const newTotalPool = chosenTotal + otherTotal + amount;
    // rake_percent lives on the market, look it up via detailMarket or markets list
    const market = markets.find((m) => m.id === betSheet.marketId);
    const rake = market ? Number(market.rake_percent) : 5;
    const payoutPool = newTotalPool * (1 - rake / 100);

    return (amount / newWinningTotal) * payoutPool;
  }

  let visibleMarkets = markets;
  if (activeTab === "Trending") {
    visibleMarkets = markets
      .filter((m) => trendingIds.includes(m.id))
      .sort((a, b) => trendingIds.indexOf(a.id) - trendingIds.indexOf(b.id));
  } else {
    const allowed = CATEGORY_GROUPS[activeTab] || [];
    visibleMarkets = markets.filter((m) => allowed.includes(m.category));
    if (activeSub !== "All") {
      visibleMarkets = visibleMarkets.filter((m) => m.category === activeSub.toLowerCase());
    }
  }
  const subChips = CATEGORY_GROUPS[activeTab];

  function pctFor(yesOpt, noOpt) {
    const total = Number(yesOpt?.total_staked || 0) + Number(noOpt?.total_staked || 0);
    if (total === 0) return 0;
    return Math.round((Number(yesOpt?.total_staked || 0) / total) * 100);
  }

  function candidateOptions(cand) {
    const yes = cand.options.find((o) => o.label === "Yes");
    const no = cand.options.find((o) => o.label === "No");
    return { yes, no };
  }

  return (
    <div style={{ background: DARK, minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif", paddingBottom: "4rem" }}>
      <div style={{ padding: "1.5rem 1.25rem 0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1.4rem", color: GREEN }}>●</span>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1.4rem" }}>Sabi</span>
      </div>
      <div style={{ padding: "0 1.25rem 0.5rem" }}>
        <p style={{ color: "#8A9099", margin: 0, fontSize: "0.95rem" }}>
          Balance <span style={{ color: GREEN, fontWeight: 600 }}>₦{balance.toLocaleString()}</span>
        </p>
      </div>

      {view === "markets" && (
        <>
          <div style={{ display: "flex", gap: "0.5rem", padding: "0.75rem 1.25rem 0", overflowX: "auto" }}>
            {["Trending", ...Object.keys(CATEGORY_GROUPS)].map((tab) => (
              <button key={tab} onClick={() => { setActiveTab(tab); setActiveSub("All"); }}
                style={{
                  padding: "0.45rem 0.9rem", borderRadius: "20px", whiteSpace: "nowrap",
                  border: `1px solid ${activeTab === tab ? GREEN : "#3A3F47"}`,
                  background: activeTab === tab ? GREEN : "transparent",
                  color: activeTab === tab ? DARK : "#D6D9DE", fontWeight: 600, fontSize: "0.85rem",
                }}>
                {tab}
              </button>
            ))}
          </div>

          {subChips && subChips.length > 1 && (
            <div style={{ display: "flex", gap: "0.4rem", padding: "0.6rem 1.25rem 0", overflowX: "auto" }}>
              {["All", ...subChips].map((sub) => {
                const label = sub === "All" ? "All" : sub[0].toUpperCase() + sub.slice(1);
                return (
                  <button key={sub} onClick={() => setActiveSub(label)}
                    style={{
                      padding: "0.3rem 0.7rem", borderRadius: "16px", whiteSpace: "nowrap", border: "1px solid #2A2F37",
                      background: activeSub === label ? "#232830" : "transparent",
                      color: activeSub === label ? GREEN : "#8A9099", fontSize: "0.78rem", fontWeight: 500,
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ padding: "1rem 1.25rem" }}>
            {visibleMarkets.length === 0 && <p style={{ color: MUTED, fontSize: "0.9rem" }}>Nothing here yet.</p>}

            {visibleMarkets.map((m) => {
              if (m.market_type === "multi_candidate") {
                const sorted = [...m.candidates].sort((a, b) => {
                  const totalA = a.options.reduce((s, o) => s + Number(o.total_staked), 0);
                  const totalB = b.options.reduce((s, o) => s + Number(o.total_staked), 0);
                  return totalB - totalA;
                });
                const top2 = sorted.slice(0, 2);
                return (
                  <div key={m.id} style={{ background: CARD, borderRadius: "16px", padding: "1rem", marginBottom: "0.85rem", border: `1px solid ${BORDER}` }}>
                    <div onClick={() => openDetail(m)}>
                      <p style={{ fontWeight: 600, fontSize: "0.98rem", margin: "0 0 0.2rem", lineHeight: 1.35 }}>{m.title}</p>
                      <p style={{ color: MUTED, fontSize: "0.8rem", margin: "0 0 0.85rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                        {m.category} · {m.candidates.length} candidates
                      </p>
                    </div>
                    {top2.map((cand) => {
                      const { yes, no } = candidateOptions(cand);
                      const pct = pctFor(yes, no);
                      return (
                        <div key={cand.id} style={{ marginBottom: "0.6rem" }}>
                          <p style={{ fontSize: "0.85rem", margin: "0 0 0.3rem", color: "#D6D9DE" }}>{cand.name}</p>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button onClick={(e) => { e.stopPropagation(); openBetSheet(yes.id, m.id, `${cand.name} · Yes`, [yes, no]); }}
                              style={{ flex: 1, padding: "0.55rem", borderRadius: "10px", border: `1px solid ${GREEN}`, background: "rgba(0,230,118,0.08)", color: GREEN, fontWeight: 600, fontSize: "0.85rem" }}>
                              Yes · {pct}%
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); openBetSheet(no.id, m.id, `${cand.name} · No`, [yes, no]); }}
                              style={{ flex: 1, padding: "0.55rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "transparent", color: "#D6D9DE", fontWeight: 600, fontSize: "0.85rem" }}>
                              No · {100 - pct}%
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => openDetail(m)} style={{ background: "none", border: "none", color: GREEN, fontSize: "0.8rem", padding: 0, marginTop: "0.3rem" }}>
                      View all {m.candidates.length} candidates →
                    </button>
                  </div>
                );
              }

              // binary market
              const opts = directOptions(m);
              const yes = opts.find((o) => o.label === "Yes");
              const no = opts.find((o) => o.label === "No");
              const pct = pctFor(yes, no);
              return (
                <div key={m.id} style={{ background: CARD, borderRadius: "16px", padding: "1rem", marginBottom: "0.85rem", border: `1px solid ${BORDER}` }}>
                  <div onClick={() => openDetail(m)}>
                    <p style={{ fontWeight: 600, fontSize: "0.98rem", margin: "0 0 0.2rem", lineHeight: 1.35 }}>{m.title}</p>
                    <p style={{ color: MUTED, fontSize: "0.8rem", margin: "0 0 0.85rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>{m.category}</p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={(e) => { e.stopPropagation(); openBetSheet(yes.id, m.id, "Yes", opts); }}
                      style={{ flex: 1, padding: "0.7rem 0.5rem", borderRadius: "10px", border: `1px solid ${GREEN}`, background: "rgba(0,230,118,0.08)", color: GREEN, fontWeight: 600, fontSize: "0.9rem" }}>
                      Yes · {pct}%
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); openBetSheet(no.id, m.id, "No", opts); }}
                      style={{ flex: 1, padding: "0.7rem 0.5rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "transparent", color: "#D6D9DE", fontWeight: 600, fontSize: "0.9rem" }}>
                      No · {100 - pct}%
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "profile" && profile && (
        <div style={{ padding: "1.5rem 1.25rem 5rem" }}>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.6rem", margin: "0 0 1.5rem" }}>{profile.first_name}'s Profile</h1>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {[
              { label: "Win Rate", value: `${profile.win_rate || 0}%` },
              { label: "Total Profit", value: `₦${Number(profile.total_profit).toLocaleString()}` },
              { label: "Current Streak", value: profile.current_streak },
              { label: "Best Streak", value: profile.best_streak },
            ].map((stat) => (
              <div key={stat.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "1rem" }}>
                <p style={{ color: MUTED, fontSize: "0.75rem", margin: "0 0 0.3rem", textTransform: "uppercase" }}>{stat.label}</p>
                <p style={{ color: GREEN, fontWeight: 700, fontSize: "1.3rem", margin: 0 }}>{stat.value}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "1.5rem", background: CARD, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "1rem" }}>
            <p style={{ color: MUTED, fontSize: "0.8rem", margin: "0 0 0.3rem" }}>Wallet Balance</p>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "1.2rem", margin: 0 }}>₦{Number(profile.wallet_balance).toLocaleString()}</p>
          </div>
        </div>
      )}

      {view === "leaderboard" && (
        <div style={{ padding: "1.5rem 1.25rem 5rem" }}>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.6rem", margin: "0 0 1.5rem" }}>Leaderboard</h1>
          {leaderboard.map((u, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "0.85rem 1rem", marginBottom: "0.6rem" }}>
              <div><span style={{ color: GREEN, fontWeight: 700, marginRight: "0.6rem" }}>#{i + 1}</span><span style={{ fontWeight: 600 }}>{u.first_name}</span></div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, color: GREEN, fontWeight: 700 }}>₦{Number(u.total_profit).toLocaleString()}</p>
                <p style={{ margin: 0, color: MUTED, fontSize: "0.75rem" }}>{u.win_rate}% win rate</p>
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && <p style={{ color: MUTED }}>No results yet.</p>}
        </div>
      )}

      {/* DETAIL VIEW OVERLAY */}
      {detailMarket && (
        <div style={{ position: "fixed", inset: 0, background: DARK, zIndex: 20, overflowY: "auto" }}>
          <div style={{ padding: "1.25rem" }}>
            <button onClick={() => setDetailMarket(null)} style={{ background: "none", border: "none", color: "#8A9099", fontSize: "1.3rem", marginBottom: "0.75rem" }}>✕</button>
            <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.3rem", margin: "0 0 0.3rem" }}>{detailMarket.title}</h2>
            <p style={{ color: MUTED, fontSize: "0.8rem", textTransform: "uppercase", margin: "0 0 1rem" }}>{detailMarket.category}</p>

            {detailMarket.market_type === "multi_candidate" ? (
              detailMarket.candidates.map((cand) => {
                const { yes, no } = candidateOptions(cand);
                const pct = pctFor(yes, no);
                return (
                  <div key={cand.id} style={{ marginBottom: "0.75rem" }}>
                    <p style={{ fontSize: "0.9rem", margin: "0 0 0.35rem", fontWeight: 600 }}>{cand.name}</p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button onClick={() => openBetSheet(yes.id, detailMarket.id, `${cand.name} · Yes`, [yes, no])}
                        style={{ flex: 1, padding: "0.6rem", borderRadius: "10px", border: `1px solid ${GREEN}`, background: "rgba(0,230,118,0.08)", color: GREEN, fontWeight: 600 }}>
                        Yes · {pct}%
                      </button>
                      <button onClick={() => openBetSheet(no.id, detailMarket.id, `${cand.name} · No`, [yes, no])}
                        style={{ flex: 1, padding: "0.6rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "transparent", color: "#D6D9DE", fontWeight: 600 }}>
                        No · {100 - pct}%
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              (() => {
                const opts = directOptions(detailMarket);
                const yes = opts.find((o) => o.label === "Yes");
                const no = opts.find((o) => o.label === "No");
                const pct = pctFor(yes, no);
                return (
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                    <button onClick={() => openBetSheet(yes.id, detailMarket.id, "Yes", opts)}
                      style={{ flex: 1, padding: "0.7rem", borderRadius: "10px", border: `1px solid ${GREEN}`, background: "rgba(0,230,118,0.08)", color: GREEN, fontWeight: 600 }}>
                      Yes · {pct}%
                    </button>
                    <button onClick={() => openBetSheet(no.id, detailMarket.id, "No", opts)}
                      style={{ flex: 1, padding: "0.7rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "transparent", color: "#D6D9DE", fontWeight: 600 }}>
                      No · {100 - pct}%
                    </button>
                  </div>
                );
              })()
            )}

            <div style={{ display: "flex", gap: "1rem", margin: "1.25rem 0 0.75rem", borderBottom: `1px solid ${BORDER}` }}>
              {["rules", "context"].map((tab) => (
                <button key={tab} onClick={() => setDetailTab(tab)}
                  style={{
                    background: "none", border: "none", padding: "0.5rem 0",
                    color: detailTab === tab ? GREEN : "#8A9099",
                    borderBottom: detailTab === tab ? `2px solid ${GREEN}` : "2px solid transparent",
                    fontWeight: 600, fontSize: "0.9rem", textTransform: "capitalize",
                  }}>
                  {tab}
                </button>
              ))}
            </div>
            <p style={{ color: "#D6D9DE", fontSize: "0.85rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
              {detailTab === "rules" ? (detailMarket.rules_text || "No rules specified yet.") : (detailMarket.context_text || "No context added yet.")}
            </p>

            <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, marginBottom: "0.75rem" }}>Comments</p>
            {(commentsByMarket[detailMarket.id] || []).map((c) => (
              <div key={c.id} style={{ marginBottom: "0.5rem" }}>
                <span style={{ color: GREEN, fontWeight: 600, fontSize: "0.8rem" }}>{c.users?.first_name || "Anon"}:</span>{" "}
                <span style={{ color: "#D6D9DE", fontSize: "0.85rem" }}>{c.content}</span>
              </div>
            ))}
            {(commentsByMarket[detailMarket.id] || []).length === 0 && (
              <p style={{ color: MUTED, fontSize: "0.8rem" }}>No comments yet — be the first.</p>
            )}
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.75rem" }}>
              <input value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="Say something..."
                style={{ flex: 1, padding: "0.6rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", fontSize: "0.85rem" }} />
              <button onClick={() => postComment(detailMarket.id)}
                style={{ padding: "0.6rem 0.9rem", borderRadius: "8px", border: "none", background: GREEN, color: DARK, fontWeight: 700, fontSize: "0.85rem" }}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {betSheet && (
        <div style={{ position: "fixed", bottom: "3.5rem", left: 0, right: 0, background: CARD, borderTop: `1px solid ${GREEN}`, borderRadius: "20px 20px 0 0", padding: "1.25rem", zIndex: 30 }}>
          <p style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, margin: "0 0 0.75rem" }}>Stake on "{betSheet.label}"</p>
          <input type="number" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} placeholder="Amount in ₦"
            style={{ width: "100%", padding: "0.75rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", fontSize: "1rem", marginBottom: "0.5rem", boxSizing: "border-box" }} />
          {stakeInput > 0 && (
            <p style={{ color: GREEN, fontSize: "0.85rem", margin: "0 0 0.75rem" }}>Estimated payout: ₦{estimatePayout().toFixed(0)} (if odds stay the same)</p>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => setBetSheet(null)} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "transparent", color: "#D6D9DE", fontWeight: 600 }}>Cancel</button>
            <button onClick={confirmBet} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", border: "none", background: GREEN, color: DARK, fontWeight: 700 }}>Confirm</button>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: CARD, borderTop: `1px solid ${BORDER}`, display: "flex", padding: "0.6rem 0", zIndex: 10 }}>
        <button onClick={() => setView("markets")} style={{ flex: 1, background: "none", border: "none", color: view === "markets" ? GREEN : "#8A9099", fontWeight: 600 }}>Markets</button>
        <button onClick={() => { setView("leaderboard"); loadLeaderboard(); }} style={{ flex: 1, background: "none", border: "none", color: view === "leaderboard" ? GREEN : "#8A9099", fontWeight: 600 }}>Leaderboard</button>
        <button onClick={() => { setView("profile"); loadProfile(); }} style={{ flex: 1, background: "none", border: "none", color: view === "profile" ? GREEN : "#8A9099", fontWeight: 600 }}>Profile</button>
      </div>
    </div>
  );
}

export default App;