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
        
        // Visual container for the level
        this.levelGroup = new THREE.Group();
        this.scene.add(this.levelGroup);
        
        // Textures
        const loader = new THREE.TextureLoader();
        
        // Setup texture anisotropy and repeating for realism
        const setupTexture = (path, repeatScale = 1) => {
            const tex = loader.load(path);
            tex.anisotropy = 16;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            // We'll update repeat in createBlock based on size, or use a default here
            return tex;
        };

        const floorTex = setupTexture('checkered_floor.png');
        const wallTex = setupTexture('wood_texture.png');
        
        this.floorMat = new THREE.MeshStandardMaterial({ 
            map: floorTex,
            roughness: 0.8,
            metalness: 0.1
        });
        
        this.wallMat = new THREE.MeshStandardMaterial({ 
            map: wallTex,
            roughness: 0.9,
            metalness: 0.0
        });

        this.goalMat = new THREE.MeshBasicMaterial({ 
            map: loader.load('goal_texture.png'), 
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // Physics Materials
        this.slipperyMat = new CANNON.Material('slippery');
    }

    clear() {
        for (const body of this.bodies) {
            this.world.removeBody(body);
        }
        this.bodies = [];
        this.levelGroup.clear();
        this.goalPos = null;
        this.goalMesh = null;
    }
    
    setVisualTilt(tiltX, tiltZ) {
        // No-op for physics based tilt
    }

    loadLevel(levelNum) {
        this.currentLevelIndex = levelNum;
        
        // Legend:
        // . : Flat Floor
        // W : Tall Wall
        // | : Rail / Low Wall
        // ^ : Ramp Up North (Towards -Z)
        // v : Ramp Up South (Towards +Z)
        // < : Ramp Up West (Towards -X)
        // > : Ramp Up East (Towards +X)
        // M : Bump / Pyramid
        // S : Start
        // G : Goal
        // O : Hole
        
        const levels = [
            // Level 1: Rolling Meadows
            // Introduction to uneven terrain.
            {
                map: [
                    "||||||||||||||||",
                    "|S.............|",
                    "|...^.......^..|",
                    "|...v.......v..|",
                    "|..............|",
                    "|...<...>......|",
                    "|..............|",
                    "|||||||||......|",
                    "        |..M...|",
                    "        |......|",
                    "        |......|",
                    "        |...G..|",
                    "        ||||||||"
                ],
                scale: 3
            },
            // Level 2: Canyon Drift
            // Narrower, banked curves (simulated by angled floors)
            {
                map: [
                    "WWWWWWWWWWWWWWW",
                    "W.S...........W",
                    "W.............W",
                    "W...>>>>>>>...W",
                    "W.............W",
                    "WWWWWWWWWW....W",
                    "         W....W",
                    "         W....W",
                    "  WWWWWWWW....W",
                    "  W...........W",
                    "  W...^^^^^...W",
                    "  W...........W",
                    "  W...G.......W",
                    "  WWWWWWWWWWWWW"
                ],
                scale: 3
            },
            // Level 3: Mogul Run
            // Lots of bumps and varied terrain
            {
                map: [
                    "                ",
                    "      ||||||    ",
                    "      |S...|    ",
                    "      |.M..|    ",
                    "      |....|    ",
                    "      |.M..|    ",
                    "  |||||....|||||",
                    "  |............|",
                    "  |..M......M..|",
                    "  |............|",
                    "  |.<........>.|",
                    "  |............|",
                    "  |||||....|||||",
                    "      |....|    ",
                    "      |.M..|    ",
                    "      |..G.|    ",
                    "      ||||||    "
                ],
                scale: 3
            }
        ];

        const idx = (levelNum - 1) % levels.length;
        const data = levels[idx];
        
        this.applyTheme(levelNum);
        return this.buildFromMap(data.map, data.scale);
    }

    applyTheme(levelNum) {
        const floorColors = [0xffffff, 0xd0f0c0, 0xffeebb, 0xe0f7fa];
        const wallColors = [0x8b4513, 0xa0522d, 0xcd853f, 0xdefeff];
        
        const idx = (levelNum - 1) % floorColors.length;
        this.floorMat.color.setHex(floorColors[idx]);
        this.wallMat.color.setHex(wallColors[idx]);
    }

    buildFromMap(map, scale) {
        let startPos = { x: 0, y: 5, z: 0 };
        const rows = map.length;
        const cols = map[0].length;
        
        const halfW = cols * scale / 2;
        const halfH = rows * scale / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < map[r].length; c++) {
                const char = map[r][c];
                const x = (c * scale) - halfW;
                const z = (r * scale) - halfH;
                
                if (char === ' ') continue; // Void
                
                // Add base skirt for everything except explicit holes or void
                if (char !== 'O') {
                    // Randomize skirt depth for organic look
                    const skirtDepth = 3 + Math.random() * 2;
                    this.createBlock(x, -skirtDepth/2 - 0.5, z, scale, skirtDepth, scale, this.wallMat, true);
                }

                switch (char) {
                    case '.': // Flat Floor
                    case 'S':
                    case 'G':
                        this.createBlock(x, 0, z, scale, 1, scale, this.floorMat, false);
                        break;
                    case 'W': // Tall Wall
                        this.createBlock(x, 0, z, scale, 1, scale, this.floorMat, false); // floor base
                        this.createBlock(x, 1.5, z, scale, 3, scale, this.wallMat, false); // wall
                        break;
                    case '|': // Rail
                        this.createBlock(x, 0, z, scale, 1, scale, this.floorMat, false); // floor base
                        this.createBlock(x, 1, z, scale, 1, scale, this.wallMat, false); // rail
                        break;
                    case '^': // Slope North (Up towards -Z)
                        this.createSlope(x, z, scale, 'N');
                        break;
                    case 'v': // Slope South
                        this.createSlope(x, z, scale, 'S');
                        break;
                    case '<': // Slope West
                        this.createSlope(x, z, scale, 'W');
                        break;
                    case '>': // Slope East
                        this.createSlope(x, z, scale, 'E');
                        break;
                    case 'M': // Bump
                        this.createPyramid(x, z, scale);
                        break;
                }

                if (char === 'S') startPos = { x, y: 4, z };
                if (char === 'G') this.createGoal(x, 0.6, z);
            }
        }
        
        return startPos;
    }

    // Standard block
    createBlock(x, y, z, w, h, d, mat, isGhost) {
        // adjust texture repeat for this block
        const localMat = mat.clone();
        if (localMat.map) {
            localMat.map = mat.map.clone(); // Clone texture to support unique repeat
            localMat.map.repeat.set(w / 2, d / 2); // Density
            localMat.map.wrapS = THREE.RepeatWrapping;
            localMat.map.wrapT = THREE.RepeatWrapping;
        }

        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), localMat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.levelGroup.add(mesh);
        
        if (!isGhost) {
            const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
            const body = new CANNON.Body({ mass: 0 });
            body.position.set(x, y, z);
            body.addShape(shape);
            // Slippery walls, grippy floors?
            body.material = this.world.defaultMaterial; 
            this.world.addBody(body);
            this.bodies.push(body);
        }
    }

    createSlope(x, z, scale, dir) {
        // We simulate a slope by rotating a box
        // A box of width 'scale' rotated by angle 'theta'
        const angle = Math.PI / 10; // 18 degrees
        const boxH = 0.5;
        
        // Visual
        const geometry = new THREE.BoxGeometry(scale, boxH, scale);
        const mat = this.floorMat.clone();
        if (mat.map) {
            mat.map = this.floorMat.map.clone();
            mat.map.repeat.set(1, 1);
        }
        const mesh = new THREE.Mesh(geometry, mat);
        
        // Physics Body
        const shape = new CANNON.Box(new CANNON.Vec3(scale/2, boxH/2, scale/2));
        const body = new CANNON.Body({ mass: 0 });
        
        // Orient
        // Default box is flat. 
        // N = Up towards -Z. Rotate around X axis negative?
        
        const q = new THREE.Quaternion();
        const axisX = new THREE.Vector3(1, 0, 0);
        const axisZ = new THREE.Vector3(0, 0, 1);
        
        if (dir === 'N') q.setFromAxisAngle(axisX, -angle); 
        if (dir === 'S') q.setFromAxisAngle(axisX, angle);
        if (dir === 'E') q.setFromAxisAngle(axisZ, -angle);
        if (dir === 'W') q.setFromAxisAngle(axisZ, angle);
        
        mesh.quaternion.copy(q);
        mesh.position.set(x, 0, z);
        
        body.quaternion.copy(mesh.quaternion);
        body.position.copy(mesh.position);
        
        body.addShape(shape);
        this.world.addBody(body);
        this.bodies.push(body);
        
        this.levelGroup.add(mesh);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    }

    createPyramid(x, z, scale) {
        // Visual: Cone/Pyramid
        const height = 1.5;
        const geometry = new THREE.ConeGeometry(scale/1.5, height, 4);
        const mesh = new THREE.Mesh(geometry, this.floorMat);
        mesh.position.set(x, 0, z); // Center is y=0 (half buried)
        mesh.rotation.y = Math.PI / 4; // Align with grid
        this.levelGroup.add(mesh);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Physics: Approximation with a cylinder or just the visual cone?
        // Cannon has cylinder, no cone. Use ConvexPolyhedron? 
        // For simplicity/robustness, use a slightly smaller Cylinder or Sphere for the bump.
        // A sphere bump is fun.
        
        const shape = new CANNON.Sphere(scale/2);
        const body = new CANNON.Body({ mass: 0 });
        body.position.set(x, -scale/4, z); // Buried sphere makes a nice bump
        body.addShape(shape);
        this.world.addBody(body);
        this.bodies.push(body);
    }

    createGoal(x, y, z) {
        this.goalPos = new THREE.Vector3(x, y, z);
        const geometry = new THREE.CylinderGeometry(1.5, 1.5, 4, 16, 1, true);
        const mesh = new THREE.Mesh(geometry, this.goalMat);
        // Animate or rotate goal? 
        // We'll just place it.
        mesh.position.set(x, y + 2, z);
        
        // Add a glow/spinner
        const spinner = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.1, 8, 16), 
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        mesh.add(spinner);
        
        this.levelGroup.add(mesh);
        this.goalMesh = mesh;
    }

    checkGoal(ballPos) {
        if (!this.goalPos) return false;
        // Check XZ distance
        const dx = ballPos.x - this.goalPos.x;
        const dz = ballPos.z - this.goalPos.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        return dist < 2.0;
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

