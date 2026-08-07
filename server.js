const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const SUITS = ['red', 'blue', 'green', 'yellow'];
const rooms = {};

function createDeck() {
    let deck = [];
    SUITS.forEach(suit => {
        for (let val = 1; val <= 13; val++) {
            deck.push({ type: 'normal', suit, val });
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

function sortHand(hand) {
    hand.sort((a, b) => {
        if (a.type === 'lichocar') return 1;
        if (b.type === 'lichocar') return -1;
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return a.val - b.val;
    });
}

// Algoritmus pro formování sad z Vašeho index.html
function formSetsFromCards(cardPool) {
    let unused = [...cardPool];
    let createdSets = [];
    let createdSet = true;

    while (createdSet) {
        createdSet = false;
        
        // 1. Kontrola stejné Barvy (>=3)
        for (let suit of SUITS) {
            let match = unused.filter(c => c.suit === suit);
            if (match.length >= 3) {
                createdSets.push({ type: 'barva', cards: match });
                unused = unused.filter(c => c.suit !== suit);
                createdSet = true;
                break;
            }
        }
        if (createdSet) continue;

        // 2. Kontrola stejného Čísla (>=3)
        for (let v = 1; v <= 13; v++) {
            let match = unused.filter(c => c.val === v);
            if (match.length >= 3) {
                createdSets.push({ type: 'cislo', cards: match });
                unused = unused.filter(c => c.val !== v);
                createdSet = true;
                break;
            }
        }
        if (createdSet) continue;

        // 3. Kontrola Postupky (>=3)
        let sorted = [...unused].filter(c => c.type === 'normal').sort((a, b) => a.val - b.val);
        let run = [];
        for (let i = 0; i < sorted.length; i++) {
            if (run.length === 0) {
                run.push(sorted[i]);
            } else {
                let last = run[run.length - 1];
                if (sorted[i].val === last.val + 1) {
                    run.push(sorted[i]);
                } else if (sorted[i].val > last.val + 1) {
                    if (run.length >= 3) break;
                    run = [sorted[i]];
                }
            }
        }
        if (run.length >= 3) {
            createdSets.push({ type: 'postupka', cards: run });
            let idsToRemove = new Set(run.map(c => c.suit + '-' + c.val));
            unused = unused.filter(c => !idsToRemove.has(c.suit + '-' + c.val));
            createdSet = true;
        }
    }

    return { createdSets, unused };
}

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

    socket.on('selectCardAndOfferer', ({ cardIndex, offererId }) => {
        const room = rooms[socket.roomCode];
        if (!room || !room.started) return;
        const gs = room.gameState;
        if (gs.activePlayer !== socket.slotId || gs.phase !== 'CHOOSE_CARD_AND_OFFERER') return;

        const player = room.players[socket.slotId];
        const card = player.hand.splice(cardIndex, 1)[0];

        gs.bank = [{ card, faceUp: true }];
        gs.targetSuit = card.suit;
        gs.lastOfferValue = card.val;
        gs.offererPlayer = offererId;
        gs.phase = 'OFFERING';

        logRoom(room, `${player.name} vsadil ${card.suit.toUpperCase()} ${card.val} a vyzval ${room.players[offererId].name}.`);
        broadcastState(room);

        setTimeout(() => processOffer(room), 800);
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
    if (checkGameOver(room)) return;

    const gs = room.gameState;
    gs.bank = [];
    gs.targetSuit = null;
    gs.lastOfferValue = 0;

    const activePlayer = room.players[gs.activePlayer];
    logRoom(room, `Na tahu je Žádající: ${activePlayer.name}`);

    if (activePlayer.isBot) {
        botPlayStartTurn(room, activePlayer);
    } else {
        gs.phase = 'CHOOSE_CARD_AND_OFFERER';
        broadcastState(room);
    }
}

function processOffer(room) {
    const gs = room.gameState;
    const offerer = room.players[gs.offererPlayer];

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
        botDecision(room, requester);
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

function checkGameOver(room) {
    let activePlayers = room.players.filter(p => p.activeInGame);
    let winner = activePlayers.find(p => p.hand.length === 0 || p.hand.every(c => c.type === 'lichocar'));
    if (winner) {
        logRoom(room, `🏆 KOLO KONČÍ! Hráč ${winner.name} hlásí ČISTO!`);
        calculateScores(room);
        return true;
    }
    return false;
}

function calculateScores(room) {
    logRoom(room, '=== BODOVÝ VÝSLEDEK ===');
    room.players.filter(p => p.activeInGame).forEach(p => {
        let score = 0;
        p.sets.forEach(s => {
            score += s.cards.length;
            if (s.cards.length === 4) score += 1;
            if (s.cards.length >= 5) score += 3;
        });
        p.hand.forEach(c => {
            if (c.type === 'lichocar') score -= 5;
            else score -= 1;
        });
        logRoom(room, `${p.name}: ${score} bodů (Sady: ${p.sets.length}, Karty v ruce: ${p.hand.length})`);
    });
    room.gameState.phase = 'END';
    broadcastState(room);
}

function botPlayStartTurn(room, bot) {
    if (bot.hand.length === 0) {
        endTurn(room);
        return;
    }
    let card = bot.hand.shift();
    let offererId = (bot.id + 1) % 4;
    while (!room.players[offererId].activeInGame) offererId = (offererId + 1) % 4;

    const gs = room.gameState;
    gs.bank = [{ card, faceUp: true }];
    gs.targetSuit = card.suit;
    gs.lastOfferValue = card.val;
    gs.offererPlayer = offererId;
    gs.phase = 'OFFERING';

    logRoom(room, `${bot.name} vsadil ${card.suit.toUpperCase()} ${card.val} a vyzval ${room.players[offererId].name}.`);
    broadcastState(room);
    setTimeout(() => processOffer(room), 800);
}

function botDecision(room, bot) {
    const gs = room.gameState;
    if (gs.bank.length < 3 && Math.random() < 0.6) {
        logRoom(room, `${bot.name} zvolil: Chci ještě!`);
        gs.phase = 'OFFERING';
        broadcastState(room);
        setTimeout(() => processOffer(room), 800);
    } else {
        if (Math.random() < 0.7) {
            logRoom(room, `${bot.name} zvolil: Přijímám nabídku!`);
            evaluateBank(room, true);
        } else {
            logRoom(room, `${bot.name} zvolil: Odmítám nabídku!`);
            evaluateBank(room, false);
        }
    }
}

function botLayCards(bot, bankCards) {
    let pool = [...bankCards];
    let attached = 0;

    for (let i = bot.hand.length - 1; i >= 0; i--) {
        if (attached >= bankCards.length) break;
        let card = bot.hand[i];
        if (card.type === 'lichocar') continue;
        bot.hand.splice(i, 1);
        pool.push(card);
        attached++;
    }

    const { createdSets, unused } = formSetsFromCards(pool);
    bot.sets.push(...createdSets);
    bot.hand.push(...unused);
    sortHand(bot.hand);
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
