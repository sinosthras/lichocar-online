const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const rooms = {};
const SUITS = ['red', 'blue', 'green', 'yellow'];

function createDeck() {
    let deck = [];
    SUITS.forEach(suit => {
        for (let val = 1; val <= 13; val++) {
            deck.push({ id: `${suit}-${val}`, type: 'normal', suit: suit, val: val });
        }
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ id: `lichocar-${i}`, type: 'lichocar', suit: 'lichocar', val: 0 });
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

io.on('connection', (socket) => {
    socket.on('setupGame', ({ roomId, playerName, totalPlayers, playerTypes }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                gameState: null,
                settings: { totalPlayers, playerTypes }
            };
        }

        const room = rooms[roomId];
        
        // Přidáme hostujícího člověka
        const humanPlayer = {
            id: socket.id,
            name: playerName || 'Hráč',
            isBot: false,
            hand: [],
            sets: []
        };
        room.players.push(humanPlayer);

        // Doplníme boty podle nastavení
        while (room.players.length < totalPlayers) {
            const botIdx = room.players.length;
            room.players.push({
                id: `bot-${roomId}-${botIdx}`,
                name: `Bot ${botIdx + 1}`,
                isBot: true,
                hand: [],
                sets: []
            });
        }

        startNewGame(roomId);
    });

    socket.on('playerAction', ({ roomId, actionData }) => {
        const room = rooms[roomId];
        if (!room || !room.gameState) return;
        
        // Zde budeme zpracovávat tahy (vyložení karty, dokládání do nabídky, konec tahu)
        // Prozatím pošleme aktualizovaný stav zpět
        broadcastState(roomId);
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
        }
    });
});

function startNewGame(roomId) {
    const room = rooms[roomId];
    const deck = createDeck();
    
    room.players.forEach(p => {
        p.hand = [];
        p.sets = [];
    });

    // Rozdání karet
    for (let i = 0; i < deck.length; i++) {
        room.players[i % room.players.length].hand.push(deck[i]);
    }

    room.gameState = {
        activePlayerIdx: 0,
        phase: 'PLAY_CARD', // PLAY_CARD, EXTEND_OFFER
        bank: [], // pole slotů s kartami v nabídce
        selectedCard: null
    };

    broadcastState(roomId);
}

function broadcastState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.players.forEach(player => {
        if (player.isBot) return;
        io.to(player.id).emit('gameState', {
            players: room.players.map(p => ({ name: p.name, handCount: p.hand.length, isBot: p.isBot })),
            myHand: player.hand,
            activePlayerIdx: room.gameState.activePlayerIdx,
            phase: room.gameState.phase,
            bank: room.gameState.bank
        });
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT);
