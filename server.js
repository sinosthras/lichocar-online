import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { createDeck, sortHand } from './public/constants.js';
import { formSetsFromCards, checkGameOver, calculateScores } from './public/gameLogic.js';
import { botPlayStartTurn, botDecision, botLayCards } from './public/aiPlayer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

const aiCallbacks = {
    logRoom,
    broadcastState,
    processOffer,
    evaluateBank,
    endTurn
};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomCode, playerName, slotConfigs }) => {
        let room = rooms[roomCode];

        if (!room) {
            room = {
                code: roomCode,
                players: [
                    { id: 0, name: 'Čeká se...', socketId: null, isBot: false, hand: [], sets: [], activeInGame: true },
                    { id: 1, name: 'Čeká se...', socketId: null, isBot: false, hand: [], sets: [], activeInGame: true },
                    { id: 2, name: 'Čeká se...', socketId: null, isBot: false, hand: [], sets: [], activeInGame: true },
                    { id: 3, name: 'Čeká se...', socketId: null, isBot: false, hand: [], sets: [], activeInGame: true }
                ],
                started: false,
                gameState: null
            };

            slotConfigs.forEach((cfg, idx) => {
                room.players[idx].isBot = cfg.isBot;
                room.players[idx].activeInGame = cfg.active;
                if (cfg.isBot) room.players[idx].name = `Bot ${idx + 1}`;
            });

            rooms[roomCode] = room;
        }

        let assignedSlot = room.players.findIndex(p => p.activeInGame && !p.isBot && !p.socketId);

        if (assignedSlot === -1 && !room.started) {
            socket.emit('errorMsg', 'Místnost je již plná nebo nemá volné místo pro živého hráče.');
            return;
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.slotId = assignedSlot;

        room.players[assignedSlot].socketId = socket.id;
        room.players[assignedSlot].name = playerName || `Hráč ${assignedSlot + 1}`;

        let humanNeeded = room.players.filter(p => p.activeInGame && !p.isBot).length;
        let humanConnected = room.players.filter(p => p.activeInGame && !p.isBot && p.socketId).length;

        if (humanConnected === humanNeeded && !room.started) {
            startGame(room);
        } else {
            broadcastState(room);
        }
    });

    // 1. ZAHÁJENÍ NABÍDKY: Karta Lichočár NESMÍ být vyložena jako první!
    socket.on('selectCardAndOfferer', ({ cardIndex, offererId }) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.started) return;
        const gs = room.gameState;
        if (gs.activePlayer !== socket.slotId || gs.phase !== 'CHOOSE_CARD_AND_OFFERER') return;

        const player = room.players[socket.slotId];
        const card = player.hand[cardIndex];

        if (card.type === 'lichocar') {
            socket.emit('errorMsg', 'Lichočár nesmí být použit jako první karta nabídky!');
            return;
        }

        player.hand.splice(cardIndex, 1);
        gs.bank = [{ card, faceUp: true }];
        gs.targetSuit = card.suit;
        gs.lastOfferValue = card.val;
        gs.offererPlayer = offererId;
        gs.phase = 'OFFERING';

        logRoom(room, `${player.name} vsadil ${card.suit.toUpperCase()} ${card.val} a vyzval ${room.players[offererId].name}.`);
        broadcastState(room);

        setTimeout(() => processOffer(room), 800);
    });

    // 2. RUČNÍ NABÍDKA NABÍZEJÍCÍHO HRÁČE
    socket.on('selectOfferCard', ({ cardIndex }) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.started) return;
        const gs = room.gameState;
        if (gs.offererPlayer !== socket.slotId || gs.phase !== 'OFFERER_CHOICE') return;

        const offerer = room.players[socket.slotId];
        const offeredCard = offerer.hand.splice(cardIndex, 1)[0];
        
        gs.bank.push({ card: offeredCard, faceUp: false });
        if (offeredCard.type === 'normal' && offeredCard.suit === gs.targetSuit) {
            gs.lastOfferValue = offeredCard.val;
        }

        logRoom(room, `${offerer.name} položil kartu lícem dolů.`);

        const requester = room.players[gs.activePlayer];
        if (requester.isBot) {
            botDecision(room, requester, aiCallbacks);
        } else {
            gs.phase = 'DECISION';
            broadcastState(room);
        }
    });

    socket.on('playerDecision', ({ action }) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.started) return;
        const gs = room.gameState;
        if (gs.activePlayer !== socket.slotId || gs.phase !== 'DECISION') return;

        if (action === 'MORE') {
            logRoom(room, `${room.players[socket.slotId].name} zvolil: Chci ještě!`);
            gs.phase = 'OFFERING';
            broadcastState(room);
            setTimeout(() => processOffer(room), 800);
        } else if (action === 'ACCEPT') {
            logRoom(room, `${room.players[socket.slotId].name} zvolil: Přijímám nabídku!`);
            evaluateBank(room, true);
        } else if (action === 'REJECT') {
            logRoom(room, `${room.players[socket.slotId].name} zvolil: Odmítám nabídku!`);
            evaluateBank(room, false);
        }
    });

    socket.on('attachCard', ({ handIndex, targetSlotIndex }) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.started) return;
        const gs = room.gameState;
        if (gs.phase !== 'LAYING_CARDS' || gs.layContext.player.id !== socket.slotId) return;

        const ctx = gs.layContext;
        if (ctx.attachedCount >= ctx.maxAttachCount) return;

        const player = room.players[socket.slotId];
        const card = player.hand[handIndex];
        if (card.type === 'lichocar') return;

        player.hand.splice(handIndex, 1);
        if (targetSlotIndex !== null && targetSlotIndex !== undefined) {
            ctx.cardsFromBank.splice(targetSlotIndex, 0, card);
        } else {
            ctx.cardsFromBank.push(card);
        }
        ctx.attachedCount++;
        broadcastState(room);
    });

    socket.on('reorderBank', ({ fromIndex, toIndex }) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.started) return;
        const gs = room.gameState;
        if (gs.phase !== 'LAYING_CARDS' || gs.layContext.player.id !== socket.slotId) return;

        const cards = gs.layContext.cardsFromBank;
        const card = cards.splice(fromIndex, 1)[0];
        let insertAt = toIndex;
        if (fromIndex < toIndex) insertAt--;
        cards.splice(insertAt, 0, card);
        broadcastState(room);
    });

    socket.on('finishLaying', () => {
        const room = rooms[socket.roomCode];
        if (!room || !room.started) return;
        const gs = room.gameState;
        if (gs.phase !== 'LAYING_CARDS' || gs.layContext.player.id !== socket.slotId) return;

        finishLayingPhase(room);
    });

    socket.on('disconnect', () => {
        const room = rooms[socket.roomCode];
        if (room && socket.slotId !== undefined) {
            room.players[socket.slotId].socketId = null;
            broadcastState(room);
        }
    });
});

function startGame(room) {
    room.started = true;
    const deck = createDeck();
    const activePlayers = room.players.filter(p => p.activeInGame);

    room.players.forEach(p => { p.hand = []; p.sets = []; });
    for (let i = 0; i < deck.length; i++) {
        activePlayers[i % activePlayers.length].hand.push(deck[i]);
    }
    room.players.forEach(p => sortHand(p.hand));

    room.gameState = {
        activePlayer: 0,
        offererPlayer: null,
        phase: 'INIT',
        bank: [],
        targetSuit: null,
        lastOfferValue: 0,
        layContext: null,
        logs: []
    };

    logRoom(room, '=== ZAČÍNÁ NOVÁ HRA LICHOČÁR ===');
    startTurn(room);
}

function startTurn(room) {
    let winner = checkGameOver(room);
    if (winner) {
        logRoom(room, `🏆 KOLO KONČÍ! Hráč ${winner.name} hlásí ČISTO!`);
        let scores = calculateScores(room);
        logRoom(room, '=== BODOVÝ VÝSLEDEK ===');
        scores.forEach(s => logRoom(room, `${s.name}: ${s.score} bodů (Sady: ${s.setMatches}, V ruce: ${s.handCount})`));
        room.gameState.phase = 'END';
        broadcastState(room);
        return;
    }

    const gs = room.gameState;
    gs.bank = [];
    gs.targetSuit = null;
    gs.lastOfferValue = 0;

    const activePlayer = room.players[gs.activePlayer];
    logRoom(room, `Na tahu je Žádající: ${activePlayer.name}`);

    if (activePlayer.isBot) {
        botPlayStartTurn(room, activePlayer, aiCallbacks);
    } else {
        gs.phase = 'CHOOSE_CARD_AND_OFFERER';
        broadcastState(room);
    }
}

function processOffer(room) {
    const gs = room.gameState;
    const offerer = room.players[gs.offererPlayer];

    // Pokud je nabízející živý hráč, předáme mu možnost volby!
    if (!offerer.isBot) {
        gs.phase = 'OFFERER_CHOICE';
        broadcastState(room);
        return;
    }

    // Pokud je nabízející Bot:
    let validCards = offerer.hand.filter(c => c.type === 'normal' && c.suit === gs.targetSuit && c.val > gs.lastOfferValue);
    let chosenCardIndex = -1;

    if (validCards.length > 0) {
        validCards.sort((a, b) => a.val - b.val);
        chosenCardIndex = offerer.hand.indexOf(validCards[0]);
        gs.lastOfferValue = validCards[0].val;
    } else {
        let lichocarIndex = offerer.hand.findIndex(c => c.type === 'lichocar');
        if (lichocarIndex !== -1 && Math.random() < 0.5) {
            chosenCardIndex = lichocarIndex;
        } else {
            chosenCardIndex = 0;
        }
    }

    const offeredCard = offerer.hand.splice(chosenCardIndex, 1)[0];
    gs.bank.push({ card: offeredCard, faceUp: false });
    logRoom(room, `${offerer.name} položil kartu lícem dolů.`);

    const requester = room.players[gs.activePlayer];
    if (requester.isBot) {
        botDecision(room, requester, aiCallbacks);
    } else {
        gs.phase = 'DECISION';
        broadcastState(room);
    }
}

function evaluateBank(room, accepted) {
    const gs = room.gameState;
    gs.bank.forEach(b => b.faceUp = true);
    broadcastState(room);

    let hasLichocar = gs.bank.some(b => b.card.type === 'lichocar');
    let requester = room.players[gs.activePlayer];
    let offerer = room.players[gs.offererPlayer];

    setTimeout(() => {
        if (accepted) {
            if (!hasLichocar) {
                logRoom(room, `🟢 ČISTÁ NABÍDKA! ${requester.name} získává karty.`);
                startLayingPhase(room, requester, gs.bank.map(b => b.card));
            } else {
                logRoom(room, `🔴 PAST SKLAPLA! Bank obsahoval Lichočára.`);
                let lich = gs.bank.find(b => b.card.type === 'lichocar').card;
                requester.hand.push(lich);
                let clean = gs.bank.filter(b => b.card.type !== 'lichocar').map(b => b.card);
                startLayingPhase(room, offerer, clean);
            }
        } else {
            if (hasLichocar) {
                logRoom(room, `🔥 ODHALENÝ BLUF! V nabídce byl Lichočár. Bank se spálil.`);
                let lich = gs.bank.find(b => b.card.type === 'lichocar').card;
                offerer.hand.push(lich);
                endTurn(room);
            } else {
                logRoom(room, `❌ FALEŠNÝ POPLACH! Bank získává ${offerer.name}.`);
                startLayingPhase(room, offerer, gs.bank.map(b => b.card));
            }
        }
    }, 1200);
}

function startLayingPhase(room, player, cardsFromBank) {
    const gs = room.gameState;
    gs.layContext = {
        player,
        cardsFromBank,
        maxAttachCount: cardsFromBank.length,
        attachedCount: 0
    };
    gs.phase = 'LAYING_CARDS';

    if (player.isBot) {
        botLayCards(player, cardsFromBank);
        endTurn(room);
    } else {
        broadcastState(room);
    }
}

function finishLayingPhase(room) {
    const gs = room.gameState;
    const ctx = gs.layContext;

    const { createdSets, unused } = formSetsFromCards(ctx.cardsFromBank);

    if (createdSets.length > 0) {
        ctx.player.sets.push(...createdSets);
        logRoom(room, `✨ ${ctx.player.name} vyložil ${createdSets.length} sad(y)!`);
    }

    if (unused.length > 0) {
        ctx.player.hand.push(...unused);
    }

    sortHand(ctx.player.hand);
    endTurn(room);
}

function endTurn(room) {
    const gs = room.gameState;
    let next = (gs.activePlayer + 1) % 4;
    while (!room.players[next].activeInGame) {
        next = (next + 1) % 4;
    }
    gs.activePlayer = next;
    room.players.forEach(p => sortHand(p.hand));
    startTurn(room);
}

function logRoom(room, msg) {
    if (room.gameState) room.gameState.logs.push(msg);
}

function broadcastState(room) {
    room.players.forEach(p => {
        if (p.socketId) {
            const clientState = prepareClientState(room, p.id);
            io.to(p.socketId).emit('gameStateUpdate', clientState);
        }
    });
}

function prepareClientState(room, mySlotId) {
    const gs = room.gameState;
    let validSetCardIndices = [];

    if (gs && gs.phase === 'LAYING_CARDS') {
        const { createdSets } = formSetsFromCards(gs.layContext.cardsFromBank);
        let usedCards = createdSets.flatMap(s => s.cards);
        validSetCardIndices = gs.layContext.cardsFromBank.map(c =>
            usedCards.some(uc => uc.suit === c.suit && uc.val === c.val && uc.type === c.type)
        );
    }

    return {
        mySlotId,
        started: room.started,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            isBot: p.isBot,
            activeInGame: p.activeInGame,
            cardCount: p.hand.length,
            sets: p.sets,
            hand: (p.id === mySlotId) ? p.hand : []
        })),
        gameState: gs ? {
            activePlayer: gs.activePlayer,
            offererPlayer: gs.offererPlayer,
            phase: gs.phase,
            targetSuit: gs.targetSuit,
            lastOfferValue: gs.lastOfferValue,
            bank: gs.bank.map(b => ({
                card: b.faceUp ? b.card : null,
                faceUp: b.faceUp
            })),
            layContext: gs.layContext ? {
                playerId: gs.layContext.player.id,
                cardsFromBank: gs.layContext.cardsFromBank,
                maxAttachCount: gs.layContext.maxAttachCount,
                attachedCount: gs.layContext.attachedCount
            } : null,
            logs: gs.logs,
            validSetCardIndices
        } : null
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));
