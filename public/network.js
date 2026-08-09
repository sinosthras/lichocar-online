export function initNetwork(socket, callbacks) {
    socket.on('gameStateUpdate', (state) => {
        callbacks.onGameStateUpdate(state);
    });

    socket.on('errorMsg', (msg) => {
        alert(msg);
    });
}

export function sendJoinRoom(socket, roomCode, playerName, slotConfigs) {
    socket.emit('joinRoom', { roomCode, playerName, slotConfigs });
}

export function sendSelectCardAndOfferer(socket, cardIndex, offererId) {
    socket.emit('selectCardAndOfferer', { cardIndex, offererId });
}

export function sendOfferCard(socket, cardIndex) {
    socket.emit('selectOfferCard', { cardIndex });
}

export function sendPlayerDecision(socket, action) {
    socket.emit('playerDecision', { action });
}

export function sendAttachCard(socket, handIndex, targetSlotIndex) {
    socket.emit('attachCard', { handIndex, targetSlotIndex });
}

export function sendReorderBank(socket, fromIndex, toIndex) {
    socket.emit('reorderBank', { fromIndex, toIndex });
}

export function sendFinishLaying(socket) {
    socket.emit('finishLaying');
}
