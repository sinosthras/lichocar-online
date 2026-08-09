import { initNetwork, joinRoom, selectCardAndOfferer, sendDecision, attachCard, reorderBank, finishLaying } from './network.js';
import { initUI, render } from './ui.js';

let localState = null;

window.addEventListener('DOMContentLoaded', () => {
    initUI({
        onChooseOfferer: (cardIndex, offererId) => selectCardAndOfferer(cardIndex, offererId),
        onDecision: (action) => sendDecision(action),
        onAttachCard: (handIndex, targetSlotIndex) => attachCard(handIndex, targetSlotIndex),
        onReorderBank: (fromIndex, toIndex) => reorderBank(fromIndex, toIndex),
        onFinishLaying: () => finishLaying()
    });

    initNetwork(
        (data) => {
            localState = data;
            document.getElementById('lobby-container').classList.add('hidden');
            document.getElementById('game-board').classList.remove('hidden');
            document.getElementById('log-box').classList.remove('hidden');
            render(localState);
        },
        (msg) => alert(msg)
    );

    window.joinGame = function() {
        const roomCode = document.getElementById('room-code').value.trim();
        const playerName = document.getElementById('player-name').value.trim();
        const count = parseInt(document.getElementById('total-players').value);

        const slotConfigs = [];
        for (let i = 0; i < 4; i++) {
            if (i < count) {
                const isBot = document.getElementById(`p-type-${i}`).value === 'bot';
                slotConfigs.push({ isBot, active: true });
            } else {
                slotConfigs.push({ isBot: true, active: false });
            }
        }

        joinRoom(roomCode, playerName, slotConfigs);
    };
});
