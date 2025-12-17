import { Game } from './Game.js';

const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('overlay');
const messageEl = document.getElementById('message');

let game = null;

async function init() {
    game = new Game();
    game.init();
    
    // Initial Render loop
    function animate() {
        requestAnimationFrame(animate);
        if (game) game.update();
    }
    animate();
}

startBtn.addEventListener('click', async () => {
    // Request Device Orientation Permission for iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
                startGame();
            } else {
                alert('Permission denied. Gyro controls required.');
            }
        } catch (e) {
            console.error(e);
            alert('Error requesting gyro permission.');
        }
    } else {
        // Non-iOS 13+ devices
        startGame();
    }
});

function startGame() {
    overlay.classList.add('hidden');
    game.startLevel(1);
}

// Expose handle for game over/win callbacks
window.showOverlay = (msg, buttonText, callback) => {
    messageEl.innerText = msg;
    startBtn.innerText = buttonText;
    
    // Remove old listeners
    const newBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newBtn, startBtn);
    
    newBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        if (callback) callback();
    });
    
    overlay.classList.remove('hidden');
};

init();

