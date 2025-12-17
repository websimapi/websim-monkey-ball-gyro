import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { LevelManager } from './LevelManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';

export class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.levelDisplay = document.getElementById('level-display');
        this.timerDisplay = document.getElementById('timer');
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        
        this.ballBody = null;
        this.ballMesh = null;
        
        this.levelManager = null;
        this.inputManager = null;
        this.audioManager = null;
        
        this.isPlaying = false;
        this.level = 1;
        this.timeLeft = 60;
        this.clock = new THREE.Clock();
        
        this.cameraOffset = new THREE.Vector3(0, 5, 8);
    }

    init() {
        // Init Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // Init Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Init Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        this.scene.add(dirLight);

        // Init Physics
        this.world = new CANNON.World();
        this.world.gravity.set(0, -20, 0); // Stronger gravity for tighter feel
        
        // Managers
        this.levelManager = new LevelManager(this.scene, this.world);
        this.inputManager = new InputManager();
        this.audioManager = new AudioManager();
        
        // Create Ball (Player)
        this.createPlayer();
        
        // Events
        window.addEventListener('resize', () => this.onResize());
        
        // Initial render
        this.renderer.render(this.scene, this.camera);
    }

    createPlayer() {
        const radius = 0.5;
        
        // Mesh
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load('monkey_ball.png');
        const material = new THREE.MeshStandardMaterial({ 
            map: texture,
            roughness: 0.4,
            metalness: 0.1 
        });
        
        this.ballMesh = new THREE.Mesh(geometry, material);
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);
        
        // Body
        const shape = new CANNON.Sphere(radius);
        this.ballBody = new CANNON.Body({
            mass: 1,
            shape: shape,
            linearDamping: 0.3, // Dampen rolling slightly
            angularDamping: 0.3
        });
        this.world.addBody(this.ballBody);
    }

    startLevel(levelNum) {
        this.level = levelNum;
        this.levelDisplay.innerText = this.level;
        
        // Audio
        this.audioManager.playMusic();
        
        // Reset Level
        this.levelManager.clear();
        const startPos = this.levelManager.loadLevel(levelNum);
        
        if (!startPos) {
            // No more levels
            window.showOverlay("YOU WIN!", "PLAY AGAIN", () => this.startLevel(1));
            return;
        }
        
        // Reset Player
        this.ballBody.position.set(startPos.x, startPos.y, startPos.z);
        this.ballBody.velocity.set(0, 0, 0);
        this.ballBody.angularVelocity.set(0, 0, 0);
        
        // Reset State
        this.isPlaying = true;
        this.timeLeft = 60;
        this.clock.start();
    }

    update() {
        if (!this.isPlaying) return;
        
        const dt = this.clock.getDelta();
        
        // 1. Input & Physics Gravity
        const input = this.inputManager.getInput();
        
        // Tilt gravity vector
        // Forward tilt (negative Y input) -> Gravity pushes -Z
        // Right tilt (positive X input) -> Gravity pushes +X
        const gravityMag = 20;
        const tiltX = input.x * 0.5; // Scale tilt effect
        const tiltZ = input.y * 0.5;
        
        this.world.gravity.set(
            tiltX * gravityMag,
            -gravityMag,
            tiltZ * gravityMag
        );
        
        // Visual Tilt (Juice)
        // We tilt the whole level visually opposite to gravity to make it look like the board is tilting
        // Actually, InputManager gives us board tilt.
        // If board tilts forward (Input Y < 0), we want visual rotation X to be negative?
        this.levelManager.setVisualTilt(input.y * 0.2, -input.x * 0.2); // Small visual tilt

        // 2. Step Physics
        this.world.step(1 / 60, dt, 3);
        
        // 3. Sync Mesh
        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);
        
        // 4. Camera Follow
        const targetPos = this.ballMesh.position.clone();
        // Camera lags slightly or just fix offset? Fixed offset is tighter for gameplay
        this.camera.position.x = targetPos.x + this.cameraOffset.x;
        this.camera.position.y = targetPos.y + this.cameraOffset.y;
        this.camera.position.z = targetPos.z + this.cameraOffset.z;
        this.camera.lookAt(targetPos);
        
        // 5. Game Logic
        this.timeLeft -= dt;
        this.timerDisplay.innerText = Math.max(0, this.timeLeft).toFixed(2);
        
        if (this.timeLeft <= 0) {
            this.gameOver("TIME UP!");
            return;
        }
        
        // Check Fall
        if (this.ballBody.position.y < -5) {
            this.audioManager.playSound('fall');
            this.gameOver("FALL OUT!");
            return;
        }
        
        // Check Goal
        if (this.levelManager.checkGoal(this.ballBody.position)) {
            this.audioManager.playSound('win');
            this.levelComplete();
            return;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    levelComplete() {
        this.isPlaying = false;
        window.showOverlay("LEVEL CLEAR!", "NEXT LEVEL", () => {
            this.startLevel(this.level + 1);
        });
    }
    
    gameOver(msg) {
        this.isPlaying = false;
        window.showOverlay(msg, "TRY AGAIN", () => {
            this.startLevel(this.level);
        });
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

