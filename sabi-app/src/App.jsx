import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const GREEN = "#00E676";
const DARK = "#0E1116";
const CARD = "#171B21";
const BORDER = "#232830";
const MUTED = "#6C7280";
const MIN_WITHDRAWAL = 100;

const CATEGORY_GROUPS = {
  Sport: ["football", "basketball", "chess", "badminton"],
  Politics: ["politics"],
  National: ["national"],
  Global: ["global"],
};

function timeLeft(closeTime) {
  if (!closeTime) return "";
  const diff = new Date(closeTime) - new Date();
  if (diff <= 0) return "Closed";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m left`;
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

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
  const [view, setView] = useState("markets");
  const [profile, setProfile] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [detailMarket, setDetailMarket] = useState(null);
  const [detailTab, setDetailTab] = useState("rules");
  const [commentsByMarket, setCommentsByMarket] = useState({});
  const [commentInput, setCommentInput] = useState("");
  const [onboardStep, setOnboardStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [walletTab, setWalletTab] = useState("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [myDeposits, setMyDeposits] = useState([]);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAccount, setWithdrawAccount] = useState("");
  const [withdrawBank, setWithdrawBank] = useState("");
  const [myWithdrawals, setMyWithdrawals] = useState([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState("create");
  const [newMarketType, setNewMarketType] = useState("binary");
  const [newMarketForm, setNewMarketForm] = useState({ title: "", category: "football", closeTime: "", rules: "", context: "" });
  const [newCandidates, setNewCandidates] = useState([""]);
  const [adminMarkets, setAdminMarkets] = useState([]);
  const [depositRequests, setDepositRequests] = useState([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);

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
          if (!userRow.has_onboarded) setShowOnboarding(true);
        }

        const { data: adminRow } = await supabase
          .from("admins").select("telegram_id").eq("telegram_id", telegramUser.id).maybeSingle();
        if (adminRow) setIsAdmin(true);
      }

      const { data: marketData } = await supabase
        .from("markets")
        .select("*, options(*), candidates(*, options(*))")
        .eq("status", "open");
      setMarkets(marketData || []);

      const openIds = new Set((marketData || []).map((m) => m.id));

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentBets } = await supabase
        .from("bets").select("market_id, amount").gte("placed_at", since);
      const totals = {};
      (recentBets || []).forEach((b) => {
        if (openIds.has(b.market_id)) {
          totals[b.market_id] = (totals[b.market_id] || 0) + Number(b.amount);
        }
      });
      const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
      setTrendingIds(top);
    }
    setup();
  }, []);

  async function finishOnboarding() {
    await supabase.from("users").update({ has_onboarded: true }).eq("id", userId);
    setShowOnboarding(false);
  }

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
    return (m?.options || []).filter((o) => !o.candidate_id);
  }

  function openBetSheet(optionId, marketId, label, groupOptions) {
    if (!optionId) return; // defensive: don't open a bet sheet on a broken option
    setBetSheet({ optionId, marketId, label, groupOptions: groupOptions || [] });
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
    const otherTotal = others.reduce((s, o) => s + Number(o.total_staked || 0), 0);
    const chosenTotal = Number(chosen?.total_staked || 0);

    const newWinningTotal = chosenTotal + amount;
    const newTotalPool = chosenTotal + otherTotal + amount;
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
    const opts = cand?.options || [];
    const yes = opts.find((o) => o.label === "Yes");
    const no = opts.find((o) => o.label === "No");
    return { yes, no };
  }

  function referenceCode() {
    return userId ? `SABI-${userId.slice(0, 4).toUpperCase()}` : "";
  }

  async function loadMyDeposits() {
    const { data } = await supabase.from("deposit_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setMyDeposits(data || []);
  }

  async function submitDeposit() {
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return alert("Enter a valid amount");
    const { error } = await supabase.from("deposit_requests").insert({ user_id: userId, amount, reference_code: referenceCode() });
    if (error) return alert(error.message);
    setDepositAmount("");
    alert("Request submitted — it'll be credited manually once your payment is confirmed, not instantly.");
    loadMyDeposits();
  }

  async function loadMyWithdrawals() {
    const { data } = await supabase.from("withdrawal_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setMyWithdrawals(data || []);
  }

  async function submitWithdrawal() {
    const amount = Number(withdrawAmount);
    if (!amount || amount < MIN_WITHDRAWAL) return alert(`Minimum withdrawal is ₦${MIN_WITHDRAWAL}`);
    if (amount > balance) return alert("You don't have enough balance for that.");
    if (!withdrawAccount.trim() || !withdrawBank.trim()) return alert("Enter your account number and bank name");
    const { error } = await supabase.from("withdrawal_requests").insert({
      user_id: userId, amount, account_number: withdrawAccount.trim(), bank_name: withdrawBank.trim(),
    });
    if (error) return alert(error.message);
    setWithdrawAmount(""); setWithdrawAccount(""); setWithdrawBank("");
    alert("Request submitted — you'll receive it manually once processed, not instantly.");
    loadMyWithdrawals();
  }

  // ---- admin functions ----
  async function createMarket() {
    const { title, category, closeTime, rules, context } = newMarketForm;
    if (!title || !closeTime) return alert("Title and close time are required");

    // convert the datetime-local string using local time correctly, so it doesn't drift by your timezone offset
    const closeTimeIso = new Date(closeTime).toISOString();

    const { data: market, error } = await supabase.from("markets").insert({
      title, category, close_time: closeTimeIso, rules_text: rules, context_text: context, market_type: newMarketType,
    }).select().single();
    if (error) return alert(error.message);

    if (newMarketType === "binary") {
      await supabase.from("options").insert([
        { market_id: market.id, label: "Yes" },
        { market_id: market.id, label: "No" },
      ]);
    } else {
      for (const cname of newCandidates.filter((n) => n.trim())) {
        const { data: cand, error: candErr } = await supabase.from("candidates").insert({ market_id: market.id, name: cname.trim() }).select().single();
        if (candErr || !cand) continue;
        await supabase.from("options").insert([
          { market_id: market.id, candidate_id: cand.id, label: "Yes" },
          { market_id: market.id, candidate_id: cand.id, label: "No" },
        ]);
      }
    }
    alert("Market created!");
    setNewMarketForm({ title: "", category: "football", closeTime: "", rules: "", context: "" });
    setNewCandidates([""]);
    window.location.reload();
  }

  async function loadAdminMarkets() {
    const { data } = await supabase.from("markets").select("*, options(*), candidates(*, options(*))").eq("status", "open");
    setAdminMarkets(data || []);
  }

  async function resolveBinaryAdmin(marketId, optionId) {
    if (!window.confirm("Resolve this market? This pays real money and can't be undone.")) return;
    const { error } = await supabase.rpc("resolve_market", { p_market_id: marketId, p_winning_option_id: optionId });
    if (error) return alert(error.message);
    alert("Resolved!");
    loadAdminMarkets();
  }

  async function resolveMultiCandidateAdmin(marketId, candidateId) {
    if (!window.confirm("Resolve this market? This pays real money and can't be undone.")) return;
    const { error } = await supabase.rpc("resolve_multi_candidate_market", { p_market_id: marketId, p_winning_candidate_id: candidateId });
    if (error) return alert(error.message);
    alert("Resolved!");
    loadAdminMarkets();
  }

  async function loadDepositRequests() {
    const { data } = await supabase.from("deposit_requests").select("*, users(first_name)").eq("status", "pending").order("created_at");
    setDepositRequests(data || []);
  }

  async function creditDeposit(req) {
    if (!window.confirm(`Credit ₦${req.amount} to ${req.users.first_name}?`)) return;
    const { data: user } = await supabase.from("users").select("wallet_balance").eq("id", req.user_id).single();
    const newBalance = Number(user.wallet_balance) + Number(req.amount);
    await supabase.from("users").update({ wallet_balance: newBalance }).eq("id", req.user_id);
    await supabase.from("transactions").insert({ user_id: req.user_id, type: "deposit", amount: req.amount, balance_after: newBalance });
    await supabase.from("deposit_requests").update({ status: "credited" }).eq("id", req.id);
    loadDepositRequests();
  }

  async function loadWithdrawalRequests() {
    const { data } = await supabase.from("withdrawal_requests").select("*, users(first_name)").eq("status", "pending").order("created_at");
    setWithdrawalRequests(data || []);
  }

  async function markWithdrawalPaid(req) {
    if (!window.confirm(`Confirm you've sent ₦${req.amount} to account ${req.account_number}?`)) return;
    const { data: user } = await supabase.from("users").select("wallet_balance").eq("id", req.user_id).single();
    if (Number(user.wallet_balance) < Number(req.amount)) {
      return alert("This user's current balance is lower than this request — check for duplicate/stale requests before approving.");
    }
    const newBalance = Number(user.wallet_balance) - Number(req.amount);
    await supabase.from("users").update({ wallet_balance: newBalance }).eq("id", req.user_id);
    await supabase.from("transactions").insert({ user_id: req.user_id, type: "withdrawal", amount: -req.amount, balance_after: newBalance, market_id: null });
    await supabase.from("withdrawal_requests").update({ status: "paid" }).eq("id", req.id);
    loadWithdrawalRequests();
  }

  return (
    <div style={{ background: DARK, minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif", paddingBottom: "4rem" }}>
      <div style={{ padding: "1.5rem 1.25rem 0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <svg width="26" height="26" viewBox="0 0 512 512" fill="none">
          <path d="M 190 165 C 190 130, 250 125, 290 150 C 325 172, 325 205, 290 225 C 250 247, 250 280, 290 302 C 325 322, 325 355, 285 372"
            stroke="#00E676" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="352" cy="150" r="26" fill="#00E676"/>
        </svg>
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
                const candidates = m.candidates || [];
                const sorted = [...candidates].sort((a, b) => {
                  const totalA = (a.options || []).reduce((s, o) => s + Number(o.total_staked || 0), 0);
                  const totalB = (b.options || []).reduce((s, o) => s + Number(o.total_staked || 0), 0);
                  return totalB - totalA;
                });
                const top2 = sorted.slice(0, 2);
                return (
                  <div key={m.id} style={{ background: CARD, borderRadius: "16px", padding: "1rem", marginBottom: "0.85rem", border: `1px solid ${BORDER}` }}>
                    <div onClick={() => openDetail(m)}>
                      <p style={{ fontWeight: 600, fontSize: "0.98rem", margin: "0 0 0.2rem", lineHeight: 1.35 }}>{m.title}</p>
                      <p style={{ color: MUTED, fontSize: "0.8rem", margin: "0 0 0.4rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                        {m.category} · {candidates.length} contenders
                      </p>
                      <p style={{ color: "#8A9099", fontSize: "0.75rem", margin: "0 0 0.6rem" }}>⏱ {timeLeft(m.close_time)}</p>
                    </div>
                    {top2.map((cand) => {
                      const { yes, no } = candidateOptions(cand);
                      if (!yes || !no) return null; // skip candidates with broken/missing options instead of crashing
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
                      View all {candidates.length} contenders →
                    </button>
                  </div>
                );
              }

              const opts = directOptions(m);
              const yes = opts.find((o) => o.label === "Yes");
              const no = opts.find((o) => o.label === "No");
              if (!yes || !no) return null; // skip malformed binary markets instead of crashing
              const pct = pctFor(yes, no);
              return (
                <div key={m.id} style={{ background: CARD, borderRadius: "16px", padding: "1rem", marginBottom: "0.85rem", border: `1px solid ${BORDER}` }}>
                  <div onClick={() => openDetail(m)}>
                    <p style={{ fontWeight: 600, fontSize: "0.98rem", margin: "0 0 0.2rem", lineHeight: 1.35 }}>{m.title}</p>
                    <p style={{ color: MUTED, fontSize: "0.8rem", margin: "0 0 0.4rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>{m.category}</p>
                    <p style={{ color: "#8A9099", fontSize: "0.75rem", margin: "0 0 0.6rem" }}>⏱ {timeLeft(m.close_time)}</p>
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

      {view === "wallet" && (
        <div style={{ padding: "1.5rem 1.25rem 5rem" }}>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.6rem", margin: "0 0 1rem" }}>Wallet</h1>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "1rem", marginBottom: "1.25rem" }}>
            <p style={{ color: MUTED, fontSize: "0.8rem", margin: "0 0 0.3rem" }}>Balance</p>
            <p style={{ color: GREEN, fontWeight: 700, fontSize: "1.3rem", margin: 0 }}>₦{balance.toLocaleString()}</p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            {["deposit", "withdraw"].map((t) => (
              <button key={t} onClick={() => setWalletTab(t)}
                style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: `1px solid ${walletTab === t ? GREEN : "#3A3F47"}`,
                  background: walletTab === t ? "rgba(0,230,118,0.08)" : "transparent",
                  color: walletTab === t ? GREEN : "#D6D9DE", fontWeight: 600, textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>

          {walletTab === "deposit" && (
            <div>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "1rem", marginBottom: "1rem" }}>
                <p style={{ margin: "0 0 0.4rem", fontSize: "0.85rem", color: "#D6D9DE" }}>
                  Send to: <strong>[Your bank name]</strong> · <strong>[Your account number]</strong>
                </p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: GREEN }}>
                  Include this code in your transfer note: <strong>{referenceCode()}</strong>
                </p>
              </div>
              <p style={{ color: MUTED, fontSize: "0.78rem", marginBottom: "0.75rem" }}>
                ⚠️ Deposits are credited manually — your balance won't update instantly after sending money.
              </p>
              <input type="number" placeholder="Amount sent (₦)" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", marginBottom: "0.6rem", boxSizing: "border-box" }} />
              <button onClick={submitDeposit} style={{ width: "100%", padding: "0.75rem", borderRadius: "10px", border: "none", background: GREEN, color: DARK, fontWeight: 700 }}>
                I've Sent It
              </button>

              <p style={{ fontWeight: 600, margin: "1.5rem 0 0.6rem" }}>Your Requests</p>
              {myDeposits.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "0.7rem 0.9rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem" }}>₦{r.amount}</span>
                  <span style={{ fontSize: "0.8rem", color: r.status === "credited" ? GREEN : r.status === "rejected" ? "#FF5C5C" : "#8A9099" }}>{r.status}</span>
                </div>
              ))}
              {myDeposits.length === 0 && <p style={{ color: MUTED, fontSize: "0.85rem" }}>No requests yet.</p>}
            </div>
          )}

          {walletTab === "withdraw" && (
            <div>
              <input type="number" placeholder="Amount to withdraw (₦)" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", marginBottom: "0.6rem", boxSizing: "border-box" }} />
              <input placeholder="Account number" value={withdrawAccount} onChange={(e) => setWithdrawAccount(e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", marginBottom: "0.6rem", boxSizing: "border-box" }} />
              <input placeholder="Bank name" value={withdrawBank} onChange={(e) => setWithdrawBank(e.target.value)}
                style={{ width: "100%", padding: "0.7rem", borderRadius: "10px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", marginBottom: "0.6rem", boxSizing: "border-box" }} />
              <p style={{ color: MUTED, fontSize: "0.78rem", marginBottom: "0.6rem" }}>
                ⚠️ Withdrawals are paid out manually — it won't arrive instantly. Minimum ₦{MIN_WITHDRAWAL}.
              </p>
              <button onClick={submitWithdrawal} style={{ width: "100%", padding: "0.75rem", borderRadius: "10px", border: "none", background: GREEN, color: DARK, fontWeight: 700 }}>
                Request Withdrawal
              </button>

              <p style={{ fontWeight: 600, margin: "1.5rem 0 0.6rem" }}>Your Requests</p>
              {myWithdrawals.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", background: CARD, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "0.7rem 0.9rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem" }}>₦{r.amount}</span>
                  <span style={{ fontSize: "0.8rem", color: r.status === "paid" ? GREEN : r.status === "rejected" ? "#FF5C5C" : "#8A9099" }}>{r.status}</span>
                </div>
              ))}
              {myWithdrawals.length === 0 && <p style={{ color: MUTED, fontSize: "0.85rem" }}>No requests yet.</p>}
            </div>
          )}
        </div>
      )}

      {view === "admin" && (
        <div style={{ padding: "1.5rem 1.25rem 5rem" }}>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.6rem", margin: "0 0 1rem" }}>Admin</h1>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", overflowX: "auto" }}>
            {["create", "resolve", "deposits", "withdrawals"].map((t) => (
              <button key={t} onClick={() => setAdminTab(t)}
                style={{ padding: "0.4rem 0.8rem", borderRadius: "16px", whiteSpace: "nowrap",
                  border: `1px solid ${adminTab === t ? GREEN : "#3A3F47"}`,
                  background: adminTab === t ? GREEN : "transparent",
                  color: adminTab === t ? DARK : "#D6D9DE", fontWeight: 600, fontSize: "0.8rem", textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>

          {adminTab === "create" && (
            <div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                {["binary", "multi_candidate"].map((t) => (
                  <button key={t} onClick={() => setNewMarketType(t)}
                    style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: `1px solid ${newMarketType === t ? GREEN : "#3A3F47"}`,
                      background: newMarketType === t ? "rgba(0,230,118,0.08)" : "transparent", color: newMarketType === t ? GREEN : "#D6D9DE" }}>
                    {t === "binary" ? "Yes/No" : "Multiple Contenders"}
                  </button>
                ))}
              </div>
              <input placeholder="Title" value={newMarketForm.title}
                onChange={(e) => setNewMarketForm({ ...newMarketForm, title: e.target.value })}
                style={{ width: "100%", padding: "0.6rem", marginBottom: "0.5rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", boxSizing: "border-box" }} />
              <select value={newMarketForm.category} onChange={(e) => setNewMarketForm({ ...newMarketForm, category: e.target.value })}
                style={{ width: "100%", padding: "0.6rem", marginBottom: "0.5rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff" }}>
                {["football","basketball","chess","badminton","politics","national","global"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="datetime-local" value={newMarketForm.closeTime}
                onChange={(e) => setNewMarketForm({ ...newMarketForm, closeTime: e.target.value })}
                style={{ width: "100%", padding: "0.6rem", marginBottom: "0.5rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", boxSizing: "border-box" }} />
              <textarea placeholder="Rules" value={newMarketForm.rules}
                onChange={(e) => setNewMarketForm({ ...newMarketForm, rules: e.target.value })}
                style={{ width: "100%", padding: "0.6rem", marginBottom: "0.5rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", boxSizing: "border-box" }} />
              <textarea placeholder="Context" value={newMarketForm.context}
                onChange={(e) => setNewMarketForm({ ...newMarketForm, context: e.target.value })}
                style={{ width: "100%", padding: "0.6rem", marginBottom: "0.5rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", boxSizing: "border-box" }} />

              {newMarketType === "multi_candidate" && (
                <div style={{ marginBottom: "0.5rem" }}>
                  {newCandidates.map((c, i) => (
                    <input key={i} placeholder={`Contender ${i + 1}`} value={c}
                      onChange={(e) => { const arr = [...newCandidates]; arr[i] = e.target.value; setNewCandidates(arr); }}
                      style={{ width: "100%", padding: "0.6rem", marginBottom: "0.4rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "#0E1116", color: "#fff", boxSizing: "border-box" }} />
                  ))}
                  <button onClick={() => setNewCandidates([...newCandidates, ""])}
                    style={{ background: "none", border: "none", color: GREEN, padding: 0 }}>+ Add contender</button>
                </div>
              )}
              <button onClick={createMarket} style={{ width: "100%", padding: "0.75rem", borderRadius: "10px", border: "none", background: GREEN, color: DARK, fontWeight: 700, marginTop: "0.5rem" }}>
                Create Market
              </button>
            </div>
          )}

          {adminTab === "resolve" && adminMarkets.map((m) => (
            <div key={m.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "0.9rem", marginBottom: "0.7rem" }}>
              <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{m.title}</p>
              {m.market_type === "binary" ? (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {(m.options || []).filter(o => !o.candidate_id).map((o) => (
                    <button key={o.id} onClick={() => resolveBinaryAdmin(m.id, o.id)}
                      style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "transparent", color: "#D6D9DE" }}>
                      {o.label} wins
                    </button>
                  ))}
                </div>
              ) : (
                (m.candidates || []).map((c) => (
                  <button key={c.id} onClick={() => resolveMultiCandidateAdmin(m.id, c.id)}
                    style={{ display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.3rem", borderRadius: "8px", border: "1px solid #3A3F47", background: "transparent", color: "#D6D9DE", textAlign: "left" }}>
                    {c.name} wins
                  </button>
                ))
              )}
            </div>
          ))}

          {adminTab === "deposits" && depositRequests.map((r) => (
            <div key={r.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "0.9rem", marginBottom: "0.7rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><p style={{ margin: 0, fontWeight: 600 }}>{r.users?.first_name}</p><p style={{ margin: 0, color: MUTED, fontSize: "0.8rem" }}>Ref: {r.reference_code} · ₦{r.amount}</p></div>
              <button onClick={() => creditDeposit(r)} style={{ padding: "0.5rem 0.8rem", borderRadius: "8px", border: "none", background: GREEN, color: DARK, fontWeight: 700 }}>Credit</button>
            </div>
          ))}
          {adminTab === "deposits" && depositRequests.length === 0 && <p style={{ color: MUTED }}>No pending deposits.</p>}

          {adminTab === "withdrawals" && withdrawalRequests.map((r) => (
            <div key={r.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "0.9rem", marginBottom: "0.7rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><p style={{ margin: 0, fontWeight: 600 }}>{r.users?.first_name}</p><p style={{ margin: 0, color: MUTED, fontSize: "0.8rem" }}>{r.bank_name} · {r.account_number} · ₦{r.amount}</p></div>
              <button onClick={() => markWithdrawalPaid(r)} style={{ padding: "0.5rem 0.8rem", borderRadius: "8px", border: "none", background: GREEN, color: DARK, fontWeight: 700 }}>Mark Paid</button>
            </div>
          ))}
          {adminTab === "withdrawals" && withdrawalRequests.length === 0 && <p style={{ color: MUTED }}>No pending withdrawals.</p>}
        </div>
      )}

      {detailMarket && (
        <div style={{ position: "fixed", inset: 0, background: DARK, zIndex: 20, overflowY: "auto" }}>
          <div style={{ padding: "1.25rem" }}>
            <button onClick={() => setDetailMarket(null)} style={{ background: "none", border: "none", color: "#8A9099", fontSize: "1.3rem", marginBottom: "0.75rem" }}>✕</button>
            <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.3rem", margin: "0 0 0.3rem" }}>{detailMarket.title}</h2>
            <p style={{ color: MUTED, fontSize: "0.8rem", textTransform: "uppercase", margin: "0 0 0.4rem" }}>{detailMarket.category}</p>
            <p style={{ color: "#8A9099", fontSize: "0.8rem", margin: "0 0 1rem" }}>⏱ {timeLeft(detailMarket.close_time)}</p>

            {detailMarket.market_type === "multi_candidate" ? (
              (detailMarket.candidates || []).map((cand) => {
                const { yes, no } = candidateOptions(cand);
                if (!yes || !no) return null;
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
                if (!yes || !no) return <p style={{ color: MUTED }}>This market's options are missing.</p>;
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

      {showOnboarding && (
        <div style={{ position: "fixed", inset: 0, background: DARK, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "2rem 1.5rem" }}>
          <div>
            {[
              { title: "Predict what happens on campus", body: "Bet on FUL football, chess, SUG elections, and more — whoever calls it right wins the pool." },
              { title: "Your stake decides your share", body: "Winners split the pool based on how much they put in. The more people bet the wrong way, the bigger your payout." },
              { title: "Deposits & withdrawals are manual for now", body: "Send money to fund your wallet, and we'll credit it by hand. Withdrawals work the same way — just give us a bit of time." },
            ].map((slide, i) => (
              onboardStep === i && (
                <div key={i}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(0,230,118,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2rem" }}>
                    <span style={{ color: GREEN, fontSize: "1.6rem", fontWeight: 700 }}>{i + 1}</span>
                  </div>
                  <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "1.5rem", marginBottom: "0.75rem" }}>{slide.title}</h2>
                  <p style={{ color: "#D6D9DE", fontSize: "0.95rem", lineHeight: 1.5 }}>{slide.body}</p>
                </div>
              )
            ))}
          </div>

          <div>
            <div style={{ display: "flex", gap: "0.4rem", justifyContent: "center", marginBottom: "1.5rem" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: "8px", height: "8px", borderRadius: "4px", background: onboardStep === i ? GREEN : "#3A3F47" }} />
              ))}
            </div>
            <button
              onClick={() => onboardStep < 2 ? setOnboardStep(onboardStep + 1) : finishOnboarding()}
              style={{ width: "100%", padding: "0.9rem", borderRadius: "12px", border: "none", background: GREEN, color: DARK, fontWeight: 700, fontSize: "1rem" }}
            >
              {onboardStep < 2 ? "Next" : "Get Started"}
            </button>
            {onboardStep < 2 && (
              <button onClick={finishOnboarding} style={{ width: "100%", padding: "0.75rem", background: "none", border: "none", color: "#8A9099", marginTop: "0.5rem" }}>
                Skip
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: CARD, borderTop: `1px solid ${BORDER}`, display: "flex", padding: "0.6rem 0", zIndex: 10 }}>
        <button onClick={() => setView("markets")} style={{ flex: 1, background: "none", border: "none", color: view === "markets" ? GREEN : "#8A9099", fontWeight: 600, fontSize: "0.8rem" }}>Markets</button>
        <button onClick={() => { setView("leaderboard"); loadLeaderboard(); }} style={{ flex: 1, background: "none", border: "none", color: view === "leaderboard" ? GREEN : "#8A9099", fontWeight: 600, fontSize: "0.8rem" }}>Leaderboard</button>
        <button onClick={() => { setView("wallet"); loadMyDeposits(); loadMyWithdrawals(); }} style={{ flex: 1, background: "none", border: "none", color: view === "wallet" ? GREEN : "#8A9099", fontWeight: 600, fontSize: "0.8rem" }}>Wallet</button>
        <button onClick={() => { setView("profile"); loadProfile(); }} style={{ flex: 1, background: "none", border: "none", color: view === "profile" ? GREEN : "#8A9099", fontWeight: 600, fontSize: "0.8rem" }}>Profile</button>
        {isAdmin && (
          <button onClick={() => { setView("admin"); loadAdminMarkets(); loadDepositRequests(); loadWithdrawalRequests(); }}
            style={{ flex: 1, background: "none", border: "none", color: view === "admin" ? GREEN : "#8A9099", fontWeight: 600, fontSize: "0.8rem" }}>
            Admin
          </button>
        )}
      </div>
    </div>
  );
}

export default App;