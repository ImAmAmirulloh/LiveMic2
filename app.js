/**
 * Live Mic - Audio Conference Application
 * Menggunakan WebRTC untuk real-time audio streaming
 * Dengan Socket.IO signaling server
 */

// ===== Configuration =====
const CONFIG = {
    // Railway Server URL
    SERVER_URL: 'https://reliable-clarity.up.railway.app',

    // STUN/TURN servers untuk WebRTC
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ===== State Management =====
const state = {
    mode: null, // 'speaker' or 'listener'
    userName: null,
    roomCode: null,
    isLive: false,
    isConnected: false,
    localStream: null,
    peerConnections: new Map(), // Map of socketId -> RTCPeerConnection
    audioElement: null,
    listenerCount: 0,
    listeners: new Map(), // Map of socketId -> { name, joinedAt }
    speakerName: null,
    socket: null,
    connectedPeers: new Set() // Track connected peers for audio
};

// ===== DOM Elements =====
const elements = {
    modeSection: document.getElementById('modeSection'),
    speakerSection: document.getElementById('speakerSection'),
    listenerSection: document.getElementById('listenerSection'),
    roomCode: document.getElementById('roomCode'),
    micBtn: document.getElementById('micBtn'),
    micBtnText: document.getElementById('micBtnText'),
    micStatus: document.getElementById('micStatus'),
    listenerCount: document.getElementById('listenerCount'),
    roomInput: document.getElementById('roomInput'),
    nameInput: document.getElementById('nameInput'),
    listeningPanel: document.getElementById('listeningPanel'),
    currentRoom: document.getElementById('currentRoom'),
    myName: document.getElementById('myName'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    permissionModal: document.getElementById('permissionModal'),
    listenerListContainer: document.getElementById('listenerListContainer')
};

// ===== Utility Functions =====

/**
 * Generate random room code
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Show toast notification
 */
function showToast(message, duration = 3000) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.remove('hidden');
    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, duration);
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Kode berhasil disalin!');
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Kode berhasil disalin!');
    }
}

/**
 * Get initials from name
 */
function getInitials(name) {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/**
 * Format time ago
 */
function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Baru saja';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

// ===== Socket.IO Connection =====

/**
 * Initialize Socket.IO connection
 */
function initSocket() {
    // Load Socket.IO if not already loaded
    if (!window.io) {
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
        script.onload = () => connectToServer();
        document.head.appendChild(script);
    } else {
        connectToServer();
    }
}

/**
 * Connect to signaling server
 */
function connectToServer() {
    state.socket = io(CONFIG.SERVER_URL, {
        transports: ['websocket', 'polling']
    });

    state.socket.on('connect', () => {
        console.log('Connected to signaling server');
    });

    state.socket.on('disconnect', () => {
        console.log('Disconnected from signaling server');
        showToast('Koneksi terputus. Menghubungkan ulang...');
    });

    state.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showToast('Gagal terhubung ke server. Pastikan server berjalan.');
    });

    // ===== Speaker Events =====
    state.socket.on('listener-joined', (data) => {
        console.log('Listener joined:', data);
        addListener(data.socketId, data.name, data.joinedAt);
        showToast(`${data.name} bergabung`);

        // Send WebRTC offer to new listener
        if (state.isLive && state.localStream) {
            createOfferForListener(data.socketId);
        }
    });

    state.socket.on('listener-left', (data) => {
        console.log('Listener left:', data);
        removeListener(data.socketId);
        showToast(`${data.name} keluar`);

        // Close peer connection
        closePeerConnection(data.socketId);
    });

    state.socket.on('listener-count', (data) => {
        state.listenerCount = data.count;
        elements.listenerCount.textContent = data.count;
    });

    state.socket.on('speaker-live', () => {
        showToast('Pembicara sedang live!');
    });

    state.socket.on('speaker-ended', () => {
        showToast('Pembicara mengakhiri streaming');
        leaveRoom();
    });

    // ===== WebRTC Signaling Events =====
    state.socket.on('offer', async (data) => {
        console.log('Received offer from:', data.fromName);
        await handleOffer(data.offer, data.from, data.fromName);
    });

    state.socket.on('answer', async (data) => {
        console.log('Received answer from:', data.from);
        await handleAnswer(data.answer, data.from);
    });

    state.socket.on('ice-candidate', async (data) => {
        await handleIceCandidate(data.candidate, data.from);
    });

    // ===== Listener: Handle speaker going live =====
    state.socket.on('speaker-live', () => {
        showToast('Pembicara sedang live!');
        // Create peer connection to receive audio
        if (state.mode === 'listener' && state.isConnected) {
            createListenerPeerConnection();
        }
    });

    state.socket.on('speaker-ended', () => {
        showToast('Pembicara mengakhiri streaming');
        // Close all peer connections
        state.peerConnections.forEach((pc) => pc.close());
        state.peerConnections.clear();
        if (state.audioElement) {
            state.audioElement.srcObject = null;
        }
        leaveRoom();
    });
}

// ===== Navigation Functions =====

/**
 * Select mode (speaker or listener)
 */
function selectMode(mode) {
    // Validate name for listener
    if (mode === 'listener') {
        const name = elements.nameInput.value.trim();
        if (!name) {
            showToast('Masukkan nama Anda terlebih dahulu');
            elements.nameInput.focus();
            return;
        }
        state.userName = name;
    }

    state.mode = mode;

    if (mode === 'speaker') {
        elements.modeSection.classList.add('hidden');
        elements.speakerSection.classList.remove('hidden');
        state.roomCode = generateRoomCode();
        elements.roomCode.textContent = state.roomCode;
    } else {
        elements.modeSection.classList.add('hidden');
        elements.listenerSection.classList.remove('hidden');
    }
}

/**
 * Go back to mode selection
 */
function goBack() {
    if (state.isLive) {
        stopStreaming();
    }
    if (state.isConnected) {
        leaveRoom();
    }

    // Disconnect socket
    if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
    }

    // Reset state
    state.mode = null;
    state.userName = null;
    state.roomCode = null;
    state.isLive = false;
    state.isConnected = false;
    state.listenerCount = 0;
    state.listeners.clear();
    state.connectedPeers.clear();

    // Reset peer connections
    state.peerConnections.forEach((pc) => pc.close());
    state.peerConnections.clear();

    // Reset UI
    elements.micStatus.classList.remove('active');
    elements.micBtn.classList.remove('live');
    elements.micBtnText.textContent = 'Tap to Go Live';
    elements.listeningPanel.classList.add('hidden');
    elements.roomInput.value = '';
    elements.listenerCount.textContent = '0';
    elements.nameInput.value = '';
    renderListenerList();

    // Show mode selection
    elements.speakerSection.classList.add('hidden');
    elements.listenerSection.classList.add('hidden');
    elements.modeSection.classList.remove('hidden');
}

// ===== Listener List Functions =====

/**
 * Add listener to the list
 */
function addListener(socketId, name, joinedAt) {
    state.listeners.set(socketId, { name, joinedAt });
    state.listenerCount = state.listeners.size;
    elements.listenerCount.textContent = state.listenerCount;
    renderListenerList();
}

/**
 * Remove listener from the list
 */
function removeListener(socketId) {
    state.listeners.delete(socketId);
    state.listenerCount = state.listeners.size;
    elements.listenerCount.textContent = state.listenerCount;
    renderListenerList();
}

/**
 * Render listener list in UI
 */
function renderListenerList() {
    if (state.listeners.size === 0) {
        elements.listenerListContainer.innerHTML = `
            <div class="empty-list">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>Belum ada pendengar</p>
            </div>
        `;
        return;
    }

    const html = Array.from(state.listeners.entries())
        .map(([socketId, data]) => `
            <div class="listener-item" data-id="${socketId}">
                <div class="listener-avatar">${getInitials(data.name)}</div>
                <div class="listener-info">
                    <div class="listener-name">${escapeHtml(data.name)}</div>
                    <div class="listener-status">
                        <span class="listener-status-dot"></span>
                        <span>Online</span>
                    </div>
                </div>
                <div class="listener-join-time">${timeAgo(data.joinedAt)}</div>
            </div>
        `).join('');

    elements.listenerListContainer.innerHTML = html;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Speaker Functions =====

/**
 * Request microphone permission
 */
function requestMicPermission() {
    elements.permissionModal.classList.remove('hidden');
}

/**
 * Close permission modal
 */
function closePermissionModal() {
    elements.permissionModal.classList.add('hidden');
}

/**
 * Toggle microphone on/off
 */
async function toggleMic() {
    if (!state.isLive) {
        // Request permission and start streaming
        await startStreaming();
    } else {
        // Stop streaming
        stopStreaming();
    }
}

/**
 * Start audio streaming
 */
async function startStreaming() {
    try {
        // Request microphone access
        state.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create room on server
        state.socket.emit('create-room', {
            roomCode: state.roomCode,
            name: 'Speaker'
        }, (response) => {
            if (!response.success) {
                showToast(response.error || 'Gagal membuat room');
                return;
            }

            state.isLive = true;
            state.isConnected = true;

            // Update UI
            elements.micStatus.classList.add('active');
            elements.micBtn.classList.add('live');
            elements.micBtnText.textContent = 'Tap to End';

            // Notify server that speaker is live
            state.socket.emit('go-live');

            // Re-create peer connections for all existing listeners
            state.listeners.forEach((data, socketId) => {
                createOfferForListener(socketId);
            });

            showToast('Streaming aktif! Pendengar dapat mendengar Anda.');
        });

    } catch (err) {
        console.error('Error starting stream:', err);
        closePermissionModal();
        showToast('Gagal mengakses mikrofon. Pastikan izin diberikan.');
    }
}

/**
 * Stop audio streaming
 */
function stopStreaming() {
    // Notify server
    if (state.socket && state.isConnected) {
        state.socket.emit('end-live');
    }

    // Stop all tracks
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
        state.localStream = null;
    }

    // Close all peer connections
    state.peerConnections.forEach((pc) => pc.close());
    state.peerConnections.clear();
    state.connectedPeers.clear();

    state.isLive = false;

    // Update UI
    elements.micStatus.classList.remove('active');
    elements.micBtn.classList.remove('live');
    elements.micBtnText.textContent = 'Tap to Go Live';

    showToast('Streaming dihentikan.');
}

/**
 * Copy room code to clipboard
 */
function copyRoomCode() {
    copyToClipboard(state.roomCode);
}

// ===== WebRTC Functions =====

/**
 * Create WebRTC peer connection
 */
function createPeerConnection(targetSocketId) {
    if (state.peerConnections.has(targetSocketId)) {
        return state.peerConnections.get(targetSocketId);
    }

    const pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });

    // Add local stream tracks
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            pc.addTrack(track, state.localStream);
        });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to:', targetSocketId);
            state.socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: targetSocketId,
                type: 'speaker'
            });
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`Connection with ${targetSocketId}:`, pc.connectionState);
        if (pc.connectionState === 'connected') {
            state.connectedPeers.add(targetSocketId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            state.connectedPeers.delete(targetSocketId);
        }
    };

    state.peerConnections.set(targetSocketId, pc);
    return pc;
}

/**
 * Create offer for listener
 */
async function createOfferForListener(listenerSocketId) {
    const pc = createPeerConnection(listenerSocketId);

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        console.log('Sending offer to:', listenerSocketId);
        state.socket.emit('offer', {
            offer: pc.localDescription,
            to: listenerSocketId
        });
    } catch (err) {
        console.error('Error creating offer:', err);
    }
}

/**
 * Handle incoming offer from listener
 */
async function handleOffer(offer, fromSocketId, fromName) {
    const pc = createPeerConnection(fromSocketId);

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log('Sending answer to:', fromSocketId);
        state.socket.emit('answer', {
            answer: pc.localDescription,
            to: fromSocketId
        });

        // Add to listeners if not already
        if (!state.listeners.has(fromSocketId)) {
            addListener(fromSocketId, fromName, Date.now());
        }
    } catch (err) {
        console.error('Error handling offer:', err);
    }
}

/**
 * Handle incoming answer from speaker
 */
async function handleAnswer(answer, fromSocketId) {
    const pc = state.peerConnections.get(fromSocketId);
    if (!pc) {
        console.error('No peer connection found for:', fromSocketId);
        return;
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
    }
}

/**
 * Handle incoming ICE candidate
 */
async function handleIceCandidate(candidate, fromSocketId) {
    const pc = state.peerConnections.get(fromSocketId);
    if (!pc) {
        console.error('No peer connection found for:', fromSocketId);
        return;
    }

    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
}

/**
 * Close peer connection
 */
function closePeerConnection(socketId) {
    const pc = state.peerConnections.get(socketId);
    if (pc) {
        pc.close();
        state.peerConnections.delete(socketId);
        state.connectedPeers.delete(socketId);
    }
}

// ===== Listener WebRTC Functions =====

/**
 * Create peer connection for listener to receive audio from speaker
 */
function createListenerPeerConnection() {
    // For listener, we need to connect to the speaker
    // The speaker socket ID is stored when joining
    // We'll create a connection and wait for the offer

    const pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });

    // Handle incoming tracks (audio from speaker)
    pc.ontrack = (event) => {
        console.log('Received audio track from speaker:', event.track);
        if (state.audioElement) {
            state.audioElement.srcObject = event.streams[0];
            // Try to play
            state.audioElement.play().catch(err => {
                console.log('Auto-play prevented, user interaction required');
            });
        }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to speaker');
            state.socket.emit('ice-candidate', {
                candidate: event.candidate,
                type: 'listener'
            });
        }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log('Listener connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
            showToast('Terhubung ke pembicara!');
        }
    };

    // Store the peer connection
    state.peerConnections.set('speaker', pc);
    return pc;
}

/**
 * Handle answer from speaker (for listener)
 */
async function handleAnswer(answer, fromSocketId) {
    const pc = state.peerConnections.get('speaker') || state.peerConnections.get(fromSocketId);
    if (!pc) {
        console.error('No peer connection found for listener');
        return;
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
    }
}

// ===== Listener Functions =====

/**
 * Join a room
 */
async function joinRoom() {
    const name = elements.nameInput.value.trim();
    const roomCode = elements.roomInput.value.trim().toUpperCase();

    if (!name) {
        showToast('Masukkan nama Anda terlebih dahulu');
        elements.nameInput.focus();
        return;
    }

    if (roomCode.length < 4) {
        showToast('Masukkan kode room yang valid');
        elements.roomInput.focus();
        return;
    }

    state.userName = name;
    state.roomCode = roomCode;

    try {
        // Request microphone for echo cancellation
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        // Connect to room
        state.socket.emit('join-room', {
            roomCode: roomCode,
            name: name
        }, (response) => {
            if (!response.success) {
                showToast(response.error || 'Gagal bergabung');
                return;
            }

            state.speakerName = response.speakerName;
            state.isConnected = true;

            // Create audio element for receiving audio
            state.audioElement = document.createElement('audio');
            state.audioElement.autoplay = true;
            state.audioElement.volume = 1.0;

            // Update UI
            elements.listeningPanel.classList.remove('hidden');
            elements.currentRoom.textContent = roomCode;
            elements.myName.textContent = name;

            // Add existing listeners
            if (response.listeners) {
                response.listeners.forEach(listener => {
                    if (listener.id !== state.socket.id) {
                        state.listeners.set(listener.id, { name: listener.name, joinedAt: listener.joinedAt });
                    }
                });
            }
            renderListenerList();

            showToast(`Berhasil bergabung dengan room ${roomCode}!`);
        });

    } catch (err) {
        console.error('Error joining room:', err);
        showToast('Gagal mengakses mikrofon. Pastikan izin diberikan.');
    }
}

/**
 * Leave current room
 */
function leaveRoom() {
    // Disconnect socket
    if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
    }

    // Close all peer connections
    state.peerConnections.forEach((pc) => pc.close());
    state.peerConnections.clear();
    state.connectedPeers.clear();

    // Stop audio element
    if (state.audioElement) {
        state.audioElement.srcObject = null;
        state.audioElement = null;
    }

    // Reset state
    state.isConnected = false;
    state.listeners.clear();
    state.speakerName = null;

    // Update UI
    elements.listeningPanel.classList.add('hidden');
    elements.roomInput.value = '';
    renderListenerList();

    showToast('Anda telah keluar dari room.');
}

// ===== Initialize =====

// Event Listeners
elements.permissionModal.addEventListener('click', (e) => {
    if (e.target === elements.permissionModal) {
        closePermissionModal();
    }
});

elements.roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isLive) {
        showToast('Streaming berjalan di background');
    }
});

// Initialize Socket.IO on load
window.addEventListener('load', () => {
    console.log('Live Mic App initialized');
    console.log('WebRTC support:', !!window.RTCPeerConnection);
    console.log('MediaDevices support:', !!navigator.mediaDevices);
    console.log('Socket.IO will connect to:', CONFIG.SERVER_URL);

    initSocket();
});

// Export for debugging
window.liveMic = {
    state,
    config: CONFIG,
    startStreaming,
    stopStreaming,
    joinRoom,
    leaveRoom
};
