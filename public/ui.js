import { SUIT_ICONS } from './constants.js';

let uiCallbacks = {};
let selectedCardIndex = null;
let draggedSource = null;

export function initUI(callbacks) {
    uiCallbacks = callbacks;

    document.getElementById('total-players').onchange = renderPlayerSetup;
    renderPlayerSetup();

    document.getElementById('btn-accept').onclick = () => uiCallbacks.onDecision('ACCEPT');
    document.getElementById('btn-more').onclick = () => uiCallbacks.onDecision('MORE');
    document.getElementById('btn-reject').onclick = () => uiCallbacks.onDecision('REJECT');
    document.getElementById('btn-finish-lay').onclick = () => uiCallbacks.onFinishLaying();
}

export function renderPlayerSetup() {
    const count = parseInt(document.getElementById('total-players').value);
    const container = document.getElementById('player-slots-setup');
    container.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'slot-row';
        div.innerHTML = `
            <label>Pozice ${i + 1} ${i === 0 ? '(Zakladatel)' : ''}:</label>
            <select id="p-type-${i}">
                <option value="human">Živý hráč</option>
                <option value="bot" ${i > 0 ? 'selected' : ''}>Bot</option>
            </select>
        `;
        container.appendChild(div);
    }
}

export function render(localState) {
    if (!localState) return;
    const mySlotId = localState.mySlotId;
    const mapSlot = (slot) => (slot - mySlotId + 4) % 4;

    localState.players.forEach(p => {
        const mappedPos = mapSlot(p.id);
        const panel = document.getElementById(`p${mappedPos}`);

        if (!p.activeInGame) {
            panel.classList.add('hidden');
            return;
        }
        panel.classList.remove('hidden');

        if (mappedPos === 0) {
            document.getElementById('p0-title').innerText = `${p.name} (VY)`;
        } else {
            document.getElementById(`p${mappedPos}-title`).innerText = `${p.name} ${p.isBot ? '(Bot)' : ''}`;
            document.getElementById(`p${mappedPos}-count`).innerText = p.cardCount;
        }
        document.getElementById(`p${mappedPos}-sets`).innerHTML = renderSetsHTML(p.sets);

        const gs = localState.gameState;
        if (gs) {
            panel.classList.toggle('active', gs.offererPlayer === p.id || (gs.activePlayer === p.id && gs.phase === 'CHOOSE_CARD_AND_OFFERER'));
        }

        if (mappedPos !== 0 && gs && gs.phase === 'CHOOSE_CARD_AND_OFFERER' && gs.activePlayer === mySlotId && selectedCardIndex !== null) {
            panel.style.cursor = 'pointer';
            panel.onclick = () => {
                uiCallbacks.onChooseOfferer(selectedCardIndex, p.id);
                selectedCardIndex = null;
            };
        } else if (mappedPos !== 0) {
            panel.style.cursor = 'default';
            panel.onclick = null;
        }
    });

    const myPlayer = localState.players[mySlotId];
    const handBox = document.getElementById('p0-hand');
    handBox.innerHTML = '';
    const gs = localState.gameState;

    myPlayer.hand.forEach((card, idx) => {
        const cDiv = document.createElement('div');
        cDiv.draggable = true;

        if (card.type === 'lichocar') {
            cDiv.className = 'card lichocar';
            cDiv.innerHTML = `😈`;
        } else {
            cDiv.className = `card ${card.suit}`;
            cDiv.innerHTML = `<div>${card.val}</div><div>${SUIT_ICONS[card.suit]}</div>`;
        }

        let isLegitOffer = false;
        if (gs) {
            if (gs.phase === 'CHOOSE_CARD_AND_OFFERER' && gs.activePlayer === mySlotId) {
                isLegitOffer = true;
            } else if (gs.phase === 'OFFERING' && gs.offererPlayer === mySlotId) {
                if (card.type === 'lichocar' || (card.suit === gs.targetSuit && card.val > gs.lastOfferValue)) {
                    isLegitOffer = true;
                }
            } else if (gs.phase === 'LAYING_CARDS' && gs.layContext.playerId === mySlotId) {
                isLegitOffer = card.type !== 'lichocar';
            }
        }

        if (isLegitOffer) cDiv.classList.add('highlighted');
        else if (gs && (gs.phase === 'LAYING_CARDS' || gs.phase === 'OFFERING')) cDiv.classList.add('disabled');

        if (selectedCardIndex === idx) cDiv.classList.add('selected');

        cDiv.onclick = () => {
            if (!gs) return;
            if (gs.phase === 'CHOOSE_CARD_AND_OFFERER' && gs.activePlayer === mySlotId) {
                selectedCardIndex = idx;
                render(localState);
            } else if (gs.phase === 'LAYING_CARDS' && gs.layContext.playerId === mySlotId) {
                uiCallbacks.onAttachCard(idx, null);
            }
        };

        cDiv.ondragstart = () => { draggedSource = { source: 'hand', index: idx }; };
        handBox.appendChild(cDiv);
    });

    const bankBox = document.getElementById('bank-cards');
    bankBox.innerHTML = '';

    if (!localState.started) {
        document.getElementById('bank-status').innerText = 'Čeká se na připojení všech živých hráčů...';
        return;
    }

    if (gs) {
        let displayCards = gs.phase === 'LAYING_CARDS' ? gs.layContext.cardsFromBank : gs.bank;
        
        if (gs.phase === 'LAYING_CARDS' && gs.layContext.playerId === mySlotId) {
            bankBox.appendChild(createDropSlot(0, localState));
        }

        displayCards.forEach((item, idx) => {
            const card = item.card || item;
            const cDiv = document.createElement('div');
            cDiv.draggable = (gs.phase === 'LAYING_CARDS' && gs.layContext.playerId === mySlotId);

            if (item.faceUp || gs.phase === 'LAYING_CARDS') {
                if (card.type === 'lichocar') {
                    cDiv.className = 'card lichocar';
                    cDiv.innerHTML = `😈`;
                } else {
                    cDiv.className = `card ${card.suit}`;
                    cDiv.innerHTML = `<div>${card.val}</div><div>${SUIT_ICONS[card.suit]}</div>`;
                }
                if (gs.phase === 'LAYING_CARDS') {
                    if (gs.validSetCardIndices && gs.validSetCardIndices[idx]) {
                        cDiv.classList.add('valid-set');
                    } else {
                        cDiv.classList.add('invalid-set');
                    }
                }
            } else {
                cDiv.className = 'card back';
                cDiv.innerText = '?';
            }

            cDiv.ondragstart = () => { draggedSource = { source: 'bank', index: idx }; };
            bankBox.appendChild(cDiv);

            if (gs.phase === 'LAYING_CARDS' && gs.layContext.playerId === mySlotId) {
                bankBox.appendChild(createDropSlot(idx + 1, localState));
            }
        });

        const isMyDecision = gs.phase === 'DECISION' && gs.activePlayer === mySlotId;
        const isMyLaying = gs.phase === 'LAYING_CARDS' && gs.layContext.playerId === mySlotId;

        document.getElementById('btn-accept').disabled = !isMyDecision;
        document.getElementById('btn-more').disabled = !isMyDecision;
        document.getElementById('btn-reject').disabled = !isMyDecision;
        document.getElementById('btn-finish-lay').disabled = !isMyLaying;

        const statusBox = document.getElementById('bank-status');
        if (gs.phase === 'CHOOSE_CARD_AND_OFFERER' && gs.activePlayer === mySlotId) {
            statusBox.innerText = selectedCardIndex !== null ? 'Nyní klikněte na protihráče!' : 'Vyberte kartu ze své ruky.';
        } else if (isMyDecision) {
            statusBox.innerText = 'Vaše volba! Přijmete, odmítnete, nebo chcete ještě?';
        } else if (isMyLaying) {
            statusBox.innerText = `Přikládání (${gs.layContext.attachedCount}/${gs.layContext.maxAttachCount}). Zeleně svítící karty tvoří platnou sadu.`;
        } else {
            statusBox.innerText = `Na tahu je ${localState.players[gs.activePlayer].name}.`;
        }

        const logBox = document.getElementById('log-box');
        logBox.innerHTML = gs.logs.map(l => `> ${l}`).join('<br>');
        logBox.scrollTop = logBox.scrollHeight;
    }
}

function createDropSlot(idx, localState) {
    const slot = document.createElement('div');
    slot.className = 'drop-slot';
    slot.ondragover = (e) => { e.preventDefault(); slot.classList.add('drag-over'); };
    slot.ondragleave = () => slot.classList.remove('drag-over');
    slot.ondrop = (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        if (!draggedSource) return;
        if (draggedSource.source === 'hand') {
            uiCallbacks.onAttachCard(draggedSource.index, idx);
        } else if (draggedSource.source === 'bank') {
            uiCallbacks.onReorderBank(draggedSource.index, idx);
        }
        draggedSource = null;
    };
    return slot;
}

function renderSetsHTML(sets) {
    if (!sets || sets.length === 0) return '<i>Žádné</i>';
    return sets.map(s => {
        let label = "";
        if (s.type === 'barva') label = `${SUIT_ICONS[s.cards[0].suit]} Barva (${s.cards.length})`;
        else if (s.type === 'cislo') label = `Stejné č. ${s.cards[0].val} (${s.cards.length})`;
        else if (s.type === 'postupka') label = `Postupka ${s.cards[0].val}-${s.cards[s.cards.length-1].val} (${s.cards.length})`;
        return `<span class="set-group">${label}</span>`;
    }).join(' ');
}
