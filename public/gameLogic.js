import { SUITS } from './constants.js';

export function formSetsFromCards(cardPool) {
    let unused = [...cardPool];
    let createdSets = [];
    let createdSet = true;

    while (createdSet) {
        createdSet = false;
        
        // 1. Barva (>=3)
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

        // 2. Číslo (>=3)
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

        // 3. Postupka (>=3)
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

export function checkGameOver(room) {
    let activePlayers = room.players.filter(p => p.activeInGame);
    let winner = activePlayers.find(p => p.hand.length === 0 || p.hand.every(c => c.type === 'lichocar'));
    return winner || null;
}

export function calculateScores(room) {
    let results = [];
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
        results.push({ name: p.name, score, setMatches: p.sets.length, handCount: p.hand.length });
    });
    return results;
}
