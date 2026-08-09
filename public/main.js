import { initNetwork, sendJoinRoom } from './network.js';
import { renderUI } from './ui.js';

const socket = io();

let currentState = null;

initNetwork(socket, {
    onGameStateUpdate: (state) => {
        currentState = state;
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('game-view').style.display = 'block';
        renderUI(currentState, socket);
    }
});

document.getElementById('btn-join').addEventListener('click', () => {
    const roomCode = document.getElementById('room-code').value.trim() || 'LOBBY1';
    const playerName = document.getElementById('player-name').value.trim() || 'Hráč';

    // Sesbírání konfigurace pro všech 4 sloty
    const slotConfigs = [];
    const rows = document.querySelectorAll('#slot-configs .slot-row');
    
    rows.forEach(row => {
        const type = row.querySelector('.slot-type').value;
        slotConfigs.push({
            isBot: type === 'bot',
            active: type !== 'inactive'
        });
    });

    sendJoinRoom(socket, roomCode, playerName, slotConfigs);
});
