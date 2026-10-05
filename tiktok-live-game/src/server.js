import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

const PORT = Number(process.env.PORT || 3000);
const USERNAME = (process.env.TIKTOK_USERNAME || "").replace(/^@/, "").trim();
const SIMULATE = String(process.env.SIMULATE || "false").toLowerCase() === "true";
const RACE_TARGET = Math.max(20, Number(process.env.RACE_TARGET || 100));
const RACE_SECONDS = Math.max(20, Number(process.env.RACE_SECONDS || 90));

const TEAMS = ["COLOMBIA", "MEXICO", "ARGENTINA", "BRASIL"];
const aliases = new Map([
  ["colombia","COLOMBIA"],["co","COLOMBIA"],["🇨🇴","COLOMBIA"],
  ["mexico","MEXICO"],["méxico","MEXICO"],["mx","MEXICO"],["🇲🇽","MEXICO"],
  ["argentina","ARGENTINA"],["ar","ARGENTINA"],["🇦🇷","ARGENTINA"],
  ["brasil","BRASIL"],["brazil","BRASIL"],["br","BRASIL"],["🇧🇷","BRASIL"]
]);

const state = {
  raceId: 1,
  startedAt: Date.now(),
  endsAt: Date.now() + RACE_SECONDS * 1000,
  target: RACE_TARGET,
  scores: Object.fromEntries(TEAMS.map(t => [t, 0])),
  leader: null,
  winner: null,
  connected: false,
  roomId: null,
  viewers: null,
  lastEvent: null
};

const userTeams = new Map();
let resetTimer = null;
let connection = null;

function normalizeTeam(text = "") {
  const clean = String(text).toLowerCase().trim().replace(/^!/, "");
  for (const [key, team] of aliases.entries()) {
    if (clean === key || clean.includes(key)) return team;
  }
  return null;
}

function chooseTeam(userKey, preferred) {
  if (preferred) {
    userTeams.set(userKey, preferred);
    return preferred;
  }
  if (userTeams.has(userKey)) return userTeams.get(userKey);
  const team = TEAMS[Math.floor(Math.random() * TEAMS.length)];
  userTeams.set(userKey, team);
  return team;
}

function recalcLeader() {
  state.leader = TEAMS.slice().sort((a,b) => state.scores[b] - state.scores[a])[0] || null;
}

function broadcast(type, payload = {}) {
  state.lastEvent = { type, at: Date.now(), ...payload };
  recalcLeader();
  io.emit("race:state", state);
  io.emit("race:event", state.lastEvent);
}

function finishRace(team) {
  if (state.winner) return;
  state.winner = team;
  broadcast("winner", { team, message: `${team} gana la carrera` });
  clearTimeout(resetTimer);
  resetTimer = setTimeout(resetRace, 7000);
}

function addPoints(team, points, meta = {}) {
  if (!TEAMS.includes(team) || state.winner) return;
  const safePoints = Math.max(1, Math.min(50, Math.round(Number(points) || 1)));
  state.scores[team] += safePoints;
  broadcast("boost", { team, points: safePoints, ...meta });
  if (state.scores[team] >= state.target) finishRace(team);
}

function resetRace() {
  clearTimeout(resetTimer);
  state.raceId += 1;
  state.startedAt = Date.now();
  state.endsAt = Date.now() + RACE_SECONDS * 1000;
  state.scores = Object.fromEntries(TEAMS.map(t => [t, 0]));
  state.winner = null;
  state.leader = null;
  broadcast("reset", { message: `Comienza la carrera #${state.raceId}` });
  resetTimer = setTimeout(() => {
    recalcLeader();
    finishRace(state.leader || TEAMS[0]);
  }, RACE_SECONDS * 1000);
}

function giftValue(data) {
  const diamond =
    data?.diamondCount ??
    data?.extendedGiftInfo?.diamondCount ??
    data?.extendedGiftInfo?.diamond_count ??
    data?.gift?.diamondCount ??
    1;
  const repeat = data?.repeatCount ?? data?.repeat_count ?? 1;
  const base = Math.max(1, Number(diamond) || 1);
  const qty = Math.max(1, Number(repeat) || 1);
  return Math.max(1, Math.ceil(Math.log2(base + 1) * Math.min(qty, 10)));
}

function onChat(data) {
  const userId = String(data?.user?.userId || data?.user?.uniqueId || "anon");
  const username = data?.user?.uniqueId || data?.user?.nickname || "viewer";
  const comment = String(data?.comment || "");
  const team = normalizeTeam(comment);
  if (team) {
    userTeams.set(userId, team);
    broadcast("team-selected", { team, username, message: `@${username} apoya a ${team}` });
  }
}

function onGift(data) {
  const isStreakable = Number(data?.giftType ?? data?.gift?.type) === 1;
  const repeatEnded = Number(data?.repeatEnd ?? data?.repeat_end ?? 0) === 1;
  if (isStreakable && !repeatEnded) return;

  const userId = String(data?.user?.userId || data?.user?.uniqueId || "anon");
  const username = data?.user?.uniqueId || data?.user?.nickname || "viewer";
  const team = chooseTeam(userId);
  const points = giftValue(data);
  const giftName = data?.giftName || data?.extendedGiftInfo?.name || data?.gift?.name || "regalo";

  addPoints(team, points, {
    username,
    giftName,
    message: `@${username} envió ${giftName}: +${points} para ${team}`
  });
}

async function connectTikTok() {
  if (!USERNAME) {
    broadcast("status", { message: "Configura TIKTOK_USERNAME para conectar el LIVE." });
    return;
  }

  connection = new TikTokLiveConnection(USERNAME, { enableExtendedGiftInfo: true });

  connection.on(WebcastEvent.CHAT, onChat);
  connection.on(WebcastEvent.GIFT, onGift);
  connection.on(WebcastEvent.ROOM_USER, data => {
    state.viewers = Number(data?.viewerCount ?? data?.viewer_count ?? state.viewers);
    io.emit("race:state", state);
  });

  try {
    const result = await connection.connect();
    state.connected = true;
    state.roomId = result?.roomId || connection.roomId || null;
    broadcast("connected", { message: `Conectado al LIVE de @${USERNAME}` });
  } catch (error) {
    state.connected = false;
    broadcast("error", { message: `No se pudo conectar: ${error?.message || error}` });
    setTimeout(connectTikTok, 15000);
  }
}

io.on("connection", socket => {
  socket.emit("race:state", state);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, liveConnected: state.connected, username: USERNAME || null, simulate: SIMULATE });
});

app.get("/api/test/gift", (req, res) => {
  if (!SIMULATE) return res.status(403).json({ ok:false, error:"Activa SIMULATE=true para usar pruebas." });
  const team = normalizeTeam(req.query.team) || TEAMS[0];
  const points = Number(req.query.points || 8);
  const username = String(req.query.user || "demo_user");
  addPoints(team, points, { username, giftName:"Regalo demo", message:`@${username} envió un regalo demo: +${points} para ${team}` });
  res.json({ ok:true, state });
});

app.post("/api/test/reset", (_req, res) => {
  if (!SIMULATE) return res.status(403).json({ ok:false, error:"Activa SIMULATE=true para usar pruebas." });
  resetRace();
  res.json({ ok:true, state });
});

server.listen(PORT, () => {
  console.log(`TikTok LIVE Game en http://localhost:${PORT}`);
  resetRace();
  if (SIMULATE) {
    console.log("Modo simulación activo.");
  } else {
    connectTikTok();
  }
});
