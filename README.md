# Country Clash — online multiplayer card game

This is a small real-time website for four people playing from separate phones. Players enter a username, create/join a room with a six-character code, and pass country cards clockwise.

## What is included
- Username entry before creating or joining a room
- Four-player rooms and shareable room codes
- Private hands (the server sends each player only their own cards)
- Four country names, each represented by four cards
- Live clockwise card passing and automatic four-of-a-kind winner detection
- Mobile-friendly browser interface; no app installation

## Important game rule used in this build
The first player passes one card to the next player. The receiver then chooses one card from their hand (including the card just received) and passes it onward. The server checks for four matching country cards after each incoming card. The cycle is:
Player 1 → Player 2 → Player 3 → Player 4 → Player 1.

## Run it on your computer
You need Node.js 18 or newer.

1. Unzip the project.
2. Open a terminal in the `country_clash` folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000` in your browser.

For different phones in different places, the website must be deployed to a public Node.js host that supports WebSockets (Socket.IO). A static-only host is not enough because the server coordinates rooms, cards and turns.

## Deploying online
Use a Node.js hosting provider that supports WebSockets (for example, Render or Railway):
1. Create a new web service from this project folder/repository.
2. Set the build/install command to `npm install`.
3. Set the start command to `npm start`.
4. The host will provide a public HTTPS address. Share that address with all four players.
5. Each player opens the address, enters a username, and joins the host's room code.

The server uses the hosting provider's `PORT` environment variable automatically.

## Notes
- This is a starter implementation. Rooms are held in server memory, so restarting the server clears active rooms.
- If a player disconnects, the current game returns to the lobby so the remaining players are not stuck with incomplete hands.
- The game is designed for four connected players per room.
- Do not use the same username twice in one room.
