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
        
        this.cameraOffset = new THREE.Vector3(0, 10, 10);
        this.cameraLerpFactor = 0.12;

        // Dash / charge state
        this.dashState = {
            charging: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            startTime: 0,
            dirX: 0,
            dirZ: 0
        };

        // Visual arrow for dash direction
        this.dashArrow = null;
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
        this.world.gravity.set(0, -30, 0); // Strong gravity for snappy response
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 20; // Increase solver iterations for stability
        this.world.defaultContactMaterial.friction = 0.1; 
        this.world.defaultContactMaterial.restitution = 0.2;
        
        // Managers
        this.levelManager = new LevelManager(this.scene, this.world);
        this.inputManager = new InputManager();
        this.audioManager = new AudioManager();
        
        // Create Ball (Player)
        this.createPlayer();
        this.initDashArrow();
        
        // Events
        window.addEventListener('resize', () => this.onResize());

        // Dash controls (touch)
        this.setupDashControls();
        
        // Initial render
        this.renderer.render(this.scene, this.camera);
    }

    calibrate() {
        if (this.inputManager) {
            this.inputManager.calibrate();
        }
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
            angularDamping: 0.3,
            ccdSpeedThreshold: 1,
            ccdIterations: 10
        });
        this.world.addBody(this.ballBody);
    }

    initDashArrow() {
        // Simple arrow: thin cylinder + cone tip, pointing along +Z in local space
        const group = new THREE.Group();

        const shaftGeom = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const tipGeom = new THREE.ConeGeometry(0.12, 0.35, 12);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });

        const shaft = new THREE.Mesh(shaftGeom, mat);
        const tip = new THREE.Mesh(tipGeom, mat);

        // Position so that base of shaft is at origin and tip extends along +Z
        shaft.rotation.x = Math.PI / 2;
        tip.rotation.x = Math.PI / 2;

        shaft.position.z = 0.5;
        tip.position.z = 1.0;

        group.add(shaft);
        group.add(tip);

        group.visible = false;
        this.scene.add(group);
        this.dashArrow = group;
    }

    setDashArrowVisible(visible) {
        if (!this.dashArrow) return;
        this.dashArrow.visible = visible;
    }

    updateDashArrow() {
        if (!this.dashArrow || !this.ballMesh || !this.dashState.charging) return;

        const dirX = this.dashState.dirX;
        const dirZ = this.dashState.dirZ;
        const len = Math.hypot(dirX, dirZ);
        if (len < 0.01) {
            this.setDashArrowVisible(false);
            return;
        }

        // Charge amount affects arrow length
        const now = performance.now();
        const holdMs = now - this.dashState.startTime;
        const maxChargeMs = 1200;
        const charge = Math.min(holdMs / maxChargeMs, 1);

        const baseLen = 0.8;
        const extraLen = 1.5;
        const arrowLen = baseLen + extraLen * charge;

        // Position arrow slightly above the ball
        this.dashArrow.position.copy(this.ballMesh.position);
        this.dashArrow.position.y += 0.8;

        // Point arrow along direction on XZ plane
        const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();
        const target = new THREE.Vector3().copy(this.dashArrow.position).add(dir);

        this.dashArrow.lookAt(target);

        // Scale to desired length along its local Z (it's modeled about 1.35 units total)
        const modelLen = 1.35;
        const scale = arrowLen / modelLen;
        this.dashArrow.scale.set(scale, scale, scale);

        this.setDashArrowVisible(true);
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
        const gravityMag = 30;
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
        this.world.step(1 / 60, dt, 10);
        
        // 3. Sync Mesh
        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);

        // 3b. Update dash arrow if charging
        if (this.dashState.charging) {
            this.updateDashArrow();
        } else {
            this.setDashArrowVisible(false);
        }
        
        // 4. Camera Follow
        const targetPos = this.ballMesh.position.clone();
        const desiredPos = targetPos.clone().add(this.cameraOffset);
        
        // Smooth follow behind and above the ball
        this.camera.position.lerp(desiredPos, this.cameraLerpFactor);
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

    setupDashControls() {
        const target = this.renderer.domElement;

        // Helper to ignore touches when UI menus are on top
        const isInMenu = (event) => {
            const elem = document.elementFromPoint(
                event.touches && event.touches[0] ? event.touches[0].clientX : event.clientX,
                event.touches && event.touches[0] ? event.touches[0].clientY : event.clientY
            );
            return elem && elem.closest('.menu-overlay') && !elem.closest('.hidden');
        };

        target.addEventListener('touchstart', (e) => {
            if (!this.isPlaying) return;
            if (isInMenu(e)) return;
            if (e.touches.length > 1) return; // single touch only

            const t = e.touches[0];
            this.dashState.charging = true;
            this.dashState.startX = this.dashState.currentX = t.clientX;
            this.dashState.startY = this.dashState.currentY = t.clientY;
            this.dashState.startTime = performance.now();
            this.dashState.dirX = 0;
            this.dashState.dirZ = 0;

            this.setDashArrowVisible(false);

            e.preventDefault();
        }, { passive: false });

        target.addEventListener('touchmove', (e) => {
            if (!this.isPlaying) return;
            if (!this.dashState.charging) return;

            const t = e.touches[0];
            this.dashState.currentX = t.clientX;
            this.dashState.currentY = t.clientY;

            const dx = this.dashState.currentX - this.dashState.startX;
            const dy = this.dashState.currentY - this.dashState.startY;
            const len = Math.hypot(dx, dy);

            if (len > 10) {
                // Screen X => world -X, screen Y => world +Z (align with perceived swipe direction)
                this.dashState.dirX = -dx / len;
                this.dashState.dirZ = dy / len;
                this.updateDashArrow();
            } else {
                this.dashState.dirX = 0;
                this.dashState.dirZ = 0;
                this.setDashArrowVisible(false);
            }

            e.preventDefault();
        }, { passive: false });

        const endCharge = (clientX, clientY) => {
            if (!this.isPlaying) return;
            if (!this.dashState.charging) return;

            this.dashState.charging = false;
            this.setDashArrowVisible(false);

            const dx = clientX - this.dashState.startX;
            const dy = clientY - this.dashState.startY;

            const len = Math.hypot(dx, dy);
            if (!this.ballBody || len < 10) {
                // Too small a swipe, ignore
                return;
            }

            // Screen X => world -X, screen Y => world +Z (align with perceived swipe direction)
            let dirX = -dx / len;
            let dirZ = dy / len;

            // Charge time determines strength
            const now = performance.now();
            const holdMs = now - this.dashState.startTime;
            const maxChargeMs = 1200; // cap charge at ~1.2s
            const charge = Math.min(holdMs / maxChargeMs, 1);

            const baseStrength = 8;
            const extraStrength = 16;
            const strength = baseStrength + extraStrength * charge;

            const impulse = new CANNON.Vec3(
                dirX * strength,
                strength * 0.5, // slight upward jump
                dirZ * strength
            );

            this.ballBody.applyImpulse(impulse, this.ballBody.position);
        };

        target.addEventListener('touchend', (e) => {
            if (!this.dashState.charging) return;

            // Use last known finger position
            const x = this.dashState.currentX;
            const y = this.dashState.currentY;
            endCharge(x, y);

            e.preventDefault();
        }, { passive: false });

        target.addEventListener('touchcancel', () => {
            this.dashState.charging = false;
            this.setDashArrowVisible(false);
        });
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

