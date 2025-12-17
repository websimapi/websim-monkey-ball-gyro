import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class LevelManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.meshes = [];
        this.bodies = [];
        this.currentLevelIndex = 0;
        this.goalPos = null;
        this.goalMesh = null;
        
        // Visual container for the level (so we can tilt it visually)
        this.levelGroup = new THREE.Group();
        this.scene.add(this.levelGroup);
        
        // Textures
        const loader = new THREE.TextureLoader();
        this.floorMat = new THREE.MeshStandardMaterial({ map: loader.load('checkered_floor.png') });
        this.wallMat = new THREE.MeshStandardMaterial({ map: loader.load('wood_texture.png') });
        this.goalMat = new THREE.MeshBasicMaterial({ map: loader.load('goal_texture.png'), transparent: true });
    }

    clear() {
        // Remove physics bodies
        for (const body of this.bodies) {
            this.world.removeBody(body);
        }
        this.bodies = [];
        
        // Remove meshes
        this.levelGroup.clear(); // Clears all children
        this.goalPos = null;
        this.goalMesh = null;
    }
    
    setVisualTilt(tiltX, tiltZ, pivot) {
        // Tilt the level container to match the gravity vector roughly
        // Gravity X/Z are applied.
        // We want the floor to look like it's tilting down in the direction of gravity.
        
        // If gravity pulls +X, floor should rotate -Z (bank right)
        // If gravity pulls +Z, floor should rotate +X (pitch down)
        
        // Smoothly update rotation
        const euler = new THREE.Euler(tiltX, 0, tiltZ, 'XYZ');
        this.levelGroup.setRotationFromEuler(euler);
        
        // Optional: Keep level centered around ball visually? 
        // No, in Monkey Ball the level rotates around the center of the world usually.
        // But if the ball is far away, it looks weird.
        // Let's just rotate around 0,0,0.
    }

    loadLevel(levelNum) {
        this.currentLevelIndex = levelNum;
        const levels = [
            // Level 1: Straight path
            {
                map: [
                    "WWWWWWW",
                    "W.....W",
                    "W.S...W",
                    "W.....W",
                    "W.....W",
                    "W.....W",
                    "W.....W",
                    "W..G..W",
                    "W.....W",
                    "WWWWWWW"
                ],
                scale: 2
            },
            // Level 2: The Turn
            {
                map: [
                    "WWWWWWWWWW",
                    "W........W",
                    "W.S......W",
                    "W........W",
                    "WWWWWW...W",
                    "     W...W",
                    "     W...W",
                    "     W...W",
                    "     W.G.W",
                    "     WWWWW"
                ],
                scale: 2
            },
            // Level 3: Holes
            {
                map: [
                    "WWWWWWWWW",
                    "W.S.....W",
                    "W.......W",
                    "W...O...W",
                    "W.......W",
                    "W...O...W",
                    "W.......W",
                    "W...G...W",
                    "WWWWWWWWW"
                ],
                scale: 2
            },
             // Level 4: Thin bridge
             {
                map: [
                    "WWWWW",
                    "W.S.W",
                    "W...W",
                    "W...W",
                    " . . ",
                    " . . ",
                    " . . ",
                    "W...W",
                    "W.G.W",
                    "WWWWW"
                ],
                scale: 2
            }
        ];

        const idx = levelNum - 1;
        if (idx >= levels.length) return null;

        const data = levels[idx];
        return this.buildFromMap(data.map, data.scale);
    }

    buildFromMap(map, scale) {
        let startPos = { x: 0, y: 5, z: 0 };
        const rows = map.length;
        const cols = map[0].length;
        
        const halfW = cols * scale / 2;
        const halfH = rows * scale / 2;

        // Floor Body (Static plane isn't enough for holes, using boxes)
        // We will build the floor out of box blocks for simplicity
        
        const boxGeo = new THREE.BoxGeometry(scale, 1, scale);
        const wallGeo = new THREE.BoxGeometry(scale, 2, scale); // Taller walls
        
        // Create a single geometry for floor to optimize? 
        // For simplicity, individual meshes.
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < map[r].length; c++) {
                const char = map[r][c];
                const x = (c * scale) - halfW;
                const z = (r * scale) - halfH;
                
                if (char === ' ') continue; // Void
                
                // Floor block for everyone except void
                if (char !== 'O') { // O is hole
                    this.createBlock(x, -0.5, z, scale, 1, scale, this.floorMat, false);
                }

                if (char === 'W') {
                    // Wall
                    this.createBlock(x, 1, z, scale, 2, scale, this.wallMat, false);
                } else if (char === 'S') {
                    startPos = { x, y: 2, z };
                } else if (char === 'G') {
                    this.createGoal(x, 0.1, z);
                }
            }
        }
        
        // Add a giant plane way below to catch shadows if we want, but not needed.
        return startPos;
    }

    createBlock(x, y, z, w, h, d, mat, isGhost) {
        // Visual
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.levelGroup.add(mesh);
        
        if (!isGhost) {
            // Physics
            const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
            const body = new CANNON.Body({
                mass: 0, // Static
                position: new CANNON.Vec3(x, y, z)
            });
            body.addShape(shape);
            this.world.addBody(body);
            this.bodies.push(body);
        }
    }

    createGoal(x, y, z) {
        this.goalPos = new THREE.Vector3(x, y, z);
        
        // Visual Goal
        const geometry = new THREE.PlaneGeometry(3, 3);
        const mesh = new THREE.Mesh(geometry, this.goalMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y + 0.05, z);
        this.levelGroup.add(mesh);
        this.goalMesh = mesh;
    }

    checkGoal(ballPos) {
        if (!this.goalPos) return false;
        const dist = Math.sqrt(
            Math.pow(ballPos.x - this.goalPos.x, 2) + 
            Math.pow(ballPos.z - this.goalPos.z, 2)
        );
        return dist < 1.5;
    }
}

