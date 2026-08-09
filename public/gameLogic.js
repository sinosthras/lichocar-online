/**
 * Kontrola a tvorba platných sad.
 * Sady mohou být:
 * 1. Stejná barva (≥ 3 karty)
 * 2. Stejná hodnota/číslo (≥ 3 karty)
 * 3. Postupka stejné barvy nebo namíchaná (≥ 3 karty s hodnotami plynule po sobě)
 */
export function formSetsFromCards(cards) {
    let available = [...cards].filter(c => c.type === 'normal');
    const createdSets = [];

    // Pomocná funkce pro vyhledání sad podle priority
    let found = true;
    while (found && available.length >= 3) {
        found = false;

        // A) Sady podle stejné hodnota (např. 3x Osmička)
        const byVal = {};
        available.forEach(c => {
            byVal[c.val] = byVal[c.val] || [];
            byVal[c.val].push(c);
        });
        for (const val in byVal) {
            if (byVal[val].length >= 3) {
                const setCards = byVal[val];
                createdSets.push({ type: 'SAME_VALUE', cards: setCards });
                available = available.filter(c => !setCards.includes(c));
                found = true;
                break;
            }
        }
        if (found) continue;

        // B) Sady podle stejné barvy (např. 3x Červená)
        const bySuit = {};
        available.forEach(c => {
            bySuit[c.suit] = bySuit[c.suit] || [];
            bySuit[c.suit].push(c);
        });
        for (const suit in bySuit) {
            if (bySuit[suit].length >= 3) {
                const setCards = bySuit[suit];
                createdSets.push({ type: 'SAME_SUIT', cards: setCards });
                available = available.filter(c => !setCards.includes(c));
                found = true;
                break;
            }
        }
        if (found) continue;

        // C) Postupky (vzestupné / sestupné - seřazením hodnot)
        // Seřadíme dostupné karty unikátně podle hodnoty
        const sorted = [...available].sort((a, b) => a.val - b.val);
        for (let i = 0; i <= sorted.length - 3; i++) {
            let run = [sorted[i]];
            for (let j = i + 1; j < sorted.length; j++) {
                if (sorted[j].val === run[run.length - 1].val + 1) {
                    run.push(sorted[j]);
                } else if (sorted[j].val > run[run.length - 1].val + 1) {
                    break;
                }
            }
            if (run.length >= 3) {
                createdSets.push({ type: 'RUN', cards: run });
                available = available.filter(c => !run.includes(c));
                found = true;
                break;
            }
        }
    }

    return {
        createdSets,
        unused: available.concat([...cards].filter(c => c.type === 'lichocar'))
    };
}

export function checkGameOver(room) {
    const activePlayers = room.players.filter(p => p.activeInGame);
    for (let player of activePlayers) {
        if (player.hand.length === 0) {
            return player;
        }
    }
    return null;
}

export function calculateScores(room) {
    return room.players.filter(p => p.activeInGame).map(p => {
        const setMatches = p.sets.reduce((sum, s) => sum + s.cards.length, 0);
        const handCount = p.hand.length;
        const score = setMatches - handCount;
        return { name: p.name, score, setMatches, handCount };
    });
}
