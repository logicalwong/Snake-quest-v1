/* ============================================
   🐍 SNAKE QUEST DUO — Game Boy Edition
   ============================================ */

(function () {
    'use strict';

    // === Difficulty Presets ===
    const DIFFICULTIES = {
        easy: {
            label: 'Easy',
            baseTickMs: 200,
            minTickMs: 130,
            speedStep: 3,
            aiRecalc: 3,
            aiMistakeChance: 0.15
        },
        medium: {
            label: 'Medium',
            baseTickMs: 150,
            minTickMs: 90,
            speedStep: 5,
            aiRecalc: 2,
            aiMistakeChance: 0.05
        },
        hard: {
            label: 'Hard',
            baseTickMs: 110,
            minTickMs: 60,
            speedStep: 6,
            aiRecalc: 1,
            aiMistakeChance: 0
        }
    };

    // === Board Config ===
    const BOARD_SIZE = 20;
    const CELL_SIZE = 30;

    // === DOM ===
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const aiScoreEl = document.getElementById('aiScore');
    const highScoreEl = document.getElementById('highScore');
    const gameStatus = document.getElementById('gameStatus');
    const statusDot = document.getElementById('statusDot');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlayContent');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const restartBtn = document.getElementById('restartBtn');
    const pauseBtnMobile = document.getElementById('pauseBtnMobile');
    const restartBtnMobile = document.getElementById('restartBtnMobile');
    const powerLed = document.getElementById('powerLed');
    const diffButtons = document.querySelectorAll('.diff-btn');

    // === State ===
    let playerSnake = [];
    let aiSnake = [];
    let food = { x: 10, y: 10 };
    let playerDir = 'right';
    let playerNextDir = 'right';
    let aiDir = 'left';
    let aiTargetDir = 'left';
    let score = 0;
    let aiScore = 0;
    let highScore = 0;
    let gameState = 'ready';
    let difficulty = 'medium';
    let tickMs = DIFFICULTIES.medium.baseTickMs;
    let aiCounter = 0;
    let gameInterval = null;
    let particles = [];

    // === Direction Vectors ===
    const DIRS = {
        up:    { dx: 0,  dy: -1, opposite: 'down'  },
        down:  { dx: 0,  dy: 1,  opposite: 'up'    },
        left:  { dx: -1, dy: 0,  opposite: 'right' },
        right: { dx: 1,  dy: 0,  opposite: 'left'  }
    };

    // === Utilities ===
    const key = (x, y) => `${x},${y}`;
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    function loadHighScore() {
        const stored = localStorage.getItem(`snakeQuestHigh_${difficulty}`);
        highScore = stored ? parseInt(stored, 10) : 0;
        highScoreEl.textContent = highScore;
    }

    function saveHighScore() {
        if (score > highScore) {
            highScore = score;
            localStorage.setItem(`snakeQuestHigh_${difficulty}`, String(highScore));
            highScoreEl.textContent = highScore;
        }
    }

    // === Food ===
    function generateFood() {
        const occupied = new Set();
        playerSnake.forEach(s => occupied.add(key(s.x, s.y)));
        aiSnake.forEach(s => occupied.add(key(s.x, s.y)));

        if (occupied.size >= BOARD_SIZE * BOARD_SIZE) return null;

        const free = [];
        for (let x = 0; x < BOARD_SIZE; x++) {
            for (let y = 0; y < BOARD_SIZE; y++) {
                if (!occupied.has(key(x, y))) free.push({ x, y });
            }
        }
        return free.length ? free[randomInt(0, free.length - 1)] : null;
    }

    // === Reset ===
    function resetGame() {
        stopLoop();

        const cfg = DIFFICULTIES[difficulty];
        tickMs = cfg.baseTickMs;

        playerSnake = [
            { x: 5, y: 10 },
            { x: 4, y: 10 },
            { x: 3, y: 10 }
        ];
        aiSnake = [
            { x: 14, y: 10 },
            { x: 15, y: 10 },
            { x: 16, y: 10 }
        ];
        playerDir = 'right';
        playerNextDir = 'right';
        aiDir = 'left';
        aiTargetDir = 'left';
        score = 0;
        aiScore = 0;
        aiCounter = 0;
        particles = [];
        gameState = 'ready';

        loadHighScore();
        updateScoreUI();
        const f = generateFood();
        food = f || { x: 10, y: 10 };

        draw();
        showOverlay(
            '🎮',
            'READY?',
            `Difficulty: <span class="highlight">${cfg.label}</span><br>Use arrow keys or swipe`,
            'START',
            'start'
        );
        setStatus('Press START', 'idle');
    }

    function startGame() {
        if (gameState === 'playing') return;
        hideOverlay();
        gameState = 'playing';
        setStatus('Playing...', 'playing');
        startLoop();
        powerLed.querySelector('.led-dot').classList.add('on');
    }

    function togglePause() {
        if (gameState === 'playing') {
            gameState = 'paused';
            setStatus('Paused', 'paused');
            draw();
            powerLed.querySelector('.led-dot').classList.remove('on');
        } else if (gameState === 'paused') {
            gameState = 'playing';
            setStatus('Playing...', 'playing');
            powerLed.querySelector('.led-dot').classList.add('on');
        }
    }

    function restartGame() {
        resetGame();
        startGame();
    }

    // === Game Loop ===
    function startLoop() {
        stopLoop();
        gameInterval = setInterval(() => {
            if (gameState === 'playing') gameTick();
        }, tickMs);
    }

    function stopLoop() {
        if (gameInterval) {
            clearInterval(gameInterval);
            gameInterval = null;
        }
    }

    function updateSpeed() {
        const cfg = DIFFICULTIES[difficulty];
        const newTick = clamp(cfg.baseTickMs - score * cfg.speedStep, cfg.minTickMs, cfg.baseTickMs);
        if (newTick !== tickMs) {
            tickMs = newTick;
            if (gameState === 'playing') startLoop();
        }
    }

    // === AI Logic ===
    function computeAIDirection() {
        if (!aiSnake.length) return aiDir;
        const cfg = DIFFICULTIES[difficulty];
        const head = aiSnake[0];
        const target = food;

        const candidates = Object.keys(DIRS).filter(dir => dir !== DIRS[aiDir].opposite);

        const safe = candidates.filter(dir => {
            const nx = head.x + DIRS[dir].dx;
            const ny = head.y + DIRS[dir].dy;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) return false;
            for (let i = 0; i < aiSnake.length - 1; i++) {
                if (aiSnake[i].x === nx && aiSnake[i].y === ny) return false;
            }
            for (let i = 0; i < playerSnake.length; i++) {
                if (playerSnake[i].x === nx && playerSnake[i].y === ny) return false;
            }
            return true;
        });

        if (!safe.length) return aiDir;

        safe.sort((a, b) => {
            const da = Math.abs(head.x + DIRS[a].dx - target.x) + Math.abs(head.y + DIRS[a].dy - target.y);
            const db = Math.abs(head.x + DIRS[b].dx - target.x) + Math.abs(head.y + DIRS[b].dy - target.y);
            return da - db;
        });

        if (Math.random() < cfg.aiMistakeChance && safe.length > 1) {
            return safe[randomInt(1, safe.length - 1)];
        }

        return safe[0];
    }

    // === Tick ===
    function gameTick() {
        // Player
        playerDir = playerNextDir;
        const pHead = playerSnake[0];
        const pVec = DIRS[playerDir];
        const pNew = { x: pHead.x + pVec.dx, y: pHead.y + pVec.dy };

        if (pNew.x < 0 || pNew.x >= BOARD_SIZE || pNew.y < 0 || pNew.y >= BOARD_SIZE) {
            return endGame('player');
        }
        for (let i = 0; i < playerSnake.length - 1; i++) {
            if (playerSnake[i].x === pNew.x && playerSnake[i].y === pNew.y) {
                return endGame('player');
            }
        }

        const playerAte = (pNew.x === food.x && pNew.y === food.y);
        playerSnake.unshift(pNew);
        if (!playerAte) playerSnake.pop();

        if (playerAte) {
            score++;
            updateScoreUI(true, false);
            spawnParticles(pNew.x, pNew.y, '#10b981');
            updateSpeed();
        }

        // AI
        aiCounter++;
        const cfg = DIFFICULTIES[difficulty];
        if (aiCounter >= cfg.aiRecalc) {
            aiCounter = 0;
            aiTargetDir = computeAIDirection();
        }
        aiDir = aiTargetDir;

        const aHead = aiSnake[0];
        const aVec = DIRS[aiDir];
        const aNew = { x: aHead.x + aVec.dx, y: aHead.y + aVec.dy };

        let aiDead = false;
        if (aNew.x < 0 || aNew.x >= BOARD_SIZE || aNew.y < 0 || aNew.y >= BOARD_SIZE) aiDead = true;
        if (!aiDead) {
            for (let i = 0; i < aiSnake.length - 1; i++) {
                if (aiSnake[i].x === aNew.x && aiSnake[i].y === aNew.y) { aiDead = true; break; }
            }
        }

        let aiAteThisTick = false;
        if (aiDead) {
            respawnAI();
        } else {
            const aiAte = (aNew.x === food.x && aNew.y === food.y);
            aiSnake.unshift(aNew);
            if (!aiAte) aiSnake.pop();

            if (aiAte) {
                aiAteThisTick = true;
                aiScore++;
                updateScoreUI(false, true);
                spawnParticles(aNew.x, aNew.y, '#f59e0b');
            }
        }

        if (playerAte || aiAteThisTick) {
            const nf = generateFood();
            if (!nf) return endGame('won');
            food = nf;
        }

        saveHighScore();
        updateParticles();
        draw();
    }

    function endGame(reason) {
        stopLoop();
        gameState = reason === 'won' ? 'won' : 'over';
        saveHighScore();
        powerLed.querySelector('.led-dot').classList.remove('on');

        if (reason === 'won') {
            setStatus('🏆 Board Filled!', 'playing');
            showWinnerOverlay('won');
        } else {
            setStatus('💀 Game Over', 'over');
            showWinnerOverlay('player');
        }
        draw();
    }

    function showWinnerOverlay(reason) {
        let icon, title, titleClass, text, btnLabel, btnClass;

        if (reason === 'won') {
            icon = '🏆';
            title = 'BOARD FILLED!';
            titleClass = 'win-title';
            if (score > aiScore) {
                text = `YOU WIN!<br>You: ${score} · AI: ${aiScore}`;
            } else if (score < aiScore) {
                text = `AI WINS!<br>You: ${score} · AI: ${aiScore}`;
            } else {
                text = `DRAW!<br>You: ${score} · AI: ${aiScore}`;
            }
            btnLabel = 'PLAY AGAIN';
            btnClass = '';
        } else {
            icon = '💀';
            title = 'GAME OVER';
            titleClass = 'lose-title';
            if (score > aiScore) {
                text = `But you're winning!<br>You: ${score} · AI: ${aiScore}`;
            } else if (score < aiScore) {
                text = `AI WINS!<br>You: ${score} · AI: ${aiScore}`;
            } else {
                text = `DRAW!<br>You: ${score} · AI: ${aiScore}`;
            }
            btnLabel = 'TRY AGAIN';
            btnClass = 'retry-btn';
        }

        showOverlay(icon, title, text, btnLabel, 'restart', titleClass, btnClass);
    }

    function respawnAI() {
        const occupied = new Set();
        playerSnake.forEach(s => occupied.add(key(s.x, s.y)));
        occupied.add(key(food.x, food.y));

        const free = [];
        for (let x = 0; x < BOARD_SIZE; x++) {
            for (let y = 0; y < BOARD_SIZE; y++) {
                if (!occupied.has(key(x, y))) free.push({ x, y });
            }
        }

        if (free.length < 6) {
            aiSnake = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }];
            aiDir = 'down';
            aiTargetDir = 'down';
            return;
        }

        const pHead = playerSnake[0];
        free.sort((a, b) => {
            const da = Math.abs(a.x - pHead.x) + Math.abs(a.y - pHead.y);
            const db = Math.abs(b.x - pHead.x) + Math.abs(b.y - pHead.y);
            return db - da;
        });

        const start = free[randomInt(0, Math.min(9, free.length - 1))];
        const dirOptions = ['up', 'down', 'left', 'right'].sort(() => Math.random() - 0.5);

        for (const d of dirOptions) {
            const v = DIRS[d];
            const s2 = { x: start.x - v.dx, y: start.y - v.dy };
            const s3 = { x: start.x - 2 * v.dx, y: start.y - 2 * v.dy };
            const inB = (p) => p.x >= 0 && p.x < BOARD_SIZE && p.y >= 0 && p.y < BOARD_SIZE;
            if (inB(s2) && inB(s3) && !occupied.has(key(s2.x, s2.y)) && !occupied.has(key(s3.x, s3.y))) {
                aiSnake = [start, s2, s3];
                aiDir = d;
                aiTargetDir = d;
                return;
            }
        }

        aiSnake = [{ x: 18, y: 18 }, { x: 18, y: 17 }, { x: 18, y: 16 }];
        aiDir = 'up';
        aiTargetDir = 'up';
    }

    // === Particles ===
    function spawnParticles(gx, gy, color) {
        for (let i = 0; i < 14; i++) {
            particles.push({
                x: gx * CELL_SIZE + CELL_SIZE / 2,
                y: gy * CELL_SIZE + CELL_SIZE / 2,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1,
                color,
                size: 3 + Math.random() * 3
            });
        }
    }

    function updateParticles() {
        particles = particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life -= 0.035;
            return p.life > 0;
        });
    }

    // === Drawing ===
    function draw() {
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, '#0b1222');
        bgGrad.addColorStop(1, '#0f1729');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= BOARD_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL_SIZE + 0.5, 0);
            ctx.lineTo(i * CELL_SIZE + 0.5, H);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * CELL_SIZE + 0.5);
            ctx.lineTo(W, i * CELL_SIZE + 0.5);
            ctx.stroke();
        }

        if (food) {
            const t = Date.now() / 300;
            const pulse = 1 + Math.sin(t) * 0.15;
            const fx = food.x * CELL_SIZE + CELL_SIZE / 2;
            const fy = food.y * CELL_SIZE + CELL_SIZE / 2;
            const r = (CELL_SIZE / 2 - 3) * pulse;

            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 22;
            const fGrad = ctx.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, r);
            fGrad.addColorStop(0, '#fecaca');
            fGrad.addColorStop(0.4, '#f87171');
            fGrad.addColorStop(1, '#ef4444');
            ctx.fillStyle = fGrad;
            ctx.beginPath();
            ctx.arc(fx, fy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        drawSnake(playerSnake, '#10b981', '#34d399', '#047857', false);
        drawSnake(aiSnake, '#f59e0b', '#fbbf24', '#b45309', true);

        particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    function drawSnake(snake, baseColor, headColor, darkColor, isAI) {
        if (!snake.length) return;

        snake.forEach((seg, i) => {
            const isHead = i === 0;
            const x = seg.x * CELL_SIZE;
            const y = seg.y * CELL_SIZE;
            const inset = 2;
            const size = CELL_SIZE - inset * 2;
            const radius = isHead ? 10 : 7;

            if (isHead) {
                ctx.shadowColor = headColor;
                ctx.shadowBlur = 20;
                const grad = ctx.createRadialGradient(
                    x + CELL_SIZE / 2 - 3, y + CELL_SIZE / 2 - 3, 1,
                    x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE / 2
                );
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.25, headColor);
                grad.addColorStop(1, baseColor);
                ctx.fillStyle = grad;
            } else {
                ctx.shadowBlur = 0;
                const t = i / snake.length;
                ctx.fillStyle = mixColor(baseColor, darkColor, t * 0.7);
            }

            roundRect(ctx, x + inset, y + inset, size, size, radius);
            ctx.fill();

            if (isHead) {
                ctx.shadowBlur = 0;
                drawEyes(x, y, isAI);
            }
        });
        ctx.shadowBlur = 0;
    }

    function drawEyes(x, y, isAI) {
        const cx = x + CELL_SIZE / 2;
        const cy = y + CELL_SIZE / 2;
        const eyeR = 3.5;
        const offset = 6.5;

        let ex1 = cx - offset, ey1 = cy - offset;
        let ex2 = cx + offset, ey2 = cy - offset;

        const dir = isAI ? aiDir : playerDir;

        if (dir === 'down') { ey1 = cy + offset; ey2 = cy + offset; ex1 = cx - offset; ex2 = cx + offset; }
        else if (dir === 'left') { ex1 = cx - offset; ex2 = cx - offset; ey1 = cy - offset; ey2 = cy + offset; }
        else if (dir === 'right') { ex1 = cx + offset; ex2 = cx + offset; ey1 = cy - offset; ey2 = cy + offset; }

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex1, ey1, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex2, ey2, eyeR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0a0e17';
        ctx.beginPath();
        ctx.arc(ex1, ey1, eyeR * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex2, ey2, eyeR * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(ex1 - 1, ey1 - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex2 - 1, ey2 - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function mixColor(c1, c2, t) {
        const hex = (c) => {
            const n = parseInt(c.slice(1), 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        const [r1, g1, b1] = hex(c1);
        const [r2, g2, b2] = hex(c2);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
    }

    // === UI ===
    function updateScoreUI(bumpPlayer, bumpAI) {
        scoreEl.textContent = score;
        aiScoreEl.textContent = aiScore;
        highScoreEl.textContent = highScore;

        if (bumpPlayer) {
            scoreEl.classList.remove('bump');
            void scoreEl.offsetWidth;
            scoreEl.classList.add('bump');
        }
        if (bumpAI) {
            aiScoreEl.classList.remove('bump');
            void aiScoreEl.offsetWidth;
            aiScoreEl.classList.add('bump');
        }
    }

    function setStatus(text, mode) {
        gameStatus.textContent = text;
        statusDot.className = 'status-dot';
        if (mode === 'playing') statusDot.classList.add('playing');
        else if (mode === 'paused') statusDot.classList.add('paused');
        else if (mode === 'over') statusDot.classList.add('over');
    }

    function showOverlay(icon, title, text, btnLabel, action, titleClass = '', btnClass = '') {
        overlayContent.innerHTML = `
            <div class="overlay-icon">${icon}</div>
            <h2 class="overlay-title ${titleClass}">${title}</h2>
            <p class="overlay-text">${text}</p>
            <button class="overlay-btn ${btnClass}" id="overlayBtn">${btnLabel}</button>
        `;
        overlay.classList.add('active');
        document.getElementById('overlayBtn').addEventListener('click', () => {
            if (action === 'start') {
                hideOverlay();
                startGame();
            } else if (action === 'restart') {
                resetGame();
                startGame();
            }
        });
    }

    function hideOverlay() {
        overlay.classList.remove('active');
    }

    // === Input ===
    function changeDirection(dir) {
        if (gameState !== 'playing') return;
        if (dir === DIRS[playerDir].opposite) return;
        playerNextDir = dir;
    }

    document.addEventListener('keydown', (e) => {
        const k = e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) {
            e.preventDefault();
        }
        if (k === 'ArrowUp')    changeDirection('up');
        if (k === 'ArrowDown')  changeDirection('down');
        if (k === 'ArrowLeft')  changeDirection('left');
        if (k === 'ArrowRight') changeDirection('right');
        if (k === ' ')          togglePause();
        if (k === 'r' || k === 'R') restartGame();
    });

    document.querySelectorAll('.dpad-btn[data-dir]').forEach(btn => {
        btn.addEventListener('click', () => changeDirection(btn.dataset.dir));
    });

    let touchStart = null;
    canvas.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!touchStart) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            changeDirection(dx > 0 ? 'right' : 'left');
        } else {
            changeDirection(dy > 0 ? 'down' : 'up');
        }
        touchStart = null;
    }, { passive: false });

    startBtn.addEventListener('click', () => {
        hideOverlay();
        startGame();
    });
    pauseBtn.addEventListener('click', togglePause);
    restartBtn.addEventListener('click', restartGame);
    pauseBtnMobile.addEventListener('click', togglePause);
    restartBtnMobile.addEventListener('click', restartGame);

    diffButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (gameState === 'playing' || gameState === 'paused') return;
            diffButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            difficulty = btn.dataset.diff;
            resetGame();
        });
    });

    // === Init ===
    loadHighScore();
    resetGame();
})();