<div align="center">
  <p>
    <a href="https://discord.gg/ZaEwHfDD5N"><img src="https://img.shields.io/discord/1296858234853789826?style=for-the-badge&label=Discord&logo=discord&logoColor=white" /></a>
  </p>

  <h1>LIGA: Pro Journey</h1>
  <p>Experience the full journey of becoming a professional Counter-Strike player — queue, compete, rank up, earn ELO, and build your legacy.</p>
</div>

---

# 🎮 Features

### **Interactive Role Selection**
Choose your identity:
- **Rifler**
- **AWPer**
- **In-Game Leader**

<img width="637" height="463" alt="image" src="https://github.com/user-attachments/assets/1bba50b0-2464-4743-aa19-8752521bd15d" />

The role you choose will impact how you play in-game and how likely teams are to offer you a spot.

---

### **FACEIT-Inspired Progression**
A full FACEIT-style matchmaking system:
- Get matched against opponents in your ELO range 
- Play your matches in-game  
- Earn ELO   
- Track win rate, streaks and player stats  

Play FACEIT to get recognized by Esports Organizations. Your journey from **Level 1 to Pro** happens here!

<img width="1891" height="721" alt="image" src="https://github.com/user-attachments/assets/1b2b249a-24a9-4072-a9fc-21749a6242b5" />

---

### **Advanced Bot Behaviors (BetterBotsPlus)**
Powered by my custom bot enhancer:
- Smarter enemy desicions (ECO rounds, bots drop guns for each other and **much** more!) 
- Realistic utility usage (over 800 grenades on 10 maps)  
- More challenging aim and movement  

**This makes every match feel closer to real Play.**

*Bots throw advanced utility*

![ezgif-2f87161e0ac349b4](https://github.com/user-attachments/assets/48c3a4f1-17f4-41c4-bf50-7c5dcf43066b)

*A rifler Bot dropping an AWP to his AWPer*

![ezgif-24035d679ff71b7b](https://github.com/user-attachments/assets/54cec0ed-75a9-4dc7-bafd-07d33521d90f)

---

# 🛠️ Development

### This Mod is still in development.
**Currently, I am focusing on restructuring most of the game. This includes:**

- Stripping it of a lot of unused code for my goals
- Changing most frontend tabs to fit a player career
- Changing most of the transfer logic
- Big overhaul on the worlgen and simulation side

**Some new features are also planned:**

- Expanding LIGA's seasons with realistic tournaments
- Creating a realistic player database
- Adding an 'Agents' tab -> these will help you get contracts from Organizations

Currently, my modification of LIGA is **not playable**. I am actively working on it, but it will take a lot of time. Here is a rough plan of what I want to achieve & have already achieved:

- Career model refactor: “Manager” → “Player Career” foundation ✅
- New save creation flow: create you (name/country/role) & start as teamless ✅
- FACEIT system: ELO stat + queue → play pugs to get seen ✅
- Contract & offers system from the player perspective 🛠️  
- Team life as a player: squad hub, being benched/kicked, no transfer control ❌🔜
- Progression & XP gains for everyone (no manual “team training” UI) ❌🔜
- Role-specific gameplay mechanics (AWPer restrictions, IGL veto, Rifler as default) ❌🔜
- UI / UX cleanup: Inbox rewrite, Player DB lock-down & refactor, Sponsor backgrounding, remove simulation, change worldgen ❌🔜
- Polish and balancing pass (offer frequency, ELO curves, XP curves, role value) ❌🔜

---

# ❓ Why Does This Fork / Mod Exist?

LIGA: Pro Journey exists because of three passions coming together:

1. A love for creating bots and AI-driven gameplay

I’ve always enjoyed experimenting with bot behavior in games - making them smarter, more reactive, and more realistic.
BetterBotsPlus (also heavily inspired by manico's BetterBots) started as a personal playground for AI improvements and making them as close to real players as possible, and this fork aims to bring those bots into a full team-based, career-driven environment for others to enjoy.

2. Challenging myself with a large technical project

I wanted to learn new languages, dive deeper into game systems, and take on the challenge of refactoring and reshaping an entire game.
LIGA’s open-source nature made it the perfect foundation to tear apart, rebuild, and transform into something new. Big thank you to lemonpole for being supportive and helping with issues I come across!

3. Creating the Player Career Mode Counter-Strike never had

I’ve always enjoyed FIFA’s Player Career - your own journey, progression, contracts, and development.
LIGA had a Manager Career, but no way to experience the climb from nobody → FACEIT grinder → rising star → contracted pro.

So this fork exists to build exactly that:
A true Player Career Mode for Counter-Strike, with FACEIT-style matchmaking, personal progression, realistic bot opponents, and a career path shaped around you.
