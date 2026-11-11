const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));

const rooms = new Map();
const DEFAULT_COUNTRIES = ["Uganda", "Kenya", "Tanzania", "Rwanda"];

function code() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function cleanName(value, fallback) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, 18) || fallback;
}
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function matchingCountry(hand) {
  const counts = new Map();
  for (const card of hand) {
    counts.set(card, (counts.get(card) || 0) + 1);
    if (counts.get(card) >= 4) return card;
  }
  return null;
}
function publicState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    currentIndex: room.currentIndex,
    round: room.round,
    winnerId: room.winnerId,
    winnerCountry: room.winnerCountry,
    countries: room.countries,
    players: room.players.map((p, index) => ({
      id: p.id, name: p.name, index,
      cardCount: p.hand ? p.hand.length : 0,
      connected: true
    }))
  };
}
function sendState(room) {
  const state = publicState(room);
  room.players.forEach(p => {
    io.to(p.id).emit("gameState", {
      ...state,
      myId: p.id,
      myHand: room.started && !room.winnerId ? p.hand : []
    });
  });
}
function notice(room, message) {
  room.players.forEach(p => io.to(p.id).emit("notice", message));
}
function findPlayer(room, id) {
  return room.players.findIndex(p => p.id === id);
}
function makeRoom(socket, username) {
  let roomCode;
  do { roomCode = code(); } while (rooms.has(roomCode));
  const room = {
    code: roomCode, hostId: socket.id,
    players: [{ id: socket.id, name: cleanName(username, "Player 1"), hand: [] }],
    countries: DEFAULT_COUNTRIES, started: false,
    currentIndex: 0, round: 1, winnerId: null, winnerCountry: null
  };
  rooms.set(roomCode, room);
  socket.join(roomCode);
  socket.join(socket.id);
  socket.data.roomCode = roomCode;
  socket.emit("joined", { code: roomCode, host: true });
  sendState(room);
}
function joinRoom(socket, roomCode, username) {
  const room = rooms.get(String(roomCode || "").trim().toUpperCase());
  if (!room) return socket.emit("errorMessage", "Room not found. Check the code.");
  if (room.started) return socket.emit("errorMessage", "That game has already started.");
  if (room.players.length >= 4) return socket.emit("errorMessage", "This room already has four players.");
  const name = cleanName(username, `Player ${room.players.length + 1}`);
  if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
    return socket.emit("errorMessage", "That username is already taken in this room.");
  room.players.push({ id: socket.id, name, hand: [] });
  socket.join(room.code);
  socket.join(socket.id);
  socket.data.roomCode = room.code;
  socket.emit("joined", { code: room.code, host: false });
  notice(room, `${name} joined the room.`);
  sendState(room);
}
function startGame(socket, requestedCountries) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return;
  if (socket.id !== room.hostId) return socket.emit("errorMessage", "Only the room creator can start the game.");
  if (room.players.length !== 4) return socket.emit("errorMessage", "You need exactly four players before starting.");
  const countries = Array.isArray(requestedCountries)
    ? requestedCountries.map((x, i) => cleanName(x, DEFAULT_COUNTRIES[i])).slice(0, 4)
    : DEFAULT_COUNTRIES;
  if (countries.length !== 4 || new Set(countries.map(x => x.toLowerCase())).size !== 4)
    return socket.emit("errorMessage", "Please use four different country names.");
  room.countries = countries;
  const deck = shuffled(countries.flatMap((_, index) => Array(4).fill(index)));
  room.players.forEach((p, index) => { p.hand = deck.slice(index * 4, index * 4 + 4); });
  room.started = true;
  room.currentIndex = 0;
  room.round = 1;
  room.winnerId = null;
  room.winnerCountry = null;

  // A four-of-a-kind can occur in the initial deal.
  for (const p of room.players) {
    const found = matchingCountry(p.hand);
    if (found !== null) {
      room.winnerId = p.id;
      room.winnerCountry = found;
      break;
    }
  }
  notice(room, room.winnerId
    ? `${room.players.find(p => p.id === room.winnerId).name} won on the initial deal!`
    : `Cards dealt. ${room.players[0].name} passes first to ${room.players[1].name}.`);
  sendState(room);
}
function passCard(socket, cardIndex) {
  const room = rooms.get(socket.data.roomCode);
  if (!room || !room.started || room.winnerId) return;
  const playerIndex = findPlayer(room, socket.id);
  if (playerIndex !== room.currentIndex) return socket.emit("errorMessage", "Please wait for your turn.");
  const hand = room.players[playerIndex].hand;
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= hand.length)
    return socket.emit("errorMessage", "That card selection is not valid.");

  const [card] = hand.splice(cardIndex, 1);
  const nextIndex = (playerIndex + 1) % 4;
  const receiver = room.players[nextIndex];
  receiver.hand.push(card);

  const found = matchingCountry(receiver.hand);
  if (found !== null) {
    room.winnerId = receiver.id;
    room.winnerCountry = found;
    notice(room, `${receiver.name} collected four ${room.countries[found]} cards and wins!`);
  } else {
    room.currentIndex = nextIndex;
    if (nextIndex === 0) room.round++;
    notice(room, `${room.players[playerIndex].name} passed a card. It is ${receiver.name}'s turn.`);
  }
  sendState(room);
}
function disconnect(socket) {
  const roomCode = socket.data.roomCode;
  const room = rooms.get(roomCode);
  if (!room) return;
  const index = findPlayer(room, socket.id);
  if (index >= 0) {
    const [left] = room.players.splice(index, 1);
    if (room.players.length === 0) {
      rooms.delete(roomCode);
      return;
    }
    // A dropped connection resets the round so no one is left with an incomplete hand.
    room.started = false;
    room.players.forEach(p => { p.hand = []; });
    room.winnerId = null;
    room.winnerCountry = null;
    room.currentIndex = 0;
    if (room.hostId === socket.id) room.hostId = room.players[0].id;
    notice(room, `${left.name} disconnected. The game has returned to the lobby.`);
    sendState(room);
  }
}

io.on("connection", socket => {
  socket.on("createRoom", username => makeRoom(socket, username));
  socket.on("joinRoom", data => joinRoom(socket, data && data.code, data && data.username));
  socket.on("startGame", countries => startGame(socket, countries));
  socket.on("passCard", index => passCard(socket, index));
  socket.on("disconnect", () => disconnect(socket));
});

server.listen(PORT, () => console.log(`Country Clash running on port ${PORT}`));
