import { formSetsFromCards } from './gameLogic.js';
import { sortHand } from './constants.js';

export function botPlayStartTurn(room, bot, callbacks) {
    if (bot.hand.length === 0) {
        callbacks.endTurn(room);
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

    callbacks.logRoom(room, `${bot.name} vsadil ${card.suit.toUpperCase()} ${card.val} a vyzval ${room.players[offererId].name}.`);
    callbacks.broadcastState(room);
    setTimeout(() => callbacks.processOffer(room), 800);
}

export function botDecision(room, bot, callbacks) {
    const gs = room.gameState;
    if (gs.bank.length < 3 && Math.random() < 0.6) {
        callbacks.logRoom(room, `${bot.name} zvolil: Chci ještě!`);
        gs.phase = 'OFFERING';
        callbacks.broadcastState(room);
        setTimeout(() => callbacks.processOffer(room), 800);
    } else {
        if (Math.random() < 0.7) {
            callbacks.logRoom(room, `${bot.name} zvolil: Přijímám nabídku!`);
            callbacks.evaluateBank(room, true);
        } else {
            callbacks.logRoom(room, `${bot.name} zvolil: Odmítám nabídku!`);
            callbacks.evaluateBank(room, false);
        }
    }
}

export function botLayCards(bot, bankCards) {
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
