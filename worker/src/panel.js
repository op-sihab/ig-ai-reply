// ---------------------------------------------------------------------------
// Premium Glassmorphism Control Panel & Live DM Studio
// ---------------------------------------------------------------------------

export const PANEL_HTML = `<!doctype html>
<html lang="bn" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Instagram AI Studio — Control & Simulator</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --font-main: 'Plus Jakarta Sans', -apple-system, sans-serif;
    --font-bn: 'Hind Siliguri', var(--font-main);
    --font-mono: 'JetBrains Mono', monospace;

    /* Dark Theme (Default) */
    --bg-base: #060812;
    --text-primary: #f8fafc;
    --text-secondary: #cbd5e1;
    --text-muted: #94a3b8;

    --glass-bg: rgba(15, 23, 42, 0.65);
    --glass-card: rgba(30, 41, 59, 0.55);
    --glass-card-hover: rgba(51, 65, 85, 0.75);
    --glass-border: rgba(255, 255, 255, 0.12);
    --glass-border-light: rgba(255, 255, 255, 0.25);
    --glass-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    --glass-inset: inset 0 1px 1px 0 rgba(255, 255, 255, 0.15);

    --primary-gradient: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
    --accent-emerald: #10b981;
    --accent-emerald-glow: rgba(16, 185, 129, 0.4);
    --accent-rose: #f43f5e;
    --accent-rose-glow: rgba(244, 63, 94, 0.4);
    --accent-amber: #f59e0b;
    --accent-cyan: #06b6d4;

    --radius-xl: 28px;
    --radius-lg: 20px;
    --radius-md: 14px;
    --radius-sm: 8px;
  }

  [data-theme="light"] {
    --bg-base: #eef2f9;
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-muted: #64748b;

    --glass-bg: rgba(255, 255, 255, 0.75);
    --glass-card: rgba(255, 255, 255, 0.7);
    --glass-card-hover: rgba(255, 255, 255, 0.9);
    --glass-border: rgba(255, 255, 255, 0.85);
    --glass-border-light: rgba(255, 255, 255, 1);
    --glass-shadow: 0 15px 35px rgba(100, 116, 139, 0.18);
    --glass-inset: inset 0 1px 1px 0 rgba(255, 255, 255, 0.95);
  }

  body {
    font-family: var(--font-bn);
    background-color: var(--bg-base);
    color: var(--text-primary);
    min-height: 100vh;
    padding: clamp(16px, 3vw, 32px) clamp(16px, 4vw, 40px) 60px;
    position: relative;
    overflow-x: hidden;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  /* --- Glowing Ambient Mesh Blobs --- */
  .aurora-bg {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.65;
    animation: drift 20s infinite alternate cubic-bezier(0.4, 0, 0.2, 1);
  }
  .orb-1 { width: 50vw; height: 50vw; background: radial-gradient(circle, #6366f1 0%, rgba(99, 102, 241, 0) 70%); top: -10vh; left: -10vw; }
  .orb-2 { width: 45vw; height: 45vw; background: radial-gradient(circle, #ec4899 0%, rgba(236, 72, 153, 0) 70%); top: 30vh; right: -10vw; animation-delay: -5s; }
  .orb-3 { width: 55vw; height: 55vw; background: radial-gradient(circle, #06b6d4 0%, rgba(6, 182, 212, 0) 70%); bottom: -15vh; left: 20vw; animation-delay: -10s; }

  @keyframes drift {
    0% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(4vw, 6vh) scale(1.1); }
    100% { transform: translate(-3vw, -4vh) scale(0.95); }
  }

  /* --- Glass Surface Styles --- */
  .glass-panel {
    background: var(--glass-bg);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow), var(--glass-inset);
    border-radius: var(--radius-xl);
    position: relative;
    z-index: 1;
  }

  .glass-card {
    background: var(--glass-card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), var(--glass-inset);
    transition: all 0.25s ease;
  }
  .glass-card:hover {
    background: var(--glass-card-hover);
    border-color: var(--glass-border-light);
    transform: translateY(-2px);
  }

  /* --- Header & Brand --- */
  .app-container {
    max-width: 1140px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    border-radius: var(--radius-lg);
  }
  .brand-group {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .brand-icon {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-md);
    background: var(--primary-gradient);
    display: grid;
    place-items: center;
    color: #fff;
    box-shadow: 0 8px 20px rgba(168, 85, 247, 0.4);
  }
  .brand-title {
    font-family: var(--font-main);
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .brand-badge {
    font-size: 0.74rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 99px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    color: #818cf8;
    font-family: var(--font-mono);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .theme-btn {
    background: var(--glass-card);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: 0.2s;
  }
  .theme-btn:hover {
    background: var(--glass-card-hover);
  }

  /* --- Navigation Tabs --- */
  .tab-nav {
    display: flex;
    gap: 6px;
    padding: 5px;
    border-radius: var(--radius-lg);
    background: var(--glass-card);
  }
  .tab-btn {
    padding: 8px 18px;
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-main);
    font-weight: 600;
    font-size: 0.88rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tab-btn.active {
    background: rgba(255, 255, 255, 0.18);
    color: var(--text-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  [data-theme="light"] .tab-btn.active {
    background: #ffffff;
    color: var(--text-primary);
  }

  /* --- Main Grid Layout --- */
  .grid-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }
  @media (min-width: 920px) {
    .grid-layout {
      grid-template-columns: 380px 1fr;
    }
  }

  /* --- Left Column: Power Deck --- */
  .power-deck {
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .power-deck::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 260px;
    height: 200px;
    border-radius: 50%;
    background: var(--halo-glow, transparent);
    filter: blur(50px);
    pointer-events: none;
    transition: all 0.6s ease;
  }
  .power-deck.is-on { --halo-glow: var(--accent-emerald-glow); }
  .power-deck.is-off { --halo-glow: var(--accent-rose-glow); }

  .power-ring-btn {
    width: 140px;
    height: 140px;
    border-radius: 50%;
    background: linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02));
    border: 2px solid var(--ring-border, var(--glass-border));
    display: grid;
    place-items: center;
    position: relative;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 10px 30px var(--ring-shadow, rgba(0,0,0,0.3));
    margin-bottom: 24px;
  }
  .power-ring-btn:active { transform: scale(0.94); }
  .power-ring-btn svg {
    width: 52px;
    height: 52px;
    stroke: var(--icon-color, #94a3b8);
    transition: stroke 0.3s;
  }
  .power-deck.is-on .power-ring-btn {
    --ring-border: var(--accent-emerald);
    --ring-shadow: var(--accent-emerald-glow);
    --icon-color: #34d399;
  }
  .power-deck.is-off .power-ring-btn {
    --ring-border: var(--accent-rose);
    --ring-shadow: var(--accent-rose-glow);
    --icon-color: #fb7185;
  }

  .status-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px;
    border-radius: 99px;
    font-size: 0.82rem;
    font-weight: 700;
    margin-bottom: 12px;
    font-family: var(--font-main);
  }
  .power-deck.is-on .status-tag {
    background: rgba(16, 185, 129, 0.18);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.35);
  }
  .power-deck.is-off .status-tag {
    background: rgba(244, 63, 94, 0.18);
    color: #fb7185;
    border: 1px solid rgba(244, 63, 94, 0.35);
  }
  .status-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.3); opacity: 0.6; }
  }

  .status-heading {
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }
  .status-desc {
    font-size: 0.94rem;
    color: var(--text-secondary);
    margin-bottom: 22px;
    max-width: 280px;
  }

  .switch-action-btn {
    width: 100%;
    padding: 14px 20px;
    border-radius: var(--radius-md);
    border: none;
    font-family: var(--font-bn);
    font-size: 1.02rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  }
  .power-deck.is-on .switch-action-btn {
    background: linear-gradient(135deg, #f43f5e, #e11d48);
    color: #fff;
  }
  .power-deck.is-off .switch-action-btn {
    background: linear-gradient(135deg, #10b981, #059669);
    color: #fff;
  }
  .switch-action-btn:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  /* --- Metrics Strip (4 Columns) --- */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 18px;
    width: 100%;
  }
  .metric-card {
    padding: 10px 4px;
    text-align: center;
    background: var(--glass-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border);
    min-width: 0;
  }
  .metric-val {
    font-family: var(--font-main);
    font-size: 1.35rem;
    font-weight: 800;
    line-height: 1.1;
    color: var(--text-primary);
  }
  .metric-lbl {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* --- Right Column: Activity Feed / Simulator --- */
  .content-panel {
    padding: 24px;
    display: flex;
    flex-direction: column;
    min-height: 480px;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--glass-border);
  }
  .panel-title {
    font-size: 1.15rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .refresh-indicator {
    font-size: 0.8rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Thread Items List */
  .threads-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    max-height: 450px;
    padding-right: 4px;
  }
  .thread-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: var(--radius-lg);
    background: var(--glass-card);
    border: 1px solid var(--glass-border);
    cursor: pointer;
    transition: all 0.2s;
  }
  .thread-item:hover {
    background: var(--glass-card-hover);
    border-color: var(--glass-border-light);
    transform: translateX(3px);
  }
  .avatar-circle {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--primary-gradient);
    display: grid;
    place-items: center;
    font-family: var(--font-main);
    font-weight: 700;
    font-size: 1.1rem;
    color: #fff;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
  .thread-info {
    flex: 1;
    min-width: 0;
  }
  .thread-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .thread-handle {
    font-family: var(--font-main);
    font-weight: 700;
    font-size: 0.96rem;
    color: var(--text-primary);
  }
  .thread-time {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .thread-snippet {
    font-size: 0.88rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .thread-meta {
    font-size: 0.74rem;
    color: var(--text-muted);
    margin-top: 4px;
    display: flex;
    gap: 10px;
  }

  /* --- Interactive Chat Simulator Tab --- */
  .sim-container {
    display: flex;
    flex-direction: column;
    height: 440px;
    border-radius: var(--radius-lg);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--glass-border);
    overflow: hidden;
  }
  .sim-chat-box {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .chat-bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 18px;
    font-size: 0.92rem;
    line-height: 1.4;
    word-break: break-word;
  }
  .chat-bubble.user {
    align-self: flex-end;
    background: var(--primary-gradient);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .chat-bubble.ai {
    align-self: flex-start;
    background: var(--glass-card-hover);
    color: var(--text-primary);
    border: 1px solid var(--glass-border);
    border-bottom-left-radius: 4px;
  }
  .sim-input-row {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--glass-border);
    background: var(--glass-card);
  }
  .sim-input {
    flex: 1;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    color: var(--text-primary);
    font-family: var(--font-bn);
    font-size: 0.94rem;
    outline: none;
  }
  .sim-input:focus { border-color: #818cf8; }
  .sim-send-btn {
    padding: 0 18px;
    border-radius: var(--radius-md);
    border: none;
    background: var(--primary-gradient);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
  }

  /* --- Thread Inspector Modal --- */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(12px);
    z-index: 100;
    display: none;
    place-items: center;
    padding: 20px;
  }
  .modal-card {
    width: 100%;
    max-width: 520px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 24px;
  }

  /* Toast Notification */
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(40px);
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid var(--glass-border-light);
    backdrop-filter: blur(16px);
    color: #fff;
    padding: 12px 24px;
    border-radius: 99px;
    font-size: 0.9rem;
    font-weight: 600;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    z-index: 200;
    opacity: 0;
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .toast.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
</style>
</head>
<body>

<div class="aurora-bg">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
</div>

<div class="app-container">
  <!-- Header Bar -->
  <header class="glass-panel">
    <div class="brand-group">
      <div class="brand-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
        </svg>
      </div>
      <div>
        <div class="brand-title">Instagram AI Studio <span class="brand-badge" id="account-badge">@op_sihab</span></div>
      </div>
    </div>

    <div class="header-actions">
      <div class="tab-nav">
        <button class="tab-btn active" id="tab-overview-btn" onclick="switchTab('overview')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> Dashboard
        </button>
        <button class="tab-btn" id="tab-sim-btn" onclick="switchTab('sim')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> AI Simulator
        </button>
      </div>

      <button class="theme-btn" onclick="toggleTheme()" title="Toggle Dark/Light">
        <svg id="theme-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      </button>
    </div>
  </header>

  <!-- Main Work Area -->
  <div class="grid-layout">
    <!-- Left Column: Master Switch & Telemetry -->
    <div>
      <section class="glass-panel power-deck is-off" id="power-deck">
        <div class="status-tag" id="status-tag">
          <span class="status-pulse"></span>
          <span id="status-tag-text">AI বন্ধ</span>
        </div>

        <button class="power-ring-btn" id="master-switch-btn" onclick="toggleAutoReply()">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M12 2v10M18.36 6.64a9 9 0 1 1-12.73 0"/></svg>
        </button>

        <h1 class="status-heading" id="status-heading">AI বন্ধ আছে</h1>
        <p class="status-desc" id="status-desc">আপনি নিজে হাতে উত্তর দিচ্ছেন। বাইরে গেলে সুইচটি চালু করে দিন।</p>

        <button class="switch-action-btn" id="action-btn" onclick="toggleAutoReply()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v10M18.36 6.64a9 9 0 1 1-12.73 0"/></svg>
          <span id="action-btn-text">AI চালু করুন</span>
        </button>

        <!-- 4 Metric Cards -->
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-val" id="m-in">0</div>
            <div class="metric-lbl">এসেছে</div>
          </div>
          <div class="metric-card">
            <div class="metric-val" id="m-out">0</div>
            <div class="metric-lbl">উত্তর</div>
          </div>
          <div class="metric-card">
            <div class="metric-val" id="m-wait" style="color: #38bdf8;">0</div>
            <div class="metric-lbl">বাকি</div>
          </div>
          <div class="metric-card">
            <div class="metric-val" id="m-ho" style="color: #f59e0b;">0</div>
            <div class="metric-lbl">হ্যান্ডঅফ</div>
          </div>
        </div>
      </section>
    </div>

    <!-- Right Column: Tabs (Overview / Simulator) -->
    <div>
      <!-- Tab 1: Overview & Recent Threads -->
      <section class="glass-panel content-panel" id="tab-overview">
        <div class="panel-header">
          <div class="panel-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            সাম্প্রতিক কথোপকথন
          </div>
          <div class="refresh-indicator" id="refresh-time">
            <span class="status-pulse" style="background:#10b981; width:6px; height:6px;"></span> লাইভ
          </div>
        </div>

        <div class="threads-list" id="threads-container">
          <div style="text-align: center; color: var(--text-muted); padding: 40px;">লোড হচ্ছে...</div>
        </div>
      </section>

      <!-- Tab 2: Live AI DM Simulator -->
      <section class="glass-panel content-panel" id="tab-sim" style="display: none;">
        <div class="panel-header">
          <div class="panel-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            AI DM সিমুলেটর (লাইভ টেস্ট করুন)
          </div>
          <div class="brand-badge" id="sim-model-badge">openai/gpt-6-luna</div>
        </div>

        <div class="sim-container">
          <div class="sim-chat-box" id="sim-chat-box">
            <div class="chat-bubble ai">
              কী খবর ভাই? যেকোনো মেসেজ লিখে পাঠাও, দেখবে AI কীভাবে উত্তর দেয়! 😄
            </div>
          </div>
          <div class="sim-input-row">
            <input type="text" class="sim-input" id="sim-input-text" placeholder="মেসেজ লিখুন (যেমন: ভাই দাম কত?)..." onkeydown="if(event.key==='Enter') sendSimMessage()">
            <button class="sim-send-btn" onclick="sendSimMessage()">পাঠান</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</div>

<!-- Modal: Thread History Inspector -->
<div class="modal-overlay" id="modal-overlay" onclick="closeModal(event)">
  <div class="glass-panel modal-card" onclick="event.stopPropagation()">
    <div class="panel-header" style="margin-bottom: 12px;">
      <div class="panel-title" id="modal-thread-title">চ্যাট হিস্ট্রি</div>
      <button onclick="closeModal()" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:1.4rem;">&times;</button>
    </div>
    <div class="sim-chat-box" id="modal-messages-container" style="flex:1; max-height:400px; background:rgba(0,0,0,0.25); border-radius:14px; padding:14px;">
      <!-- messages will load here -->
    </div>
  </div>
</div>

<div class="toast" id="toast-el">স্টেটাস আপডেট হয়েছে</div>

<script>
const token = new URLSearchParams(location.search).get('token') || '';
let currentEnabled = false;
let isBusy = false;
let simHistory = [];

function api(endpoint, options = {}) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = endpoint + sep + 'token=' + encodeURIComponent(token);
  return fetch(url, options).then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

function showToast(msg) {
  const el = document.getElementById('toast-el');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
}

function switchTab(tab) {
  document.getElementById('tab-overview').style.display = tab === 'overview' ? 'flex' : 'none';
  document.getElementById('tab-sim').style.display = tab === 'sim' ? 'flex' : 'none';
  document.getElementById('tab-overview-btn').classList.toggle('active', tab === 'overview');
  document.getElementById('tab-sim-btn').classList.toggle('active', tab === 'sim');
}

function updateUI(data) {
  currentEnabled = Boolean(data.enabled);
  const deck = document.getElementById('power-deck');
  const tagText = document.getElementById('status-tag-text');
  const heading = document.getElementById('status-heading');
  const desc = document.getElementById('status-desc');
  const actionText = document.getElementById('action-btn-text');

  if (currentEnabled) {
    deck.className = 'glass-panel power-deck is-on';
    tagText.textContent = 'AI অ্যাক্টিভ';
    heading.textContent = 'AI উত্তর দিচ্ছে';
    desc.textContent = 'ইনবক্সে আসা সকল মেসেজের উত্তর স্বয়ংক্রিয়ভাবে যাচ্ছে।';
    actionText.textContent = 'AI বন্ধ করুন';
  } else {
    deck.className = 'glass-panel power-deck is-off';
    tagText.textContent = 'AI বন্ধ';
    heading.textContent = 'AI বন্ধ আছে';
    desc.textContent = 'আপনি নিজে হাতে উত্তর দিচ্ছেন। বাইরে যাওয়ার সময় চালু করে দিন।';
    actionText.textContent = 'AI চালু করুন';
  }

  // Metrics
  document.getElementById('m-in').textContent = data.stats?.inbound ?? 0;
  document.getElementById('m-out').textContent = data.stats?.sent ?? 0;
  document.getElementById('m-wait').textContent = data.stats?.waiting ?? 0;
  document.getElementById('m-ho').textContent = data.stats?.handoffs_open ?? 0;
  if (data.model) document.getElementById('sim-model-badge').textContent = data.model;

  // Render Threads
  const container = document.getElementById('threads-container');
  if (!data.threads || data.threads.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">এখনো কোনো মেসেজ আসেনি।</div>';
    return;
  }

  container.innerHTML = data.threads.map(t => {
    const handle = t.handle || t.thread;
    const initial = (handle.replace(/^@/, '')[0] || 'U').toUpperCase();
    const timeAgo = formatTime(t.last_seen);
    return \`
      <div class="thread-item" onclick="openThreadModal('\${t.thread}', '\${handle}')">
        <div class="avatar-circle">\${initial}</div>
        <div class="thread-info">
          <div class="thread-header-row">
            <span class="thread-handle">\${handle}</span>
            <span class="thread-time">\${timeAgo}</span>
          </div>
          <div class="thread-snippet">\${escapeHtml(t.last_message || '(ছবি বা অন্য কিছু)')}</div>
          <div class="thread-meta">
            <span>ইনবাউন্ড: \${t.inbound}</span> • <span>রিপ্লাই: \${t.replies}</span>
          </div>
        </div>
      </div>
    \`;
  }).join('');
}

function formatTime(unixSec) {
  if (!unixSec) return '';
  const diff = Math.floor(Date.now() / 1000 - unixSec);
  if (diff < 60) return 'এখনই';
  if (diff < 3600) return Math.floor(diff / 60) + ' মিনিট আগে';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ঘণ্টা আগে';
  return Math.floor(diff / 86400) + ' দিন আগে';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function loadData() {
  try {
    const res = await api('/panel-state');
    updateUI(res);
  } catch (err) {
    console.error('Failed to load state', err);
  }
}

async function toggleAutoReply() {
  if (isBusy) return;
  isBusy = true;
  const next = !currentEnabled;
  try {
    await api('/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: next })
    });
    showToast(next ? 'AI চালু হয়েছে 🟢' : 'AI বন্ধ করা হয়েছে 🔴');
    await loadData();
  } catch (err) {
    alert('টগল করা যায়নি: ' + err.message);
  } finally {
    isBusy = false;
  }
}

// --- Live Chat Simulator ---
async function sendSimMessage() {
  const input = document.getElementById('sim-input-text');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const box = document.getElementById('sim-chat-box');
  box.innerHTML += \`<div class="chat-bubble user">\${escapeHtml(text)}</div>\`;
  box.scrollTop = box.scrollHeight;

  simHistory.push({ role: 'user', content: text });

  const thinkingId = 'think_' + Date.now();
  box.innerHTML += \`<div class="chat-bubble ai" id="\${thinkingId}" style="opacity:0.6;">ভাবছে...</div>\`;
  box.scrollTop = box.scrollHeight;

  try {
    const res = await api('/simulate-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, history: simHistory })
    });
    const el = document.getElementById(thinkingId);
    if (el) {
      el.textContent = res.reply || '(কোনো উত্তর আসেনি)';
      el.style.opacity = '1';
    }
    simHistory.push({ role: 'assistant', content: res.reply });
  } catch (err) {
    const el = document.getElementById(thinkingId);
    if (el) el.textContent = 'এরর: ' + err.message;
  }
  box.scrollTop = box.scrollHeight;
}

// --- Thread Messages Modal ---
async function openThreadModal(thread, handle) {
  document.getElementById('modal-thread-title').textContent = handle + ' এর চ্যাট হিস্ট্রি';
  const box = document.getElementById('modal-messages-container');
  box.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">লোড হচ্ছে...</div>';
  document.getElementById('modal-overlay').style.display = 'grid';

  try {
    const res = await api('/thread-messages?thread=' + encodeURIComponent(thread));
    if (!res.messages || res.messages.length === 0) {
      box.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">কোনো মেসেজ নেই।</div>';
      return;
    }
    box.innerHTML = res.messages.map(m => \`
      <div class="chat-bubble \${m.role === 'user' ? 'user' : 'ai'}">
        \${escapeHtml(m.text)}
      </div>
    \`).join('');
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    box.innerHTML = '<div style="color:red; text-align:center;">এরর: ' + err.message + '</div>';
  }
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

loadData();
setInterval(loadData, 15000);
</script>
</body>
</html>
`;
