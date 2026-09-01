/* ===== MESSAGING UI CALL INTEGRATION ===== */

// Add call buttons to the messaging header
function initializeMessagingCalls() {
  if (!currentUser) return;
  
  // Wait for chat UI to be ready
  setTimeout(() => {
    const chatHeader = document.querySelector('.chat-header');
    if (!chatHeader) return;
    
    // Remove existing call buttons if any
    const existingCalls = chatHeader.querySelector('.call-button-group');
    if (existingCalls) existingCalls.remove();
    
    // Create call button group
    const callGroup = document.createElement('div');
    callGroup.className = 'call-button-group';
    callGroup.style.cssText = `
      display:flex;
      gap:6px;
      align-items:center;
      margin-left:auto;
    `;
    
    // Voice call button
    const voiceBtn = document.createElement('button');
    voiceBtn.className = 'call-button audio';
    voiceBtn.textContent = '📞 CALL';
    voiceBtn.style.cssText = `
      padding:8px 12px;
      font-size:12px;
      border-radius:6px;
      border:1px solid #78ff43;
      background:#0b1729;
      color:#78ff43;
      cursor:pointer;
      transition:.2s;
    `;
    voiceBtn.onclick = (e) => {
      e.preventDefault();
      if (selectedUser?.id) initiateCall(selectedUser.id, 'audio');
    };
    
    // Video call button
    const videoBtn = document.createElement('button');
    videoBtn.className = 'call-button video';
    videoBtn.textContent = '🎥 VIDEO';
    videoBtn.style.cssText = `
      padding:8px 12px;
      font-size:12px;
      border-radius:6px;
      border:1px solid #43e7ff;
      background:#0b1729;
      color:#43e7ff;
      cursor:pointer;
      transition:.2s;
    `;
    videoBtn.onclick = (e) => {
      e.preventDefault();
      if (selectedUser?.id) initiateCall(selectedUser.id, 'video');
    };
    
    callGroup.appendChild(voiceBtn);
    callGroup.appendChild(videoBtn);
    chatHeader.appendChild(callGroup);
    
    console.log('✅ Call buttons added to messaging UI');
  }, 500);
}

// Hook into the openChat function to initialize calls
const originalOpenChat = window.openChat;
window.openChat = function(userId, userName) {
  if (originalOpenChat) originalOpenChat(userId, userName);
  setTimeout(() => initializeMessagingCalls(), 300);
};

// Add call history tab to messages section
function addCallHistoryTab() {
  const messagesSection = document.getElementById('messages');
  if (!messagesSection) return;
  
  const feedTabs = messagesSection.querySelector('.feed-tabs');
  if (!feedTabs) {
    // Create tabs if they don't exist
    const tabs = document.createElement('div');
    tabs.className = 'feed-tabs';
    tabs.style.cssText = `
      display:flex;
      align-items:center;
      gap:24px;
      padding:14px 18px;
      border-bottom:1px solid #243b5c;
    `;
    
    const allChatsBtn = document.createElement('button');
    allChatsBtn.textContent = 'CHATS';
    allChatsBtn.className = 'active';
    allChatsBtn.style.cssText = `
      background:transparent;
      border:none;
      color:#dce8ff;
      cursor:pointer;
      font-size:13px;
      padding:0;
    `;
    
    const callHistoryBtn = document.createElement('button');
    callHistoryBtn.textContent = '📞 CALL HISTORY';
    callHistoryBtn.style.cssText = `
      background:transparent;
      border:none;
      color:#9db3c9;
      cursor:pointer;
      font-size:13px;
      padding:0;
    `;
    callHistoryBtn.onclick = () => showCallHistory();
    
    tabs.appendChild(allChatsBtn);
    tabs.appendChild(callHistoryBtn);
    
    const chatContainer = messagesSection.querySelector('.chat-messages');
    if (chatContainer) {
      chatContainer.parentNode.insertBefore(tabs, chatContainer);
    }
  } else {
    // Add to existing tabs
    const callHistoryBtn = document.createElement('button');
    callHistoryBtn.textContent = '📞 CALL HISTORY';
    callHistoryBtn.style.cssText = `
      background:transparent;
      border:none;
      color:#9db3c9;
      cursor:pointer;
      font-size:13px;
      padding:0;
    `;
    callHistoryBtn.onclick = () => showCallHistory();
    feedTabs.appendChild(callHistoryBtn);
  }
}

// Show call history
function showCallHistory() {
  const modal = document.createElement('div');
  modal.id = 'call-history-modal';
  modal.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.9);
    z-index:5000;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    backdrop-filter:blur(8px);
  `;
  
  const card = document.createElement('div');
  card.style.cssText = `
    background:linear-gradient(135deg, #1a2847, #0f1829);
    border:2px solid #43e7ff;
    border-radius:12px;
    padding:20px;
    width:min(500px, 100%);
    max-height:70vh;
    overflow-y:auto;
  `;
  
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h2 style="margin:0;color:#43e7ff;">📞 CALL HISTORY</h2>
      <button onclick="document.getElementById('call-history-modal').remove()" style="background:transparent;border:none;color:#dce8ff;font-size:18px;cursor:pointer;">✕</button>
    </div>
    <div id="call-history-list">
      <p style="color:var(--muted);text-align:center;padding:20px;">No calls yet</p>
    </div>
  `;
  
  modal.appendChild(card);
  document.body.appendChild(modal);
  
  // Load call history from localStorage
  const callHistory = JSON.parse(localStorage.getItem('pixelFriendCallHistory') || '[]');
  const list = modal.querySelector('#call-history-list');
  
  if (callHistory.length > 0) {
    list.innerHTML = callHistory.reverse().slice(0, 50).map(call => `
      <div style="
        display:flex;
        align-items:center;
        gap:12px;
        padding:12px;
        background:#0a1423;
        border:1px solid #213755;
        border-radius:8px;
        margin-bottom:8px;
        font-size:13px;
      ">
        <span style="font-size:18px;">${call.type === 'video' ? '🎥' : '📞'}</span>
        <div style="flex:1;">
          <div style="font-weight:700;color:#dce8ff;">${call.name || 'Unknown'}</div>
          <div style="color:var(--muted);font-size:11px;">${call.timestamp}</div>
        </div>
        <span style="color:${call.direction === 'incoming' ? '#78ff43' : '#43e7ff'};font-size:11px;">
          ${call.direction === 'incoming' ? '↓ IN' : '↑ OUT'}
        </span>
        <span style="color:var(--green);font-weight:700;">${call.duration || '0:00'}</span>
      </div>
    `).join('');
  }
}

// Log calls to history
function logCallToHistory(recipientId, recipientName, callType, duration, direction = 'outgoing') {
  const callHistory = JSON.parse(localStorage.getItem('pixelFriendCallHistory') || '[]');
  
  callHistory.push({
    id: recipientId,
    name: recipientName,
    type: callType,
    duration: formatDuration(duration),
    timestamp: new Date().toLocaleTimeString(),
    direction,
    date: new Date().toLocaleDateString()
  });
  
  // Keep last 100 calls
  localStorage.setItem('pixelFriendCallHistory', JSON.stringify(callHistory.slice(-100)));
}

// Hook into endCall to log history
const originalEndCall = window.endCall;
window.endCall = function() {
  if (activeCall) {
    const duration = Math.round((new Date() - activeCall.startTime) / 1000);
    const recipientId = activeCall.recipientId || activeCall.callerId;
    const recipientName = activeCall.callerName || selectedUser?.username || 'Unknown';
    const callType = activeCall.callType || 'audio';
    
    logCallToHistory(recipientId, recipientName, callType, duration, activeCall.direction || 'outgoing');
  }
  
  if (originalEndCall) originalEndCall();
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    addCallHistoryTab();
    initializeCallSystem();
  }, 1000);
});

console.log('✅ Messaging Call Integration loaded');
