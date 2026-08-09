export const SUITS = ['red', 'blue', 'green', 'yellow'];

export const SUIT_ICONS = {
    red: '♥',
    blue: '♦',
    green: '♣',
    yellow: '♠'
};

export function createDeck() {
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

export function sortHand(hand) {
    hand.sort((a, b) => {
        if (a.type === 'lichocar') return 1;
        if (b.type === 'lichocar') return -1;
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return a.val - b.val;
    });
}
