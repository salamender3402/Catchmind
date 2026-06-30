const socket = io();

let myId = null;
let myRoomId = null;
let isHost = false;
let amIDrawer = false;
let myNickname = '';

let isDrawing = false;
let prevX = 0;
let prevY = 0;
let currentColor = '#000000';
let currentWidth = 5;
let turnTotalTime = 90;

// Eraser & Brush Size States
let isEraser = false;
let brushWidth = 5;
let eraserWidth = 20; // Default eraser size (larger than brush)

// BGM State
let isBgmPlaying = false;
const bgmPlayer = new Audio('bgm.mp3');
bgmPlayer.loop = true;
bgmPlayer.volume = 0.35; // Default moderate volume

const DEFAULT_WORDS = [
  '사과', '바나나', '컴퓨터', '스마트폰', '호랑이', '독수리', '피아노', '자전거', '도서관',
  '선생님', '학교', '연필', '지우개', '크레파스', '우산', '아이스크림', '수박', '무지개',
  '태양', '고양이', '강아지', '축구', '야구', '농구', '텔레비전', '비행기', '자동차',
  '기차', '경찰관', '소방차', '의사', '우주선', '눈사람', '해바라기', '선풍기'
];

const screens = {
  lobby: document.getElementById('screen-lobby'),
  waiting: document.getElementById('screen-waiting'),
  play: document.getElementById('screen-play'),
  gameOver: document.getElementById('screen-game-over')
};

const inputNickname = document.getElementById('input-nickname');
const inputRoomCode = document.getElementById('input-room-code');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');

const displayRoomCode = document.getElementById('display-room-code');
const waitingPlayerCount = document.getElementById('waiting-player-count');
const waitingPlayerList = document.getElementById('waiting-player-list');
const hostSettingsArea = document.getElementById('host-settings-area');
const clientWaitingMessage = document.getElementById('client-waiting-message');
const hostTimeLimit = document.getElementById('host-time-limit');
const timeLimitValue = document.getElementById('time-limit-value');
const hostRounds = document.getElementById('host-rounds');
const hostWordList = document.getElementById('host-word-list');
const btnResetWords = document.getElementById('btn-reset-words');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnStartGame = document.getElementById('btn-start-game');

const displayRoundInfo = document.getElementById('display-round-info');
const displaySecretWord = document.getElementById('display-secret-word');
const timerBar = document.getElementById('timer-bar');
const displayTimerNumber = document.getElementById('display-timer-number');
const displayDrawerAnnouncement = document.getElementById('display-drawer-announcement');
const playersLeftColumn = document.getElementById('players-left-column');
const playersRightColumn = document.getElementById('players-right-column');
const drawerTools = document.getElementById('drawer-tools');
const brushSize = document.getElementById('brush-size');
const brushSizeDisplay = document.getElementById('brush-size-display');
const btnClearCanvas = document.getElementById('btn-clear-canvas');
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const canvas = document.getElementById('paint-canvas');
const ctx = canvas.getContext('2d');
const canvasCursor = document.getElementById('canvas-cursor');
const canvasWrapper = document.querySelector('.canvas-wrapper');

const rankingsPodium = document.getElementById('rankings-podium');
const rankingsList = document.getElementById('rankings-list');
const hostGameOverActions = document.getElementById('host-game-over-actions');
const clientGameOverMessage = document.getElementById('client-game-over-message');
const btnLobbyReturn = document.getElementById('btn-lobby-return');

// BGM Control
const btnToggleBgm = document.getElementById('btn-toggle-bgm');

const notification = document.getElementById('notification');
const notificationMessage = document.getElementById('notification-message');
const btnNotificationClose = document.getElementById('btn-notification-close');
const intermission = document.getElementById('intermission');
const intermissionTitle = document.getElementById('intermission-title');
const intermissionWordReveal = document.getElementById('intermission-word-reveal');
const intermissionTimer = document.getElementById('intermission-timer');

function showScreen(screenKey) {
  Object.keys(screens).forEach(key => {
    if (key === screenKey) {
      screens[key].classList.remove('hidden');
    } else {
      screens[key].classList.add('hidden');
    }
  });
}

function showNotification(msg) {
  notificationMessage.textContent = msg;
  notification.classList.remove('hidden');
  
  if (window.notificationTimeout) {
    clearTimeout(window.notificationTimeout);
  }
  window.notificationTimeout = setTimeout(() => {
    notification.classList.add('hidden');
  }, 4000);
}

btnNotificationClose.addEventListener('click', () => {
  notification.classList.add('hidden');
});

btnCreateRoom.addEventListener('click', () => {
  const nickname = inputNickname.value.trim();
  if (!nickname) {
    showNotification('이름을 입력해 주세요.');
    inputNickname.focus();
    return;
  }
  myNickname = nickname;
  socket.emit('createRoom', { nickname });
});

btnJoinRoom.addEventListener('click', () => {
  const nickname = inputNickname.value.trim();
  const roomCode = inputRoomCode.value.trim();
  
  if (!nickname) {
    showNotification('이름을 입력해 주세요.');
    inputNickname.focus();
    return;
  }
  if (!roomCode || roomCode.length !== 4) {
    showNotification('올바른 4자리 방 코드를 입력해 주세요.');
    inputRoomCode.focus();
    return;
  }
  
  myNickname = nickname;
  socket.emit('joinRoom', { roomId: roomCode, nickname });
});

hostTimeLimit.addEventListener('input', (e) => {
  timeLimitValue.textContent = e.target.value;
  if (isHost) syncSettings();
});

hostRounds.addEventListener('change', () => {
  if (isHost) syncSettings();
});

btnResetWords.addEventListener('click', () => {
  if (confirm('제시어 목록을 기본 셋으로 복원하시겠습니까?')) {
    hostWordList.value = DEFAULT_WORDS.join(', ');
    if (isHost) syncSettings();
  }
});

btnSaveSettings.addEventListener('click', () => {
  if (isHost) {
    syncSettings();
    showNotification('설정이 저장 및 공유되었습니다.');
  }
});

btnStartGame.addEventListener('click', () => {
  if (isHost) {
    syncSettings();
    socket.emit('startGame');
  }
});

function syncSettings() {
  const timeLimit = parseInt(hostTimeLimit.value);
  const rounds = parseInt(hostRounds.value);
  const wordText = hostWordList.value;
  
  const wordList = wordText.split(/[\n,]+/).map(w => w.trim()).filter(w => w.length > 0);
  
  socket.emit('updateSettings', {
    timeLimit,
    rounds,
    wordList
  });
}

function drawLine(x, y, pX, pY, color, width) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(pX, pY);
  ctx.lineTo(x, y);
  ctx.stroke();
}

function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches.length > 0) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top
    };
  } else {
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }
}

// Custom Cursor Tracking
function updateCursorPosition(e) {
  if (!amIDrawer) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  canvasCursor.style.left = `${x}px`;
  canvasCursor.style.top = `${y}px`;
  canvasCursor.style.width = `${currentWidth}px`;
  canvasCursor.style.height = `${currentWidth}px`;
  canvasCursor.style.display = 'block';
}

// Mouse events
canvas.addEventListener('mousedown', (e) => {
  if (!amIDrawer) return;
  isDrawing = true;
  const coords = getCanvasCoordinates(e);
  prevX = coords.x;
  prevY = coords.y;
  
  drawLine(prevX, prevY, prevX, prevY, currentColor, currentWidth);
  socket.emit('draw', { x: prevX, y: prevY, prevX: prevX, prevY: prevY, color: currentColor, width: currentWidth });
});

canvas.addEventListener('mousemove', (e) => {
  updateCursorPosition(e);
  if (!isDrawing || !amIDrawer) return;
  const coords = getCanvasCoordinates(e);
  const x = coords.x;
  const y = coords.y;
  
  drawLine(x, y, prevX, prevY, currentColor, currentWidth);
  socket.emit('draw', { x: x, y: y, prevX: prevX, prevY: prevY, color: currentColor, width: currentWidth });
  
  prevX = x;
  prevY = y;
});

canvas.addEventListener('mouseup', () => { isDrawing = false; });
canvas.addEventListener('mouseout', () => { isDrawing = false; });

canvas.addEventListener('mouseenter', (e) => {
  if (amIDrawer) {
    canvasCursor.style.display = 'block';
    updateCursorPosition(e);
  }
});

canvas.addEventListener('mouseleave', () => {
  canvasCursor.style.display = 'none';
});

// Touch events (for tablet and smartphone support)
canvas.addEventListener('touchstart', (e) => {
  if (!amIDrawer) return;
  canvasCursor.style.display = 'none';
  e.preventDefault();
  isDrawing = true;
  const coords = getCanvasCoordinates(e);
  prevX = coords.x;
  prevY = coords.y;
  
  drawLine(prevX, prevY, prevX, prevY, currentColor, currentWidth);
  socket.emit('draw', { x: prevX, y: prevY, prevX: prevX, prevY: prevY, color: currentColor, width: currentWidth });
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!isDrawing || !amIDrawer) return;
  e.preventDefault();
  const coords = getCanvasCoordinates(e);
  const x = coords.x;
  const y = coords.y;
  
  drawLine(x, y, prevX, prevY, currentColor, currentWidth);
  socket.emit('draw', { x: x, y: y, prevX: prevX, prevY: prevY, color: currentColor, width: currentWidth });
  
  prevX = x;
  prevY = y;
}, { passive: false });

canvas.addEventListener('touchend', () => { isDrawing = false; });

// Palette Color Selection
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    
    const selectedColor = e.target.getAttribute('data-color');
    currentColor = selectedColor;
    
    if (selectedColor === '#ffffff') {
      isEraser = true;
      brushSize.value = eraserWidth;
      brushSizeDisplay.textContent = `${eraserWidth}px`;
      currentWidth = eraserWidth;
      canvasCursor.classList.add('eraser-active');
    } else {
      isEraser = false;
      brushSize.value = brushWidth;
      brushSizeDisplay.textContent = `${brushWidth}px`;
      currentWidth = brushWidth;
      canvasCursor.classList.remove('eraser-active');
    }
  });
});

// Brush Size Control
brushSize.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  currentWidth = val;
  brushSizeDisplay.textContent = `${val}px`;
  
  if (isEraser) {
    eraserWidth = val;
  } else {
    brushWidth = val;
  }
  
  if (canvasCursor.style.display !== 'none') {
    canvasCursor.style.width = `${val}px`;
    canvasCursor.style.height = `${val}px`;
  }
});

// Clear Canvas Button
btnClearCanvas.addEventListener('click', () => {
  if (!amIDrawer) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clearCanvas');
});

// Keyboard shortcut for clearing canvas (Delete / Backspace)
document.addEventListener('keydown', (e) => {
  if (amIDrawer && (e.key === 'Delete' || e.key === 'Backspace')) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clearCanvas');
  }
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  
  socket.emit('chatMessage', { message });
  chatInput.value = '';
  chatInput.focus();
});

function appendChatMessage(data) {
  const isSystem = !data.nickname;
  const isSelf = data.senderId === myId;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg';
  
  if (isSystem) {
    msgDiv.className += ' system';
    msgDiv.textContent = data.message;
  } else {
    if (isSelf) msgDiv.className += ' self';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = data.nickname + ':';
    
    const textNode = document.createTextNode(' ' + data.message);
    
    msgDiv.appendChild(nameSpan);
    msgDiv.appendChild(textNode);
  }
  
  chatLog.appendChild(msgDiv);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderPlayerCards(players, drawerId) {
  playersLeftColumn.innerHTML = '';
  playersRightColumn.innerHTML = '';
  
  players.forEach((p, idx) => {
    const isDrawer = p.id === drawerId;
    const hasGuessed = p.hasGuessed;
    const isMe = p.id === myId;
    
    const card = document.createElement('div');
    card.className = 'player-card glass';
    if (isDrawer) card.classList.add('active-drawer');
    if (hasGuessed) card.classList.add('guessed-correct');
    
    const cardTop = document.createElement('div');
    cardTop.className = 'card-top';
    
    const cardName = document.createElement('div');
    cardName.className = 'card-name';
    cardName.textContent = p.nickname;
    if (isMe) cardName.textContent += ' (나)';
    
    cardTop.appendChild(cardName);
    
    if (isDrawer) {
      const badge = document.createElement('span');
      badge.className = 'card-badge badge-drawer';
      badge.textContent = '출제자';
      cardTop.appendChild(badge);
    } else if (hasGuessed) {
      const badge = document.createElement('span');
      badge.className = 'card-badge badge-correct';
      badge.textContent = '정답! 🎯';
      cardTop.appendChild(badge);
    } else if (p.isHost) {
      const badge = document.createElement('span');
      badge.className = 'card-badge';
      badge.style.background = 'rgba(255,255,255,0.06)';
      badge.textContent = '호스트';
      cardTop.appendChild(badge);
    }
    
    const cardScore = document.createElement('div');
    cardScore.className = 'card-score';
    cardScore.innerHTML = `${p.points}<span>점</span>`;
    
    const statusText = document.createElement('div');
    statusText.className = 'card-status-text';
    
    if (isDrawer) {
      statusText.textContent = '그림 그리는 중...';
      statusText.style.color = 'var(--color-primary)';
    } else if (hasGuessed) {
      statusText.textContent = '정답 통과!';
      statusText.style.color = 'var(--color-success)';
    } else {
      statusText.textContent = '정답 추측 중...';
    }
    
    card.appendChild(cardTop);
    card.appendChild(cardScore);
    card.appendChild(statusText);
    
    if (idx < 4) {
      playersLeftColumn.appendChild(card);
    } else {
      playersRightColumn.appendChild(card);
    }
  });
}

function renderWaitingPlayers(players) {
  waitingPlayerList.innerHTML = '';
  waitingPlayerCount.textContent = players.length;
  
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'roster-item';
    if (p.id === myId) li.classList.add('self');
    
    const pName = document.createElement('span');
    pName.className = 'player-name';
    pName.textContent = p.nickname;
    
    if (p.isHost) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'badge badge-host';
      hostBadge.textContent = '호스트';
      pName.appendChild(hostBadge);
    }
    
    if (p.id === myId) {
      const selfBadge = document.createElement('span');
      selfBadge.className = 'badge badge-self';
      selfBadge.textContent = '나';
      pName.appendChild(selfBadge);
    }
    
    li.appendChild(pName);
    waitingPlayerList.appendChild(li);
  });
  
  if (isHost) {
    btnStartGame.disabled = (players.length < 2);
  }
}

function renderGameOverRankings(rankings) {
  rankingsPodium.innerHTML = '';
  rankingsList.innerHTML = '';
  
  const podiumPlayers = rankings.slice(0, 3);
  const restPlayers = rankings.slice(3);
  
  const order = [1, 0, 2];
  
  order.forEach(visualIdx => {
    const p = podiumPlayers[visualIdx];
    if (!p) return;
    
    const step = document.createElement('div');
    step.className = 'podium-step';
    if (visualIdx === 0) step.classList.add('first');
    else if (visualIdx === 1) step.classList.add('second');
    else if (visualIdx === 2) step.classList.add('third');
    
    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = p.nickname;
    if (p.isHost) name.innerHTML += ' 👑';
    
    const block = document.createElement('div');
    block.className = 'podium-block';
    
    const rankNum = document.createElement('div');
    rankNum.className = 'rank-num';
    rankNum.textContent = visualIdx + 1;
    
    const score = document.createElement('div');
    score.className = 'pts';
    score.textContent = `${p.points}점`;
    
    block.appendChild(rankNum);
    block.appendChild(score);
    step.appendChild(name);
    step.appendChild(block);
    
    rankingsPodium.appendChild(step);
  });
  
  restPlayers.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = 'ranking-list-item';
    
    const rankInfo = document.createElement('div');
    rankInfo.className = 'rank-info';
    
    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    badge.textContent = idx + 4;
    
    const name = document.createElement('span');
    name.textContent = p.nickname;
    if (p.isHost) name.innerHTML += ' (호스트)';
    
    rankInfo.appendChild(badge);
    rankInfo.appendChild(name);
    
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${p.points}점`;
    
    li.appendChild(rankInfo);
    li.appendChild(score);
    rankingsList.appendChild(li);
  });
}

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('roomCreated', (data) => {
  myRoomId = data.roomId;
  isHost = true;
  
  displayRoomCode.textContent = myRoomId;
  showScreen('waiting');
  
  hostSettingsArea.classList.remove('hidden');
  clientWaitingMessage.classList.add('hidden');
  
  hostWordList.value = data.settings.wordList.join(', ');
  hostTimeLimit.value = data.settings.timeLimit;
  timeLimitValue.textContent = data.settings.timeLimit;
  hostRounds.value = data.settings.rounds;
  
  renderWaitingPlayers(data.players);
});

socket.on('roomJoined', (data) => {
  myRoomId = data.roomId;
  isHost = false;
  
  displayRoomCode.textContent = myRoomId;
  showScreen('waiting');
  
  hostSettingsArea.classList.add('hidden');
  clientWaitingMessage.classList.remove('hidden');
  
  renderWaitingPlayers(data.players);
});

socket.on('playerJoined', (data) => {
  renderWaitingPlayers(data.players);
});

socket.on('playerLeft', (data) => {
  if (screens.waiting.classList.contains('hidden') === false) {
    renderWaitingPlayers(data.players);
  } else {
    appendChatMessage({
      message: `📢 ${data.leftPlayerNickname} 님이 게임에서 퇴장하셨습니다.`
    });
    const me = data.players.find(p => p.id === myId);
    if (me && me.isHost && !isHost) {
      isHost = true;
      showNotification('이전 방장이 퇴장하여 방장(호스트) 권한을 위임받았습니다.');
    }
  }
});

socket.on('settingsUpdated', (data) => {
  hostTimeLimit.value = data.settings.timeLimit;
  timeLimitValue.textContent = data.settings.timeLimit;
  hostRounds.value = data.settings.rounds;
  hostWordList.value = data.settings.wordList.join(', ');
});

socket.on('errorMsg', (data) => {
  showNotification(data.message);
});

socket.on('systemMessage', (data) => {
  appendChatMessage({ message: `📢 ${data.text}` });
});

socket.on('turnStart', (data) => {
  showScreen('play');
  intermission.classList.add('hidden');
  
  turnTotalTime = data.totalTime;
  displayRoundInfo.textContent = `ROUND ${data.round} / ${data.maxRounds}`;
  
  const isMeDrawer = data.drawerId === myId;
  amIDrawer = isMeDrawer;
  isDrawing = false;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  timerBar.style.width = '100%';
  timerBar.style.backgroundColor = 'var(--color-success)';
  displayTimerNumber.textContent = turnTotalTime;
  
  // Reset brush/eraser mode to default on turn start
  isEraser = false;
  currentColor = '#000000';
  currentWidth = brushWidth;
  brushSize.value = brushWidth;
  brushSizeDisplay.textContent = `${brushWidth}px`;
  document.querySelectorAll('.color-btn').forEach(b => {
    if (b.getAttribute('data-color') === '#000000') b.classList.add('active');
    else b.classList.remove('active');
  });
  canvasCursor.classList.remove('eraser-active');
  canvasCursor.style.display = 'none';

  if (isMeDrawer) {
    displayDrawerAnnouncement.textContent = '🎨 내가 그림을 그릴 차례입니다!';
    drawerTools.classList.remove('hidden');
    displaySecretWord.textContent = '불러오는 중...';
    chatInput.disabled = true;
    chatInput.placeholder = '그림을 그리는 중에는 정답을 맞출 수 없습니다.';
    canvasWrapper.classList.add('drawer-active');
  } else {
    displayDrawerAnnouncement.textContent = `🎨 ${data.drawerNickname} 님이 그리는 중...`;
    drawerTools.classList.add('hidden');
    displaySecretWord.textContent = '? ? ?';
    chatInput.disabled = false;
    chatInput.placeholder = '정답을 추측하거나 채팅을 입력하세요...';
    canvasWrapper.classList.remove('drawer-active');
  }
  
  renderPlayerCards(data.players, data.drawerId);
  
  if (data.round === 1 && data.drawerId === data.players[0].id) {
    chatLog.innerHTML = '';
  }
  
  appendChatMessage({
    message: `------------------- [새로운 턴 시작: 출제자 - ${data.drawerNickname}] -------------------`
  });
});

socket.on('secretWord', (data) => {
  displaySecretWord.textContent = data.word;
  showNotification(`제시어는 [ ${data.word} ] 입니다. 그림을 그려주세요!`);
});

socket.on('timerTick', (data) => {
  const remaining = data.remainingTime;
  displayTimerNumber.textContent = remaining;
  
  const percentage = (remaining / turnTotalTime) * 100;
  timerBar.style.width = `${percentage}%`;
  
  if (percentage < 25) {
    timerBar.style.backgroundColor = 'var(--color-danger)';
  } else if (percentage < 50) {
    timerBar.style.backgroundColor = 'var(--color-warning)';
  } else {
    timerBar.style.backgroundColor = 'var(--color-success)';
  }
});

socket.on('drawSync', (data) => {
  drawLine(data.x, data.y, data.prevX, data.prevY, data.color, data.width);
});

socket.on('clearCanvasSync', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('chatBroadcast', (data) => {
  appendChatMessage(data);
});

socket.on('correctGuess', (data) => {
  const isMeGuesser = data.guesserId === myId;
  
  renderPlayerCards(data.players, data.drawerId);
  
  if (isMeGuesser) {
    chatInput.disabled = true;
    chatInput.placeholder = '🎉 정답을 맞췄습니다! 다른 플레이어의 턴을 기다립니다.';
    showNotification(`정답을 맞췄습니다! (+${data.guesserScore}점)`);
  }
  
  const correctMsg = document.createElement('div');
  correctMsg.className = 'chat-msg correct-reveal';
  
  let msgContent = `🎉 ${data.guesserNickname}님이 정답을 맞췄습니다! (+${data.guesserScore}점)`;
  if (data.drawerScore > 0) {
    msgContent += ` / 🎨 출제자(${data.drawerNickname})님도 보너스를 획득했습니다! (+${data.drawerScore}점)`;
  }
  correctMsg.textContent = msgContent;
  
  chatLog.appendChild(correctMsg);
  chatLog.scrollTop = chatLog.scrollHeight;
});

socket.on('turnEnd', (data) => {
  intermission.classList.remove('hidden');
  intermissionTitle.textContent = '이번 턴 종료';
  intermissionWordReveal.innerHTML = `제시어는 <strong>${data.word}</strong> 였습니다!`;
  
  const endMsg = document.createElement('div');
  endMsg.className = 'chat-msg turn-end-reveal';
  endMsg.textContent = `⌛ 턴이 종료되었습니다. 제시어: ${data.word}`;
  chatLog.appendChild(endMsg);
  chatLog.scrollTop = chatLog.scrollHeight;
  
  let count = 5;
  intermissionTimer.textContent = `잠시 후 다음 턴이 시작됩니다... (${count})`;
  
  const timer = setInterval(() => {
    count--;
    intermissionTimer.textContent = `잠시 후 다음 턴이 시작됩니다... (${count})`;
    if (count <= 0) {
      clearInterval(timer);
    }
  }, 1000);
});

socket.on('gameOver', (data) => {
  showScreen('gameOver');
  intermission.classList.add('hidden');
  
  renderGameOverRankings(data.rankings);
  
  if (isHost) {
    hostGameOverActions.classList.remove('hidden');
    clientGameOverMessage.classList.add('hidden');
  } else {
    hostGameOverActions.classList.add('hidden');
    clientGameOverMessage.classList.remove('hidden');
  }
});

socket.on('gameReset', (data) => {
  showScreen('waiting');
  intermission.classList.add('hidden');
  
  chatLog.innerHTML = '';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  renderWaitingPlayers(data.players);
  showNotification(data.message);
});

btnLobbyReturn.addEventListener('click', () => {
  if (isHost) {
    socket.emit('returnToLobby');
  }
});

// BGM Toggle Interaction
function toggleBgm() {
  if (isBgmPlaying) {
    bgmPlayer.pause();
    btnToggleBgm.textContent = '🔇';
    isBgmPlaying = false;
  } else {
    bgmPlayer.play().then(() => {
      btnToggleBgm.textContent = '🔊';
      isBgmPlaying = true;
    }).catch(err => {
      console.log('BGM autoplay blocked by browser:', err);
      showNotification('화면을 아무 곳이나 클릭한 뒤 음소거(🔇) 버튼을 다시 눌러주세요.');
    });
  }
}

btnToggleBgm.addEventListener('click', toggleBgm);

// Attempt autoplay on first user interaction with the page
document.body.addEventListener('click', () => {
  if (!isBgmPlaying && bgmPlayer.paused) {
    bgmPlayer.play().then(() => {
      btnToggleBgm.textContent = '🔊';
      isBgmPlaying = true;
    }).catch(err => {
      // Ignore autoplay block silently, user can click BGM icon manually
    });
  }
}, { once: true });
