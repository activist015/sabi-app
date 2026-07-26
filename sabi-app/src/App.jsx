import { useEffect, useState } from "react";

function App() {
  const [name, setName] = useState("friend");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand(); // makes the app fill the screen instead of a small popup
      const user = tg.initDataUnsafe?.user;
      if (user?.first_name) setName(user.first_name);
    }
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Hello, {name} 👋</h1>
      <p>If you can see your real Telegram name above, the pipe works.</p>
    </div>
  );
}

export default App;