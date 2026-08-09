import { sendSelectCardAndOfferer, sendOfferCard, sendPlayerDecision, sendAttachCard, sendReorderBank, sendFinishLaying } from './network.js';

let selectedCardIndex = null;

export function renderUI(state, socket) {
    renderPlayers(state);
    renderBank(state);
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
            return;
        }

        const isCurrent = state.gameState && state.gameState.activePlayer === p.id;
        let html = `<strong style="${isCurrent ? 'color: #d32f2f;' : ''}">${p.name}</strong>`;
        html += `<br>Karet v ruce: ${p.cardCount}`;
        html += `<br>Sady (${p.sets.length}): `;

        // 4. Grafický tooltip sad po najetí myší
        if (p.sets.length === 0) {
            html += `<em>žádné</em>`;
        } else {
            p.sets.forEach((set, sIdx) => {
                const cardPreviews = set.cards.map(c => 
                    `<span class="card-mini ${c.suit}">${c.type === 'lichocar' ? '⚡' : c.val}</span>`
                ).join('');

                html += `
                    <span class="set-badge" style="position: relative; display: inline-block; margin-right: 5px; cursor: pointer; text-decoration: underline;">
                        Sada ${sIdx + 1} (${set.cards.length})
                        <div class="set-tooltip" style="display: none; position: absolute; bottom: 120%; left: 0; background: #222; padding: 6px; border-radius: 4px; z-index: 100; white-space: nowrap; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
                            ${cardPreviews}
                        </div>
                    </span>
                `;
            });
        }

        el.innerHTML = html;

        // Přidání hover eventů pro tooltip
        el.querySelectorAll('.set-badge').forEach(badge => {
            badge.addEventListener('mouseenter', () => {
                const tt = badge.querySelector('.set-tooltip');
                if (tt) tt.style.display = 'block';
            });
            badge.addEventListener('mouseleave', () => {
                const tt = badge.querySelector('.set-tooltip');
                if (tt) tt.style.display = 'none';
            });
        });
    });
}

function renderBank(state) {
    const container = document.getElementById('bank-cards');
    if (!container) return;
    container.innerHTML = '';

    if (!state.gameState || !state.gameState.bank) return;

    state.gameState.bank.forEach(b => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card-slot';
        if (b.faceUp && b.card) {
            cardDiv.classList.add(b.card.suit);
            cardDiv.innerText = b.card.type === 'lichocar' ? 'LICHOČÁR' : `${b.card.suit.toUpperCase()} ${b.card.val}`;
        } else {
            cardDiv.classList.add('facedown');
            cardDiv.innerText = '🂠';
        }
        container.appendChild(cardDiv);
    });
}

function renderControls(state, socket) {
    const controls = document.getElementById('action-controls');
    if (!controls) return;
    controls.innerHTML = '';

    if (!state.gameState) return;
    const gs = state.gameState;
    const isMyTurn = gs.activePlayer === state.mySlotId;

    if (gs.phase === 'CHOOSE_CARD_AND_OFFERER' && isMyTurn) {
        controls.innerText = 'Vyber kartu z ruky a zvol hráče, kterého vyzveš:';
        state.players.forEach(p => {
            if (p.id !== state.mySlotId && p.activeInGame) {
                const btn = document.createElement('button');
                btn.innerText = `Vyzvat ${p.name}`;
                btn.onclick = () => {
                    if (selectedCardIndex === null) {
                        alert('Nejprve vyber kartu v ruce!');
                        return;
                    }
                    sendSelectCardAndOfferer(socket, selectedCardIndex, p.id);
                    selectedCardIndex = null;
                };
                controls.appendChild(btn);
            }
        });
    } else if (gs.phase === 'OFFERER_CHOICE' && gs.offererPlayer === state.mySlotId) {
        controls.innerText = 'Byl jste vyzván v nabídce. Vyberte kartu ze své ruky, kterou položíte lícem dolů:';
        const btn = document.createElement('button');
        btn.innerText = 'Potvrdit vybranou kartu';
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
        const bMore = document.createElement('button');
        bMore.innerText = 'Chci ještě!';
        bMore.onclick = () => sendPlayerDecision(socket, 'MORE');

        const bAcc = document.createElement('button');
        bAcc.innerText = 'Přijímám nabídku';
        bAcc.onclick = () => sendPlayerDecision(socket, 'ACCEPT');

        const bRej = document.createElement('button');
        bRej.innerText = 'Odmítám nabídku';
        bRej.onclick = () => sendPlayerDecision(socket, 'REJECT');

        controls.appendChild(bMore);
        controls.appendChild(bAcc);
        controls.appendChild(bRej);
    } else if (gs.phase === 'LAYING_CARDS' && gs.layContext.playerId === state.mySlotId) {
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
        cardDiv.innerText = card.type === 'lichocar' ? 'LICHOČÁR' : `${card.suit.toUpperCase()} ${card.val}`;

        // 1. ZÁKAZ Lichočára pro zahájení nabídky
        if (gs && gs.phase === 'CHOOSE_CARD_AND_OFFERER' && gs.activePlayer === state.mySlotId && card.type === 'lichocar') {
            cardDiv.classList.add('disabled');
            cardDiv.style.opacity = '0.4';
            cardDiv.style.cursor = 'not-allowed';
        } else {
            if (selectedCardIndex === idx) cardDiv.classList.add('selected');
            cardDiv.onclick = () => {
                selectedCardIndex = idx;
                renderHand(state, socket);
            };
        }

        container.appendChild(cardDiv);
    });
}

function renderLogs(state) {
    const container = document.getElementById('game-logs');
    if (!container || !state.gameState) return;
    container.innerHTML = state.gameState.logs.map(l => `<div>${l}</div>`).join('');
    container.scrollTop = container.scrollHeight;
}
