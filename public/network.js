let socket = null;

export function initNetwork(onStateUpdate, onError) {
    socket = io();

    socket.on('errorMsg', onError);
    socket.on('gameStateUpdate', onStateUpdate);
}

export function joinRoom(roomCode, playerName, slotConfigs) {
    socket.emit('joinRoom', { roomCode, playerName, slotConfigs });
}

export function selectCardAndOfferer(cardIndex, offererId) {
    socket.emit('selectCardAndOfferer', { cardIndex, offererId });
}

export function sendDecision(action) {
    socket.emit('playerDecision', { action });
}

export function attachCard(handIndex, targetSlotIndex) {
    socket.emit('attachCard', { handIndex, targetSlotIndex });
}

export function reorderBank(fromIndex, toIndex) {
    socket.emit('reorderBank', { fromIndex, toIndex });
}

export function finishLaying() {
    socket.emit('finishLaying');
}
