import { sendSelectCardAndOfferer, sendOfferCard, sendPlayerDecision, sendAttachCard, sendReorderBank, sendFinishLaying } from './network.js';

let selectedCardIndex = null;
let draggedHandIndex = null;

const SUIT_ICONS = {
    cervena: '♥️',
    zelena: '🟢',
    zalud: '🌰',
    kula: '🔔',
    lichocar: '⚡'
};

export function renderUI(state, socket) {
    renderPlayers(state);
    renderBank(state, socket);
    renderControls(state, socket);
    renderHand(state, socket);
    renderLogs(state);
}

function renderPlayers(state) {
    state.players.forEach(p => {
        const el = document.getElementById(`player-info-${p.id}`);
        if (!el) return;

        if (!p.activeInGame) {
            el.innerHTML = `<strong>${p.name}</strong> (Neaktivní)`;
            el.classList.remove('active-turn');
            return;
        }

        const isCurrent = state.gameState && state.gameState.activePlayer === p.id;
        if (isCurrent) {
            el.classList.add('active-turn');
        } else {
            el.classList.remove('active-turn');
        }

        let html = `<strong>${p.name}</strong> ${p.isBot ? '🤖' : '👤'}`;
        html += `<br><small>Karet v ruce: ${p.cardCount}</small>`;
        html += `<br><small>Sady (${p.sets.length}): </small>`;

        if (p.sets.length === 0) {
            html += `<em>žádné</em>`;
        } else {
            p.sets.forEach((set, sIdx) => {
                const cardPreviews = set.cards.map(c => {
                    const icon = SUIT_ICONS[c.suit] || '';
                    const val = c.type === 'lichocar' ? '⚡' : c.val;
                    return `<span class="card-mini ${c.suit}">${icon}${val}</span>`;
                }).join('');

                html += `
                    <span class="set-badge">
                        Sada ${sIdx + 1} (${set.cards.length})
                        <div class="set-tooltip">
                            ${cardPreviews}
                        </div>
                    </span>
                `;
            });
        }

        el.innerHTML = html;

        el.querySelectorAll('.set-badge').forEach(badge => {
            badge.addEventListener('mouseenter', () => {
                const tt = badge.querySelector('.set-tooltip');
                if (tt) tt.style.display = 'flex';
            });
            badge.addEventListener('mouseleave', () => {
                const tt = badge.querySelector('.set-tooltip');
                if (tt) tt.style.display = 'none';
            });
        });
    });
}

function renderBank(state, socket) {
    const container = document.getElementById('bank-cards');
    if (!container) return;
    container.innerHTML = '';

    if (!state.gameState || !state.gameState.bank) return;

    const gs = state.gameState;
    const isLayingPhase = gs.phase === 'LAYING_CARDS' && gs.layContext && gs.layContext.playerId === state.mySlotId;

    gs.bank.forEach((b, idx) => {
        const cardDiv = document.createElement('div');
        
        if (b.faceUp && b.card) {
            cardDiv.className = `card ${b.card.suit}`;
            const icon = SUIT_ICONS[b.card.suit] || '';
            const val = b.card.type === 'lichocar' ? 'LICHOČÁR' : b.card.val;
            cardDiv.innerHTML = `<span class="card-suit-icon">${icon}</span><span class="card-val">${val}</span>`;
        } else {
            cardDiv.className = 'card facedown';
            cardDiv.innerHTML = '<span class="card-val">🂠</span>';
        }

        // Drag & Drop cílové zóny pro dokládání/přeřazování karet v banku
        if (isLayingPhase) {
            cardDiv.draggable = true;
            cardDiv.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'bank', index: idx }));
            });
            cardDiv.addEventListener('dragover', (e) => e.preventDefault());
            cardDiv.addEventListener('drop', (e) => {
                e.preventDefault();
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.type === 'hand') {
                    sendAttachCard(socket, data.index, idx);
                } else if (data.type === 'bank') {
                    sendReorderBank(socket, data.index, idx);
                }
            });
        }

        container.appendChild(cardDiv);
    });

    // Drop zóna na konci banku pro přiložení karty nakonec
    if (isLayingPhase) {
        const dropZone = document.createElement('div');
        dropZone.className = 'card-slot drop-target';
        dropZone.innerText = '+ Přiložit';
        dropZone.addEventListener('dragover', (e) => e.preventDefault());
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.type === 'hand') {
                sendAttachCard(socket, data.index, gs.bank.length);
            }
        });
        container.appendChild(dropZone);
    }
}

function renderControls(state, socket) {
    const controls = document.getElementById('action-controls');
    if (!controls) return;
    controls.innerHTML = '';

    if (!state.gameState) return;
    const gs = state.gameState;
    const isMyTurn = gs.activePlayer === state.mySlotId;

    if (gs.phase === 'CHOOSE_CARD_AND_OFFERER' && isMyTurn) {
        controls.innerHTML = '<div>Vyberte kartu z ruky a zvolte hráče k výzvě:</div>';
        const btnsDiv = document.createElement('div');
        btnsDiv.className = 'action-btns';
        state.players.forEach(p => {
            if (p.id !== state.mySlotId && p.activeInGame) {
                const btn = document.createElement('button');
                btn.innerText = `Vyzvat ${p.name}`;
                btn.onclick = () => {
                    if (selectedCardIndex === null) {
                        alert('Nejprve kliknutím vyberte kartu v ruce!');
                        return;
                    }
                    sendSelectCardAndOfferer(socket, selectedCardIndex, p.id);
                    selectedCardIndex = null;
                };
                btnsDiv.appendChild(btn);
            }
        });
        controls.appendChild(btnsDiv);
    } else if (gs.phase === 'OFFERER_CHOICE' && gs.offererPlayer === state.mySlotId) {
        controls.innerHTML = '<div>Byl jste vyzván v nabídce. Vyberte kartu v ruce a potvrďte:</div>';
        const btn = document.createElement('button');
        btn.innerText = 'Položit vybranou kartu lícem dolů';
        btn.onclick = () => {
            if (selectedCardIndex === null) {
                alert('Vyberte kartu ze své ruky!');
                return;
            }
            sendOfferCard(socket, selectedCardIndex);
            selectedCardIndex = null;
        };
        controls.appendChild(btn);
    } else if (gs.phase === 'DECISION' && isMyTurn) {
        const btnsDiv = document.createElement('div');
        btnsDiv.className = 'action-btns';

        const bMore = document.createElement('button');
        bMore.innerText = 'Chci ještě!';
        bMore.onclick = () => sendPlayerDecision(socket, 'MORE');

        const bAcc = document.createElement('button');
        bAcc.innerText = 'Přijímám nabídku';
        bAcc.onclick = () => sendPlayerDecision(socket, 'ACCEPT');

        const bRej = document.createElement('button');
        bRej.innerText = 'Odmítám nabídku';
        bRej.onclick = () => sendPlayerDecision(socket, 'REJECT');

        btnsDiv.appendChild(bMore);
        btnsDiv.appendChild(bAcc);
        btnsDiv.appendChild(bRej);
        controls.appendChild(btnsDiv);
    } else if (gs.phase === 'LAYING_CARDS' && gs.layContext && gs.layContext.playerId === state.mySlotId) {
        controls.innerHTML = '<div>Přetahujte karty z ruky do banku pro tvorbu sad.</div>';
        const bFinish = document.createElement('button');
        bFinish.innerText = 'Dokončit vykládání';
        bFinish.onclick = () => sendFinishLaying(socket);
        controls.appendChild(bFinish);
    }
}

function renderHand(state, socket) {
    const container = document.getElementById('my-hand');
    if (!container) return;
    container.innerHTML = '';

    const myPlayer = state.players.find(p => p.id === state.mySlotId);
    if (!myPlayer || !myPlayer.hand) return;

    const gs = state.gameState;

    myPlayer.hand.forEach((card, idx) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${card.suit}`;
        
        const icon = SUIT_ICONS[card.suit] || '';
        const val = card.type === 'lichocar' ? 'LICHOČÁR' : card.val;
        cardDiv.innerHTML = `<span class="card-suit-icon">${icon}</span><span class="card-val">${val}</span>`;

        let isPlayable = false;
        let isDisabled = false;

        if (gs) {
            // 1. ZAHÁJENÍ NABÍDKY: Všechny normální karty lze vyložit, Lichočár NE
            if (gs.phase === 'CHOOSE_CARD_AND_OFFERER' && gs.activePlayer === state.mySlotId) {
                if (card.type === 'lichocar') {
                    isDisabled = true;
                } else {
                    isPlayable = true;
                }
            }
            // 2. REAKCE NABÍZEJÍCÍHO: Svítí karty stejné barvy s vyšší hodnotou + Lichočáry
            else if (gs.phase === 'OFFERER_CHOICE' && gs.offererPlayer === state.mySlotId) {
                if (card.type === 'lichocar' || (card.type === 'normal' && card.suit === gs.targetSuit && card.val > gs.lastOfferValue)) {
                    isPlayable = true;
                }
            }
            // 3. DOKLÁDÁNÍ DO BANKU: Svítí normální karty
            else if (gs.phase === 'LAYING_CARDS' && gs.layContext && gs.layContext.playerId === state.mySlotId) {
                if (card.type === 'normal') {
                    isPlayable = true;
                }
            }
        }

        if (isDisabled) {
            cardDiv.classList.add('disabled');
        } else if (isPlayable) {
            cardDiv.classList.add('playable');
        }

        if (selectedCardIndex === idx) {
            cardDiv.classList.add('selected');
        }

        // Drag & Drop z ruky
        cardDiv.draggable = !isDisabled;
        cardDiv.addEventListener('dragstart', (e) => {
            draggedHandIndex = idx;
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'hand', index: idx }));
        });

        cardDiv.onclick = () => {
            if (isDisabled) return;
            selectedCardIndex = idx;
            renderHand(state, socket);
        };

        container.appendChild(cardDiv);
    });
}

function renderLogs(state) {
    const container = document.getElementById('game-logs');
    if (!container || !state.gameState) return;
    container.innerHTML = state.gameState.logs.map(l => `<div>${l}</div>`).join('');
    container.scrollTop = container.scrollHeight;
}
