const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Game Rooms Database
const rooms = {};

// Default Word List for Educational Catch Mind
const DEFAULT_WORDS = [
  '사과', '바나나', '컴퓨터', '스마트폰', '호랑이', '독수리', '피아노', '자전거', '도서관',
  '선생님', '학교', '연필', '지우개', '크레파스', '우산', '아이스크림', '수박', '무지개',
  '태양', '고양이', '강아지', '축구', '야구', '농구', '텔레비전', '비행기', '자동차',
  '기차', '경찰관', '소방차', '의사', '우주선', '눈사람', '해바라기', '선풍기'
];

function generateRoomId() {
  let roomId;
  do {
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[roomId]);
  return roomId;
}

function clearRoomInterval(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function startNextTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearRoomInterval(room);

  // 1. 최소 플레이 가능 인원(연결된 실제 플레이어) 수 확인
  const activePlayers = room.players.filter(p => p.connected && p.playGame !== false);
  if (activePlayers.length < 2) {
    room.gameState = 'LOBBY';
    room.currentRound = 1;
    room.currentTurnIndex = 0;
    room.usedWords = [];
    io.to(roomId).emit('gameReset', {
      players: getSanitizedPlayers(room),
      message: '플레이 가능한 실제 플레이어 수가 부족하여 게임이 대기실로 돌아갔습니다.'
    });
    return;
  }

  // 2. 출제자 선정이 가능하도록 교사(playGame === false) 및 오프라인 유저 스킵 루프 작동
  let attempts = 0;
  while (attempts < room.players.length) {
    if (room.currentTurnIndex >= room.players.length) {
      room.currentRound++;
      room.currentTurnIndex = 0;
    }

    if (room.currentRound > room.settings.rounds) {
      endGame(roomId);
      return;
    }

    const candidate = room.players[room.currentTurnIndex];
    if (candidate && candidate.playGame !== false && candidate.connected) {
      break;
    }

    room.currentTurnIndex++;
    attempts++;
  }

  const drawer = room.players[room.currentTurnIndex];
  if (!drawer || drawer.playGame === false || !drawer.connected) {
    room.gameState = 'LOBBY';
    room.currentRound = 1;
    room.currentTurnIndex = 0;
    room.usedWords = [];
    io.to(roomId).emit('gameReset', {
      players: getSanitizedPlayers(room),
      message: '게임 가능한 연결된 플레이어가 없습니다.'
    });
    return;
  }

  room.players.forEach(p => {
    p.hasGuessed = false;
  });

  room.gameState = 'PLAYING';
  room.firstGuessedThisTurn = false;
  room.correctGuessersCount = 0;

  const availableWords = room.settings.wordList.filter(w => !room.usedWords.includes(w));
  let wordListToUse = availableWords.length > 0 ? availableWords : room.settings.wordList;
  
  const randomIndex = Math.floor(Math.random() * wordListToUse.length);
  const selectedWord = wordListToUse[randomIndex];
  
  room.currentWord = selectedWord;
  room.usedWords.push(selectedWord);

  room.currentTimer = room.settings.timeLimit;

  io.to(roomId).emit('turnStart', {
    drawerId: drawer.id,
    drawerNickname: drawer.nickname,
    totalTime: room.settings.timeLimit,
    round: room.currentRound,
    maxRounds: room.settings.rounds,
    players: getSanitizedPlayers(room)
  });

  io.to(drawer.id).emit('secretWord', { word: selectedWord });

  room.timerInterval = setInterval(() => {
    room.currentTimer--;
    io.to(roomId).emit('timerTick', { remainingTime: room.currentTimer });

    if (room.currentTimer <= 0) {
      endTurn(roomId, 'TIME_UP');
    }
  }, 1000);
}

function endTurn(roomId, reason) {
  const room = rooms[roomId];
  if (!room) return;

  clearRoomInterval(room);
  room.gameState = 'TURN_END';

  io.to(roomId).emit('turnEnd', {
    word: room.currentWord,
    reason: reason,
    players: getSanitizedPlayers(room)
  });

  room.currentTurnIndex++;
  setTimeout(() => {
    if (rooms[roomId]) {
      startNextTurn(roomId);
    }
  }, 5000);
}

function endGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearRoomInterval(room);
  room.gameState = 'GAME_OVER';

  const sortedPlayers = [...room.players]
    .filter(p => p.playGame !== false)
    .sort((a, b) => b.points - a.points);

  io.to(roomId).emit('gameOver', {
    players: getSanitizedPlayers(room),
    rankings: sortedPlayers.map(p => ({ nickname: p.nickname, points: p.points, isHost: p.isHost }))
  });
}

function getSanitizedPlayers(room) {
  return room.players.map(p => ({
    id: p.id,
    nickname: p.nickname,
    points: p.points,
    isHost: p.isHost,
    hasGuessed: p.hasGuessed,
    connected: p.connected,
    playGame: p.playGame !== false
  }));
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', ({ nickname }) => {
    const trimmedNick = nickname.trim().substring(0, 12) || '무명플레이어';
    const roomId = generateRoomId();

    rooms[roomId] = {
      roomId: roomId,
      players: [{
        id: socket.id,
        nickname: trimmedNick,
        points: 0,
        isHost: true,
        hasGuessed: false,
        connected: true,
        disconnectTimeout: null,
        playGame: true
      }],
      spectators: [],
      gameState: 'LOBBY',
      settings: {
        wordList: [...DEFAULT_WORDS],
        timeLimit: 90,
        rounds: 3
      },
      currentRound: 1,
      currentTurnIndex: 0,
      usedWords: [],
      currentWord: '',
      currentTimer: 90,
      timerInterval: null,
      firstGuessedThisTurn: false,
      correctGuessersCount: 0
    };

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('roomCreated', {
      roomId: roomId,
      players: getSanitizedPlayers(rooms[roomId]),
      settings: rooms[roomId].settings
    });
  });

  socket.on('joinRoom', ({ roomId, nickname, isSpectator }) => {
    const idStr = roomId.trim();
    const room = rooms[idStr];

    if (!room) {
      socket.emit('errorMsg', { message: '방이 존재하지 않거나 코드가 틀렸습니다.' });
      return;
    }

    const trimmedNick = nickname.trim().substring(0, 12) || '무명플레이어';

    // 닉네임 중복 검사 (플레이어 및 관전자 전체 대상)
    const isPlayerOnline = room.players.some(p => p.nickname === trimmedNick && p.connected);
    const isSpectatorOnline = room.spectators && room.spectators.some(s => s.nickname === trimmedNick);
    if (isPlayerOnline || isSpectatorOnline) {
      socket.emit('errorMsg', { message: '이미 접속해 있는 닉네임입니다.' });
      return;
    }

    // 1. 관전자 입장 처리
    if (isSpectator) {
      const newSpectator = {
        id: socket.id,
        nickname: trimmedNick
      };
      if (!room.spectators) room.spectators = [];
      room.spectators.push(newSpectator);

      socket.join(idStr);
      socket.roomId = idStr;
      socket.isSpectator = true;

      io.to(idStr).emit('systemMessage', { text: `👁️ 관전자 ${trimmedNick} 님이 입장하셨습니다.` });
      io.to(idStr).emit('spectatorCountUpdate', { count: room.spectators.length });

      if (room.gameState === 'LOBBY') {
        socket.emit('roomJoined', {
          roomId: idStr,
          players: getSanitizedPlayers(room),
          settings: room.settings,
          isSpectator: true
        });
      } else {
        const drawer = room.players[room.currentTurnIndex];
        socket.emit('gameRejoined', {
          roomId: idStr,
          gameState: room.gameState,
          players: getSanitizedPlayers(room),
          settings: room.settings,
          currentRound: room.currentRound,
          drawerId: drawer ? drawer.id : null,
          drawerNickname: drawer ? drawer.nickname : '',
          totalTime: room.settings.timeLimit,
          remainingTime: room.currentTimer,
          amIDrawer: false,
          isSpectator: true
        });
      }
      return;
    }

    // 2. 플레이어 재접속 검증 (동일 닉네임 유저가 연결이 끊긴 상태인 경우)
    const existingPlayer = room.players.find(p => p.nickname === trimmedNick);
    if (existingPlayer) {
      if (existingPlayer.connected) {
        socket.emit('errorMsg', { message: '이미 접속해 있는 닉네임입니다.' });
        return;
      } else {
        // 타이머 해제 및 세션 복구
        if (existingPlayer.disconnectTimeout) {
          clearTimeout(existingPlayer.disconnectTimeout);
          existingPlayer.disconnectTimeout = null;
        }

        existingPlayer.id = socket.id;
        existingPlayer.connected = true;

        socket.join(idStr);
        socket.roomId = idStr;

        io.to(idStr).emit('systemMessage', { text: `📢 ${existingPlayer.nickname} 님이 다시 연결되었습니다.` });

        // 대기실 혹은 게임 중 분기 처리
        if (room.gameState === 'LOBBY') {
          socket.emit('roomJoined', {
            roomId: idStr,
            players: getSanitizedPlayers(room),
            settings: room.settings
          });
        } else {
          const drawer = room.players[room.currentTurnIndex];
          const isDrawer = (drawer && drawer.id === socket.id);

          socket.emit('gameRejoined', {
            roomId: idStr,
            gameState: room.gameState,
            players: getSanitizedPlayers(room),
            settings: room.settings,
            currentRound: room.currentRound,
            drawerId: drawer ? drawer.id : null,
            drawerNickname: drawer ? drawer.nickname : '',
            totalTime: room.settings.timeLimit,
            remainingTime: room.currentTimer,
            amIDrawer: isDrawer
          });

          if (isDrawer) {
            socket.emit('secretWord', { word: room.currentWord });
          }
        }

        // 전체 플레이어 상태 브로드캐스트
        io.to(idStr).emit('playerJoined', {
          players: getSanitizedPlayers(room)
        });
        return;
      }
    }

    if (room.gameState !== 'LOBBY') {
      socket.emit('errorMsg', { message: '이미 게임이 시작되어 들어갈 수 없습니다.' });
      return;
    }

    if (room.players.filter(p => p.playGame !== false).length >= 8) {
      socket.emit('errorMsg', { message: '방이 가득 찼습니다. (최대 플레이어 8명)' });
      return;
    }

    const newPlayer = {
      id: socket.id,
      nickname: trimmedNick,
      points: 0,
      isHost: false,
      hasGuessed: false,
      connected: true,
      disconnectTimeout: null,
      playGame: true
    };

    room.players.push(newPlayer);
    socket.join(idStr);
    socket.roomId = idStr;

    io.to(idStr).emit('playerJoined', {
      players: getSanitizedPlayers(room)
    });

    socket.emit('roomJoined', {
      roomId: idStr,
      players: getSanitizedPlayers(room),
      settings: room.settings
    });
  });

  socket.on('togglePlayGame', ({ playGame }) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;
    
    player.playGame = playGame;
    io.to(roomId).emit('playerJoined', {
      players: getSanitizedPlayers(room)
    });
  });

  socket.on('skipTurn', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;
    
    if (room.gameState === 'PLAYING') {
      clearRoomInterval(room);
      io.to(roomId).emit('systemMessage', { text: `👑 진행자가 현재 턴을 건너뛰었습니다.` });
      endTurn(roomId, 'HOST_SKIPPED');
    }
  });

  socket.on('updateSettings', ({ timeLimit, rounds, wordList }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    if (room.gameState !== 'LOBBY') return;

    const limit = Math.max(60, Math.min(90, parseInt(timeLimit) || 90));
    const rds = Math.max(1, Math.min(10, parseInt(rounds) || 3));
    
    let words = [...DEFAULT_WORDS];
    if (wordList && Array.isArray(wordList) && wordList.length > 0) {
      words = wordList.map(w => w.trim()).filter(w => w.length > 0);
    }
    if (words.length === 0) {
      words = [...DEFAULT_WORDS];
    }

    room.settings.timeLimit = limit;
    room.settings.rounds = rds;
    room.settings.wordList = words;

    io.to(roomId).emit('settingsUpdated', { settings: room.settings });
  });

  socket.on('startGame', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    if (room.gameState !== 'LOBBY') return;

    if (room.players.length < 2) {
      socket.emit('errorMsg', { message: '게임을 시작하려면 최소 2명의 플레이어가 필요합니다.' });
      return;
    }

    room.currentRound = 1;
    room.currentTurnIndex = 0;
    room.usedWords = [];
    room.players.forEach(p => p.points = 0);

    startNextTurn(roomId);
  });

  socket.on('draw', (drawData) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.gameState !== 'PLAYING') return;

    const drawer = room.players[room.currentTurnIndex];
    if (!drawer || drawer.id !== socket.id) return;

    socket.to(roomId).emit('drawSync', drawData);
  });

  socket.on('clearCanvas', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.gameState !== 'PLAYING') return;

    const drawer = room.players[room.currentTurnIndex];
    if (!drawer || drawer.id !== socket.id) return;

    socket.to(roomId).emit('clearCanvasSync');
  });

  socket.on('chatMessage', ({ message }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const trimmedMsg = message.trim();
    if (!trimmedMsg) return;

    if (room.gameState === 'PLAYING') {
      const drawer = room.players[room.currentTurnIndex];
      const isDrawer = (drawer && drawer.id === socket.id);

      const cleanMsg = trimmedMsg.replace(/\s+/g, '').toLowerCase();
      const cleanWord = room.currentWord.replace(/\s+/g, '').toLowerCase();

      if (cleanMsg === cleanWord && !isDrawer && !player.hasGuessed) {
        player.hasGuessed = true;
        room.correctGuessersCount++;

        const remainingPercentage = room.currentTimer / room.settings.timeLimit;
        const guesserScore = Math.max(20, Math.round(remainingPercentage * 100));

        player.points += guesserScore;

        let drawerScore = guesserScore;
        if (drawer) {
          drawer.points += drawerScore;
        }

        io.to(roomId).emit('correctGuess', {
          guesserId: player.id,
          guesserNickname: player.nickname,
          guesserScore: guesserScore,
          drawerId: drawer ? drawer.id : null,
          drawerNickname: drawer ? drawer.nickname : '',
          drawerScore: drawerScore,
          players: getSanitizedPlayers(room)
        });

        // 방안 3: 단 한 명이라도 정답을 맞추면 즉시 이번 턴 종료
        endTurn(roomId, 'FIRST_GUESSED');
        return;
      }
    }

    io.to(roomId).emit('chatBroadcast', {
      nickname: player.nickname,
      message: trimmedMsg,
      senderId: socket.id
    });
  });

  socket.on('returnToLobby', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    clearRoomInterval(room);
    room.gameState = 'LOBBY';
    room.currentRound = 1;
    room.currentTurnIndex = 0;
    room.usedWords = [];
    room.players.forEach(p => p.points = 0);

    io.to(roomId).emit('gameReset', {
      players: getSanitizedPlayers(room),
      message: '호스트가 게임을 대기실로 초기화했습니다.'
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    // 1. 관전자 퇴장 처리
    if (socket.isSpectator && room.spectators) {
      const specIdx = room.spectators.findIndex(s => s.id === socket.id);
      if (specIdx !== -1) {
        room.spectators.splice(specIdx, 1);
        io.to(roomId).emit('spectatorCountUpdate', { count: room.spectators.length });
        return;
      }
    }

    // 2. 플레이어 오프라인 처리 (타이머 없이 계속 유지)
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.connected = false;

    // 방의 모든 플레이어가 오프라인이면 방 폭파
    const onlinePlayers = room.players.filter(p => p.connected);
    if (onlinePlayers.length === 0) {
      clearRoomInterval(room);
      delete rooms[roomId];
      return;
    }

    // 방장이 튕긴 경우 방장 권한 즉시 양도
    const wasHost = player.isHost;
    if (wasHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => p.connected);
      if (nextHost) {
        nextHost.isHost = true;
        io.to(roomId).emit('systemMessage', { text: `👑 방장의 연결이 끊겨 ${nextHost.nickname} 님에게 방장 권한이 임시 위임되었습니다.` });
      }
    }

    io.to(roomId).emit('systemMessage', { text: `📢 ${player.nickname} 님의 연결이 끊겼습니다. (언제든지 재접속 가능)` });
    io.to(roomId).emit('playerLeft', {
      players: getSanitizedPlayers(room),
      leftPlayerNickname: player.nickname
    });

    // 게임 진행 중일 때 예외 처리
    if (room.gameState === 'PLAYING') {
      const playerIndex = room.players.findIndex(p => p.id === player.id);
      
      // 튕긴 유저가 현재 출제자(Drawer)인 경우 즉시 턴 폭파하고 다음 턴으로 이양
      if (room.currentTurnIndex === playerIndex) {
        clearRoomInterval(room);
        io.to(roomId).emit('systemMessage', { text: `🎨 출제자(${player.nickname})의 연결이 끊겨 턴을 강제 종료하고 다음 턴으로 넘어갑니다.` });
        
        if (room.currentTurnIndex >= room.players.length) {
          room.currentTurnIndex = 0;
          room.currentRound++;
        }
        
        endTurn(roomId, 'DRAWER_LEFT');
      } else {
        // 맞추는 사람 인원 부족 시 리셋
        if (onlinePlayers.length < 2) {
          clearRoomInterval(room);
          room.gameState = 'LOBBY';
          io.to(roomId).emit('gameReset', {
            players: getSanitizedPlayers(room),
            message: '플레이 가능한 인원이 부족하여 게임이 대기실로 돌아갔습니다.'
          });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`CatchMind web-ready server running on port ${PORT}`);
});
