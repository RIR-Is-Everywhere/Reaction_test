// ----- state -----
let state = 'waiting';       // waiting, ready, flashActive, result
let flashTimer = null;
let startTime = null;
let reactionTime = null;      // last recorded time in ms
let attemptCounter = 0;
let bestReact = Infinity;
let totalReact = 0;
let validAttempts = 0;
const MAX_ATTEMPTS = 5;

// Audio Context (Synthesizer for gamer feel)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'ready') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'flash') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
}

function createRipple(event) {
    const circle = document.createElement('div');
    circle.classList.add('ripple');

    let clientX = event ? event.clientX : undefined;
    let clientY = event ? event.clientY : undefined;

    const flashZone = document.getElementById('flashZone');
    // Fallback if triggered by keyboard
    if (clientX === undefined) {
        const rect = flashZone.getBoundingClientRect();
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
    }

    const rect = flashZone.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    circle.style.left = `${x}px`;
    circle.style.top = `${y}px`;

    flashZone.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
}

// DOM elements
const flashZone = document.getElementById('flashZone');
const statusMsg = document.getElementById('statusMessage');
const lastTimeEl = document.getElementById('lastTime');
const bestTimeEl = document.getElementById('bestTime');
const avgTimeEl = document.getElementById('avgTime');
const rankDisplay = document.getElementById('rankDisplay');
const attemptCountEl = document.getElementById('attemptCount');
const newTestBtn = document.getElementById('newTestBtn');
const resetBtn = document.getElementById('resetBtn');
const cardEl = document.querySelector('.reaction-card');

// ----- helper: update UI from state -----
function updateUI() {
    // update rank based on bestTime
    if (bestReact !== Infinity) {
        let rankText = '';
        if (bestReact <= 180) rankText = 'Conqueror 👑';
        else if (bestReact <= 220) rankText = 'Gold 🥇';
        else if (bestReact <= 280) rankText = 'Silver 🥈';
        else rankText = 'Try More👀';
        rankDisplay.innerText = rankText;
    } else {
        rankDisplay.innerText = '?';
    }

    // update times display
    lastTimeEl.innerText = (reactionTime !== null && reactionTime > 0) ? reactionTime : '—';
    bestTimeEl.innerText = (bestReact !== Infinity) ? bestReact : '—';
    avgTimeEl.innerText = (validAttempts > 0) ? Math.round(totalReact / validAttempts) : '—';

    // attempt count
    attemptCountEl.innerText = `${validAttempts} / ${MAX_ATTEMPTS}`;

    // dynamic flash zone appearance & message based on state
    if (state === 'waiting') {
        flashZone.classList.remove('flash-active');
        if (validAttempts >= MAX_ATTEMPTS) {
            statusMsg.innerText = `DONE\nAVG: ${Math.round(totalReact / MAX_ATTEMPTS)} ms`;
        } else {
            statusMsg.innerText = 'prepare...';
        }
    } else if (state === 'ready') {
        flashZone.classList.remove('flash-active');
        statusMsg.innerText = 'click when red⚡';
    } else if (state === 'flashActive') {
        flashZone.classList.add('flash-active');
        statusMsg.innerText = 'FLASH! CLICK!';
    } else if (state === 'result') {
        flashZone.classList.remove('flash-active');
        if (reactionTime) {
            statusMsg.innerText = `${reactionTime} ms`;
        } else {
            statusMsg.innerText = '—';
        }
    }
}

// ----- reset to fresh state (waiting, no times) -----
function fullReset() {
    // kill any pending timer
    if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
    }
    state = 'waiting';
    startTime = null;
    reactionTime = null;
    attemptCounter = 0;
    bestReact = Infinity;
    totalReact = 0;
    validAttempts = 0;
    updateUI();
}

// ----- new test: go from waiting -> ready, prepare flash after random delay -----
function startNewTest() {
    if (validAttempts >= MAX_ATTEMPTS) {
        fullReset();
    }
    initAudio();
    playSound('ready');
    // kill old timer if any
    if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
    }

    // always move to ready, schedule flash.
    state = 'ready';
    startTime = null;   // no flash yet
    updateUI();

    // random delay between 1.5s and 4s
    const delay = 1500 + Math.random() * 2500; // 1500-4000ms

    flashTimer = setTimeout(() => {
        // only trigger if state is still 'ready' (not reset by user in between)
        if (state === 'ready') {
            // flash ON
            state = 'flashActive';
            startTime = performance.now(); // mark start
            playSound('flash');

            // Screen shake effect
            cardEl.classList.add('shake');
            setTimeout(() => cardEl.classList.remove('shake'), 300);

            updateUI();
        }
        flashTimer = null;
    }, delay);
}

// ----- handle click on flash zone -----
function handleFlashClick(e) {
    if (state === 'waiting') {
        // do nothing
        return;
    }

    initAudio();

    if (state === 'ready') {
        // premature click (false start)
        playSound('error');
        if (flashTimer) {
            clearTimeout(flashTimer);
            flashTimer = null;
        }
        // set reaction to false start (no time)
        reactionTime = null;
        attemptCounter += 1;

        // show warning for false start
        statusMsg.innerText = '⛔ TOO SOON ⛔';
        flashZone.classList.remove('flash-active');
        state = 'result';  // show error state, but we keep reactionTime null

        // after 1s, go back to waiting
        setTimeout(() => {
            // only if we are still in result state without new test
            if (state === 'result' && reactionTime === null) {
                if (validAttempts < MAX_ATTEMPTS) {
                    startNewTest();
                } else {
                    state = 'waiting';
                    updateUI();
                }
            }
        }, 1000);

        updateUI();  // update rank/display (time null shows —)
        return;
    }

    if (state === 'flashActive') {
        // correct click! calculate time
        const clickTime = performance.now();
        playSound('click');
        createRipple(e);

        if (startTime) {
            reactionTime = Math.round(clickTime - startTime);
        } else {
            reactionTime = 0; // fallback
        }

        attemptCounter += 1;
        validAttempts += 1;
        totalReact += reactionTime;
        if (reactionTime < bestReact) bestReact = reactionTime;

        state = 'result';

        // cancel any pending flash timer just in case
        if (flashTimer) {
            clearTimeout(flashTimer);
            flashTimer = null;
        }

        // auto move to waiting after 2.2 sec to allow reading
        setTimeout(() => {
            if (state === 'result') {
                if (validAttempts < MAX_ATTEMPTS) {
                    startNewTest();
                } else {
                    state = 'waiting';
                    updateUI();
                }
            }
        }, 1200);

        updateUI();
        return;
    }

    if (state === 'result') {
        // ignore clicks on result
        return;
    }
}

// ----- reset stats only -----
function resetStatsOnly() {
    fullReset(); // Leverage fullReset to clear all stats including best/avg
}

// ----- event binding -----
flashZone.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // Prevents simulated mouse events explicitly, stops double-tap side-effects
    handleFlashClick(e);
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault(); // prevent page scroll
        if (state === 'waiting' || state === 'result') {
            startNewTest();
        } else if (state === 'ready' || state === 'flashActive') {
            handleFlashClick(e);
        }
    }
});

newTestBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startNewTest();
});

resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetStatsOnly();
});

// initial update
updateUI();