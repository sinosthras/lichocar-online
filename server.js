const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

// Paměť pro herní místnosti
const rooms = {};

const SUITS = ['red', 'blue', 'green', 'yellow'];

function createDeck() {
    let deck = [];
    SUITS.forEach(suit => {
        for (let val = 1; val <= 13; val++) {
            deck.push({ type: 'normal', suit: suit, val: val });
        }
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ type: 'lichocar', suit: 'lichocar', val: 0 });
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

io.on('connection', (socket) => {
    console.log('Hráč připojen:', socket.id);

    socket.on('joinRoom', ({ roomId, playerName }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                gameState: null
            };
        }

        const room = rooms[roomId];
        
        if (room.players.length < 4 && !room.gameState) {
            const player = {
                id: socket.id,
                name: playerName || `Hráč ${room.players.length + 1}`,
                hand: [],
                sets: []
            };
            room.players.push(player);
            
            io.to(roomId).emit('roomUpdated', {
                players: room.players.map(p => ({ id: p.id, name: p.name })),
                canStart: room.players.length >= 2
            });
        } else {
            socket.emit('errorMsg', 'Místnost je plná nebo hra již probíhá.');
        }
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.players.length < 2) return;

        const deck = createDeck();
        room.players.forEach((p, idx) => {
            p.hand = [];
            p.sets = [];
        });

        for (let i = 0; i < deck.length; i++) {
            room.players[i % room.players.length].hand.push(deck[i]);
        }

        room.gameState = {
            activePlayerIdx: 0,
            offererIdx: null,
            phase: 'CHOOSE_CARD_AND_OFFERER',
            bank: [],
            targetSuit: null,
            lastOfferValue: 0
        };

        sendGameState(roomId);
    });

    socket.on('disconnect', () => {
        console.log('Hráč odpojen:', socket.id);
        // Vyčištění prázdných místností
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('roomUpdated', {
                    players: rooms[roomId].players.map(p => ({ id: p.id, name: p.name })),
                    canStart: false
                });
            }
        }
    });
});

function sendGameState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.players.forEach((player) => {
        // Každému hráč posíláme jen jeho ruku a veřejné informace o ostatních
        const clientState = {
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                handCount: p.hand.length,
                sets: p.sets
            })),
            myHand: player.hand,
            activePlayerIdx: room.gameState.activePlayerIdx,
            offererIdx: room.gameState.offererIdx,
            phase: room.gameState.phase,
            bank: room.gameState.bank.map(b => b.faceUp ? b : { faceUp: false }),
            targetSuit: room.gameState.targetSuit
        };
        io.to(player.id).emit('gameState', clientState);
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server běží na portu ${PORT}`);
});
