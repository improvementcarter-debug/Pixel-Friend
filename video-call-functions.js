/* ===== PIXEL-FRIEND VOICE & VIDEO CALL SYSTEM ===== */

// Call state management
let activeCall = null;
let localStream = null;
let peerConnections = new Map();
let callOffers = new Map();
let callInitialized = false;

// WebRTC configuration
const rtcConfig = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ]
};

/**
 * Initialize call system - set up Supabase realtime listeners
 */
async function initializeCallSystem() {
  if (callInitialized) return;
  callInitialized = true;

  // Listen for incoming call signals
  const callChannel = sb.channel('call_signals');

  callChannel
    .on('broadcast', { event: 'call_invitation' }, async (payload) => {
      console.log('📞 Incoming call:', payload);
      await handleIncomingCall(payload);
    })
    .on('broadcast', { event: 'call_answer' }, async (payload) => {
      console.log('✅ Call answered:', payload);
      await handleCallAnswer(payload);
    })
    .on('broadcast', { event: 'ice_candidate' }, async (payload) => {
      console.log('🧊 ICE Candidate:', payload);
      await handleICECandidate(payload);
    })
    .on('broadcast', { event: 'call_end' }, async (payload) => {
      console.log('❌ Call ended:', payload);
      await handleCallEnd(payload);
    })
    .subscribe();

  console.log('✅ Call system initialized');
}

/**
 * Request access to user's camera and microphone
 * @param {string} callType - 'audio' or 'video'
 */
async function requestMediaAccess(callType = 'audio') {
  try {
    const constraints = callType === 'video'
      ? { audio: true, video: { width: 320, height: 240 } }
      : { audio: true, video: false };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('✅ Media access granted:', callType);
    return true;
  } catch (err) {
    console.error('❌ Media access denied:', err);
    toast(`❌ Permission denied for ${callType}. Check browser settings.`);
    return false;
  }
}

/**
 * Initiate a call to another user
 * @param {string} recipientId - User ID to call
 * @param {string} callType - 'audio' or 'video'
 */
async function initiateCall(recipientId, callType = 'audio') {
  if (!currentUser || !recipientId) {
    toast('❌ Invalid call parameters');
    return;
  }

  if (activeCall) {
    toast('📞 Already in a call. End the current call first.');
    return;
  }

  try {
    // Request media access
    const hasMedia = await requestMediaAccess(callType);
    if (!hasMedia) return;

    // Initialize call system
    await initializeCallSystem();

    // Create peer connection
    const peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnections.set(recipientId, peerConnection);

    // Add local stream tracks
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle ICE candidates
    peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        broadcastCallSignal('ice_candidate', {
          to: recipientId,
          candidate: event.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid
        });
      }
    });

    // Handle remote stream
    peerConnection.addEventListener('track', (event) => {
      console.log('🎥 Received remote stream:', event.streams[0]);
      displayRemoteStream(event.streams[0], recipientId);
    });

    // Create and send offer
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: callType === 'video'
    });

    await peerConnection.setLocalDescription(offer);

    // Store call info
    activeCall = {
      recipientId,
      callType,
      status: 'calling',
      startTime: new Date(),
      direction: 'outgoing'
    };

    // Send call invitation
    await broadcastCallSignal('call_invitation', {
      from: currentUser.id,
      to: recipientId,
      fromName: currentProfile?.username || 'PIXEL USER',
      callType,
      offer: offer.sdp
    });

    toast(`📞 Calling ${recipientId}... (${callType})`);
    showCallUI(recipientId, callType, 'outgoing');
  } catch (err) {
    console.error('❌ Error initiating call:', err);
    toast('❌ Failed to start call: ' + err.message);
  }
}
window.initiateCall = initiateCall;

/**
 * Handle incoming call invitation
 */
async function handleIncomingCall(payload) {
  const { from, fromName, callType, offer } = payload;

  if (!currentUser) return;

  // Prevent call loops
  if (activeCall) {
    await rejectCall(from, 'busy');
    return;
  }

  // Request media access
  const hasMedia = await requestMediaAccess(callType);
  if (!hasMedia) {
    await rejectCall(from, 'no_media');
    return;
  }

  // Initialize call system
  await initializeCallSystem();

  // Create peer connection
  const peerConnection = new RTCPeerConnection(rtcConfig);
  peerConnections.set(from, peerConnection);

  // Add local stream tracks
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle ICE candidates
  peerConnection.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      broadcastCallSignal('ice_candidate', {
        to: from,
        candidate: event.candidate,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        sdpMid: event.candidate.sdpMid
      });
    }
  });

  // Handle remote stream
  peerConnection.addEventListener('track', (event) => {
    console.log('🎥 Received remote stream:', event.streams[0]);
    displayRemoteStream(event.streams[0], from);
  });

  // Set remote description (offer)
  await peerConnection.setRemoteDescription(new RTCSessionDescription({
    type: 'offer',
    sdp: offer
  }));

  // Store call info and show incoming call notification
  activeCall = {
    callerId: from,
    callerName: fromName,
    callType,
    status: 'incoming',
    startTime: new Date(),
    direction: 'incoming'
  };

  showIncomingCallNotification(from, fromName, callType, peerConnection);
}

/**
 * Accept an incoming call
 */
async function acceptCall(callerId) {
  if (!activeCall || activeCall.callerId !== callerId) return;

  try {
    const peerConnection = peerConnections.get(callerId);
    if (!peerConnection) {
      toast('❌ Call connection lost');
      return;
    }

    // Create and send answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    activeCall.status = 'connected';

    await broadcastCallSignal('call_answer', {
      from: currentUser.id,
      to: callerId,
      answer: answer.sdp
    });

    toast('✅ Call connected!');
    playRetroSound('success');
    showCallUI(callerId, activeCall.callType, 'incoming');
  } catch (err) {
    console.error('❌ Error accepting call:', err);
    toast('❌ Failed to accept call: ' + err.message);
  }
}
window.acceptCall = acceptCall;

/**
 * Handle call answer
 */
async function handleCallAnswer(payload) {
  const { from, answer } = payload;

  if (!activeCall || activeCall.recipientId !== from) return;

  try {
    const peerConnection = peerConnections.get(from);
    if (!peerConnection) return;

    await peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answer
    }));

    activeCall.status = 'connected';
    toast('✅ Call connected!');
    playRetroSound('success');
  } catch (err) {
    console.error('❌ Error handling answer:', err);
  }
}

/**
 * Handle ICE candidate
 */
async function handleICECandidate(payload) {
  const { from, candidate, sdpMLineIndex, sdpMid } = payload;

  const peerConnection = peerConnections.get(from);
  if (!peerConnection) return;

  try {
    const iceCandidate = new RTCIceCandidate({
      candidate: candidate.candidate,
      sdpMLineIndex,
      sdpMid
    });
    await peerConnection.addIceCandidate(iceCandidate);
  } catch (err) {
    console.error('❌ Error adding ICE candidate:', err);
  }
}

/**
 * Reject an incoming call
 */
async function rejectCall(callerId, reason = 'declined') {
  if (activeCall) {
    activeCall = null;
  }

  const peerConnection = peerConnections.get(callerId);
  if (peerConnection) {
    peerConnection.close();
    peerConnections.delete(callerId);
  }

  await broadcastCallSignal('call_end', {
    from: currentUser.id,
    to: callerId,
    reason
  });

  toast(`❌ Call ${reason === 'busy' ? 'busy' : 'declined'}`);
}
window.rejectCall = rejectCall;

/**
 * End active call
 */
async function endCall() {
  if (!activeCall) return;

  const recipientId = activeCall.recipientId || activeCall.callerId;

  // Stop all tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Close all peer connections
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();

  // Notify other user
  await broadcastCallSignal('call_end', {
    from: currentUser.id,
    to: recipientId,
    reason: 'user_ended'
  });

  const callDuration = Math.round((new Date() - activeCall.startTime) / 1000);
  activeCall = null;

  // Hide call UI
  hideCallUI();

  toast(`📞 Call ended (${formatDuration(callDuration)})`);
  playRetroSound('click');
}
window.endCall = endCall;

/**
 * Handle call end
 */
async function handleCallEnd(payload) {
  const { from, reason } = payload;

  if (activeCall && (activeCall.recipientId === from || activeCall.callerId === from)) {
    const callDuration = Math.round((new Date() - activeCall.startTime) / 1000);

    // Stop tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    // Close peer connection
    const peerConnection = peerConnections.get(from);
    if (peerConnection) {
      peerConnection.close();
      peerConnections.delete(from);
    }

    activeCall = null;
    hideCallUI();

    const reasonText = reason === 'busy' ? 'Line was busy' : 'Call ended';
    toast(`📞 ${reasonText} (${formatDuration(callDuration)})`);
  }
}

/**
 * Broadcast call signal via Supabase
 */
async function broadcastCallSignal(event, data) {
  try {
    const channel = sb.channel('call_signals');
    await channel.send({
      type: 'broadcast',
      event,
      payload: { ...data, timestamp: new Date().toISOString() }
    });
  } catch (err) {
    console.error('❌ Error broadcasting call signal:', err);
  }
}

/**
 * Display remote video/audio stream
 */
function displayRemoteStream(stream, userId) {
  let video = document.getElementById(`remote-video-${userId}`);

  if (!video) {
    video = document.createElement('video');
    video.id = `remote-video-${userId}`;
    video.autoplay = true;
    video.playsinline = true;
    video.style.cssText = `
      width: 100%;
      max-width: 400px;
      border-radius: 10px;
      background: #0a0f1a;
      border: 2px solid var(--cyan);
    `;

    const callContainer = document.getElementById('call-remote-container');
    if (callContainer) {
      callContainer.appendChild(video);
    }
  }

  video.srcObject = stream;
}

/**
 * Show incoming call notification
 */
function showIncomingCallNotification(callerId, callerName, callType, peerConnection) {
  const modal = document.createElement('div');
  modal.id = 'incoming-call-modal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.9);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: linear-gradient(135deg, #1a2847, #0f1829);
    border: 2px solid var(--cyan);
    border-radius: 16px;
    padding: 30px;
    text-align: center;
    max-width: 380px;
    box-shadow: 0 0 40px rgba(67,231,255,0.3);
  `;

  card.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">📞</div>
    <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #43e7ff;">
      ${esc(callerName)} is calling...
    </div>
    <div style="color: var(--muted); margin-bottom: 20px; font-size: 14px;">
      📱 ${callType === 'video' ? '🎥 Video Call' : '🎤 Voice Call'}
    </div>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button class="primary" onclick="acceptCall('${callerId}')" style="flex: 1; padding: 14px;">
        ✅ ACCEPT
      </button>
      <button class="secondary" onclick="rejectCall('${callerId}', 'declined')" style="flex: 1; padding: 14px;">
        ❌ DECLINE
      </button>
    </div>
  `;

  modal.appendChild(card);
  document.body.appendChild(modal);

  // Auto-reject after 30 seconds
  const timeout = setTimeout(() => {
    if (modal.isConnected) {
      rejectCall(callerId, 'no_answer');
      modal.remove();
    }
  }, 30000);

  modal.addEventListener('remove', () => clearTimeout(timeout));
}

/**
 * Show call UI (local and remote video)
 */
function showCallUI(userId, callType, direction) {
  let callPanel = document.getElementById('pixel-call-panel');

  if (!callPanel) {
    callPanel = document.createElement('div');
    callPanel.id = 'pixel-call-panel';
    callPanel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      background: linear-gradient(135deg, #0f1829, #1a2847);
      border: 2px solid var(--cyan);
      border-radius: 12px;
      padding: 16px;
      width: min(400px, calc(100vw - 40px));
      box-shadow: 0 0 30px rgba(67,231,255,0.25);
    `;

    callPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <strong style="color: #43e7ff;">📞 ${callType === 'video' ? '🎥 VIDEO CALL' : '🎤 VOICE CALL'}</strong>
        <div style="font-size: 18px; color: #43e7ff; font-weight: bold;" id="call-timer">00:00</div>
      </div>
      <div id="call-local-container" style="margin-bottom: 12px; background: #0a0f1a; border-radius: 8px; padding: 8px; border: 1px solid #2a4266;"></div>
      <div id="call-remote-container" style="margin-bottom: 12px; background: #0a0f1a; border-radius: 8px; padding: 8px; border: 1px solid #2a4266;"></div>
      <div style="display: flex; gap: 8px;">
        <button class="primary" style="flex: 1; padding: 10px; font-size: 13px;" onclick="toggleMicrophone()">
          🎤 MIC
        </button>
        <button class="primary" style="flex: 1; padding: 10px; font-size: 13px;" onclick="toggleCamera()">
          📹 CAM
        </button>
        <button class="secondary" style="flex: 1; padding: 10px; font-size: 13px;" onclick="endCall()">
          ❌ END
        </button>
      </div>
    `;

    document.body.appendChild(callPanel);

    // Display local video if video call
    if (callType === 'video' && localStream) {
      const localVideo = document.createElement('video');
      localVideo.id = 'local-video';
      localVideo.autoplay = true;
      localVideo.muted = true;
      localVideo.playsinline = true;
      localVideo.style.cssText = `
        width: 100%;
        max-width: 100%;
        border-radius: 8px;
        background: #000;
        border: 1px solid #2a4266;
      `;

      localVideo.srcObject = localStream;
      const localContainer = document.getElementById('call-local-container');
      if (localContainer) {
        localContainer.innerHTML = '';
        localContainer.appendChild(localVideo);
      }
    }

    // Start call timer
    const startTime = activeCall?.startTime || new Date();
    setInterval(() => {
      const elapsed = Math.round((new Date() - startTime) / 1000);
      const timer = document.getElementById('call-timer');
      if (timer) {
        timer.textContent = formatDuration(elapsed);
      }
    }, 1000);
  }

  // Hide incoming call modal if present
  const modal = document.getElementById('incoming-call-modal');
  if (modal) modal.remove();
}

/**
 * Hide call UI
 */
function hideCallUI() {
  const callPanel = document.getElementById('pixel-call-panel');
  if (callPanel) callPanel.remove();

  const modal = document.getElementById('incoming-call-modal');
  if (modal) modal.remove();
}

/**
 * Toggle microphone on/off
 */
function toggleMicrophone() {
  if (!localStream) return;

  const audioTracks = localStream.getAudioTracks();
  const isEnabled = audioTracks.every(track => track.enabled);

  audioTracks.forEach(track => {
    track.enabled = !isEnabled;
  });

  toast(isEnabled ? '🔇 Microphone muted' : '🎤 Microphone on');
}
window.toggleMicrophone = toggleMicrophone;

/**
 * Toggle camera on/off
 */
function toggleCamera() {
  if (!localStream) return;

  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) {
    toast('📹 No camera available');
    return;
  }

  const isEnabled = videoTracks.every(track => track.enabled);

  videoTracks.forEach(track => {
    track.enabled = !isEnabled;
  });

  toast(isEnabled ? '📹 Camera off' : '📹 Camera on');
}
window.toggleCamera = toggleCamera;

/**
 * Format call duration
 */
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

console.log('✅ Video Call System loaded');
