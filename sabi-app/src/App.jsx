import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function App() {
  const [name, setName] = useState("friend");
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user?.first_name) setName(user.first_name);
    }

    async function loadMarkets() {
      const { data, error } = await supabase
        .from("markets")
        .select("*")
        .eq("status", "open");
      if (error) console.error(error);
      else setMarkets(data);
    }
    loadMarkets();
  }, []);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1>Hello, {name} 👋</h1>
      <h2>Open Markets</h2>
      {markets.map((m) => (
        <div
          key={m.id}
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          <strong>{m.title}</strong>
          <p style={{ margin: "0.25rem 0", color: "#666" }}>{m.category}</p>
        </div>
      ))}
    </div>
  );
}

export default App;