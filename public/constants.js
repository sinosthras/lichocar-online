export const SUITS = ['cervena', 'modra', 'zelena', 'zluta'];
export const VALUES = [7, 8, 9, 10, 11, 12]; // Prskavky/Hodnoty karet

export function createDeck() {
    const deck = [];
    
    // Generování běžných karet
    for (const suit of SUITS) {
        for (const val of VALUES) {
            deck.push({
                type: 'normal',
                suit,
                val
            });
        }
    }

    // Přidání 4 Lichočárů
    for (let i = 0; i < 4; i++) {
        deck.push({
            type: 'lichocar',
            suit: 'lichocar',
            val: 0
        });
    }

    // Zamíchání
    return deck.sort(() => Math.random() - 0.5);
}

export function sortHand(hand) {
    const suitOrder = { cervena: 1, modra: 2, zelena: 3, zluta: 4, lichocar: 5 };
    hand.sort((a, b) => {
        if (suitOrder[a.suit] !== suitOrder[b.suit]) {
            return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return a.val - b.val;
    });
}
