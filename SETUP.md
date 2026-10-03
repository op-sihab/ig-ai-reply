# আমার Instagram অ্যাকাউন্টে কীভাবে বসাব (ধাপে ধাপে)

এই bot চালাতে যা লাগবে: এই PC, ইন্টারনেট, একটা Instagram অ্যাকাউন্ট আর একটা
Facebook অ্যাকাউন্ট (শুধু Meta developer dashboard-এ ঢোকার জন্য — Facebook Page
লাগবে **না**)। খরচ শূন্য, শুধু LLM token খরচ যা আপনার merge.dev key থেকেই যাবে।

---

## bot কী পারবে, কী পারবে না

| কাজ | পারবে? | কেন |
|---|---|---|
| কেউ আপনাকে DM করলে AI নিজে reply দেবে | **হ্যাঁ** | API-র মূল কাজ এটাই, ToS-approved |
| কে message দিল সেটা দেখবে (username, নাম, ছবি) | **হ্যাঁ** | কেউ message দেওয়ার সাথে সাথে Instagram "user consent" সেট করে |
| কেউ comment করে keyword লিখলে তাকে private DM | **হ্যাঁ** | comment_id দিয়ে একটা reply, comment করার ৭ দিনের ভিতর |
| পুরনো conversation-এর context ধরে রেখে কথা বলা | **হ্যাঁ** | history SQLite-এ জমা থাকে |
| আপনি নিজে হাতে ফোন থেকে যাকে খুশি DM করা | **হ্যাঁ** | এটা কখনোই নিষেধ ছিল না — এটা মানুষ হিসেবে আপনি করছেন |
| **bot দিয়ে** এমন কাউকে DM পাঠানো যে কখনো message/comment করেনি | **না** | API-তে এই সুযোগ নেই। জোর করলে স্প্যাম ক্যাটেগরিতে পড়ে |
| যে শুধু comment করেছে (message দেয়নি) তার প্রোফাইল দেখা | **না** | "User consent is required to access user profile" — শুধু keyword-PM পাঠানো যাবে |
| unfollow/auto-like/auto-follow, bulk DM, follower scrape | **না** | Meta-র নিয়মে নিষিদ্ধ, অ্যাকাউন্ট লক হয় |

> **Cold DM মানে কী:** আপনি নিজে থেকে এমন কাউকে message পাঠানো যে কখনো
> আপনার সাথে কথা শুরু করেনি। ফোন থেকে হাতে করলে সমস্যা নেই; কিন্তু bot/API দিয়ে
> **অটোমেটিক** পাঠানো যায় না — এবং bulk করে পাঠালে সেটাই স্প্যাম হিসেবে ধরা হয়।
> Bengali কথায়: *"যে আপনার সাথে কথা শুরু করেনি, তাকে bot নিজে থেকে DM দিতে পারবে না।"*

---

## ধাপ ১ — Instagram অ্যাকাউন্ট professional করুন (৩০ সেকেন্ড)

অফিসিয়াল API শুধু **Business/Creator** অ্যাকাউন্টে কাজ করে। ফ্রি, আর username,
followers, posts, পুরনো DM — সব হুবহু থাকবে। Followers কিছুই টের পায় না।

Instagram app → আপনার প্রোফাইল → উপরে ডানে **☰** → **Settings and privacy** →
**Account type and tools** → **Switch to professional account** → **Creator** →
Category বেছে নিন → Done।

> Creator কেন? Business-এ trending audio প্রায় বন্ধ, আর messaging/API দুইটাতেই
> Creator সমান। পরে খুশি হলে আবার বদলাতে পারবেন, কোনো লিমিট নেই।
> যা বদলাবে একটাই: অ্যাকাউন্ট আর private রাখা যাবে না।

## ধাপ ২ — MESSAGE ACCESS চালু করুন ⚠️ সবচেয়ে জরুরি

এই টগলটা OFF থাকলে webhook **একটাও আসে না**, কোনো error-ও দেখায় না — এখানেই
সবাই আটকায়।

Instagram app → প্রোফাইল → **☰** → **Messages and story replies** →
**Message requests** → **Connected tools** → **Allow access to messages** = ON

> "Connected tools" অপশনটা অনেক সময় আগে থেকে দেখা যায় না — কোনো app/Page
> connect হওয়ার পর দেখা যায়। তাই ধাপ ৬-৭ শেষ করে আবার এখানে এসে দেখুন।

## ধাপ ৩ — Meta developer app বানান

1. [developers.facebook.com](https://developers.facebook.com) → আপনার Facebook
   অ্যাকাউন্ট দিয়ে লগইন → **My Apps** → **Create App**
2. App name দিন (যেমন `ig-ai-reply`) → Use case: **Other** → Next →
   App type: **Business** → Create
3. App dashboard → **Products** → **Instagram** → **Set up**
4. Instagram product-এর সেটিংসে **Business login** অংশে পাবেন:
   - **Instagram App ID**
   - **Instagram App Secret**  ← এটাই `.env`-এর `IG_APP_SECRET`
5. **Generate access token** (Business login) → permissions:
   `instagram_business_basic` + `instagram_business_manage_messages`
   (+ চাইলে `instagram_business_manage_comments` — কমেন্ট দেখতে/বলতে)
   → আপনার Instagram দিয়ে authorize করুন → যে **long-lived token** (৬০ দিন)
   দেখাবে সেটা কপি করুন  ← এটাই `.env`-এর `IG_ACCESS_TOKEN`

নিজের অ্যাকাউন্ট নিজে চালাচ্ছেন বলে **App Review বা Advanced Access লাগবে না** —
Standard Access-ই যথেষ্ট।

## ধাপ ৪ — bot চালু করুন

```bash
cd E:\ig-ai-reply
copy .env.example .env
notepad .env          # IG_APP_SECRET, IG_ACCESS_TOKEN বসান (DRY_RUN=true রাখুন,
                      # আর IG_VERIFY_TOKEN-এ নিজের একটা লম্বা random স্ট্রিং দিন)
python -m pip install -r requirements.txt
python run.py
```

তারপর ব্রাউজারে `http://127.0.0.1:8080/health` খুলুন — `ok: true` দেখলেই bot বেঁচে আছে।

আপনার reply-এর ব্যক্তিত্ব লিখুন: `prompts\persona.md` আর `prompts\knowledge.md`
(দাম, সময়, ঠিকানা, লিংক — শুধু এখানে থাকা তথ্যই bot বলবে, বানিয়ে বলবে না)।

কে কে message দিল দেখতে: `http://127.0.0.1:8080/threads` — প্রতিটা কথার
username/নাম, কতগুলো message এসেছে, শেষ message কী। বাড়তি কিছু লাগে না।
(প্রথম message আসার সময় bot নিজে থেকেই প্রোফাইলটা তুলে নিয়ে জমা রাখে।)

## ধাপ ৫ — ইন্টারনেটে HTTPS-এ খুলুন

Meta কখনো `http://` কল করবে না, তাই একটা tunnel দরকার (লোকাল টেস্টের জন্য ফ্রি):

```bash
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:8080
```

যে `https://xxxx.trycloudflare.com` লিংক ছাপবে সেটা কপি করুন। (এই লিংক প্রতিবার
বদলায় — সবসময় চালু রাখতে হলে পরে আপনার ডোমেইনে named tunnel বানাবেন।)

## ধাপ ৬ — Webhook যোগ করুন

Meta app dashboard → **Instagram** → **Webhooks**:

- **Callback URL**: `https://xxxx.trycloudflare.com/webhook`
- **Verify token**: `.env`-এর `IG_VERIFY_TOKEN` এর **হুবহু একই** মান
- **Verify and save** চাপুন → সফল হলে bot-এর log-এ `webhook verified` দেখবেন
- **Subscribe to fields**: `messages` টিক দিন
  (+ চাইলে `messaging_postbacks`, `message_reactions`, `messaging_seen`)

## ধাপ ৭ — অ্যাকাউন্টটাকে ওই webhook-এ subscribe করুন

app-level webhook থাকলেও কেউ ফিড না করলে কোনো event আসে না — এই ধাপটা সবাই মিস করে:

```bash
python tools/ig_setup.py subscribe
python tools/ig_setup.py check      # token, persona, knowledge, subscription সব যাচাই
```

## ধাপ ৮ — প্রথম মেসেজ দিয়ে যাচাই

অন্য একInstagram অ্যাকাউন্ট থেকে আপনার অ্যাকাউন্টে DM করুন: `দাম কত?`

- `DRY_RUN=true` থাকলে bot **পাঠাবে না**, শুধু log-এ লিখবে:
  `[DRY RUN] would reply to … : <পুরো রিপ্লাই>`
- রিপ্লাইটা পড়ে দেখুন (log-এ, বা সব `GET http://127.0.0.1:8080/handoffs`)
- খুশি হলে `.env`-এ `DRY_RUN=false` → আবার DM → এবার আসল reply যাবে

## ধাপ ৯ — ২৪/৭ চালু রাখা

- **এই PC-তেই**: Task Scheduler-এ logon-এ `python run.py` চালান, আর tunnel-টাও
  (named tunnel হলে সার্ভিস হিসাবে)। কেউ DM করলে PC বন্ধ থাকলে reply দেরি হবে।
- **সবসময়, বাড়তি নির্ভরতায়**: একটা ছোট Ubuntu VPS-এ রাখুন, systemd service +
  named tunnel। তাছাড়া token refresh-এর জন্য day 50-এ একটা cron:

```bash
python tools/ig_setup.py refresh --write   # নতুন ৬০ দিনের token .env-এ লিখে দেবে
```

---

## যে ফাঁদে সবাই আটকায়

| উপসর্গ | আসল কারণ |
|---|---|
| Webhook verify fail | verify token মিলছে না, URL `https` নয়, বা tunnel বন্ধ |
| Verify হয়, কিন্তু DM এলে কিছুই হয় না | **Allow access to messages OFF** (ধাপ ২), অথবা `/me/subscribed_apps` করা হয়নি (ধাপ ৭) |
| Log-এ "outside 24h window" | ইউজারের শেষ মেসেজের ২৪ ঘণ্টা পার → আর reply পাঠানো যায় না (Meta-র নিয়ম) |
| কিছুক্ষণ পর হঠাৎ বন্ধ | token ৬০ দিনে মেয়াদোত্তীর্ণ → `refresh --write` |
| reply ফাঁকা আসে | `LLM_MAX_TOKENS` কম — এগুলো reasoning model, টোকেন thinking-এ খরচ হয়। ৬০০-এর নিচে নামাবেন না |
| একই মেসেজে দুইবার reply | হওয়ার কথা না (mid dedupe আছে); হলে log দেখে জানান |
| Cold DM করতে চাইলে | পারবেন না — API-তে নেই, আর করলে অ্যাকাউন্ট স্প্যাম ক্যাটেগরিতে পড়ে |

## নিরাপত্তার নিয়ম (এই bot যা করবে না)

- পাসওয়ার্ড/OTP/CVV কখনো চাইবে না বা নেবে না।
- `knowledge.md`-তে না থাকা কোনো দাম/সময়/লিংক বানিয়ে বলবে না — চeck করে জানাবে।
- শুধু যারা আগে message/comment করেছে তাদেরই reply দেয় (Meta-র নিয়মও এটাই)।
- `.env` কখনো শেয়ার/কমিট করবেন না — ওটাই আপনার চাবি।
