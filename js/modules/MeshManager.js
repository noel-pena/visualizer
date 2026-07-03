import * as THREE from 'three';

// Reused per-frame to avoid allocating thousands of vectors in the particle loop
const _scratchVec = new THREE.Vector3();

export class MeshManager {
  constructor(app) {
    this.app = app;
    this.meshGroup = null;
    this.meshes = [];

    // Scene State
    this.sceneMode = 'Shapes'; // Shapes, Synthwave, Particles

    // Shapes State
    this.currentShape = 'Sphere';
    this.shapeCount = 1;
    this.layoutMode = 'Nested';
    this.materialMode = 'Hue';
    this.isSmoothSurface = false;
    this.baseScale = 1.0;

    this.sphereDetail = 3;
    this.boxSegments = 1;
    this.torusRadialSeg = 16;
    this.torusTubularSeg = 100;
    this.coneRadialSeg = 32;

    // Synthwave State
    this.terrainMesh = null;
    this.terrainOriginalZ = null;
    this.terrainClock = 0;

    // Particles State
    this.particleSystem = null;
    this.particleVelocities = [];
    this.originalPositions = [];
  }

  init() {
    this.meshGroup = new THREE.Group();
    this.app.rendererManager.scene.add(this.meshGroup);

    // Load initial values from DOM elements
    this.sceneMode = document.getElementById('scene-mode-select')?.value || 'Shapes';
    this.currentShape = document.getElementById('shape-select')?.value || 'Sphere';
    this.sphereDetail = parseInt(document.getElementById('detail-slider')?.value || '3');
    this.boxSegments = parseInt(document.getElementById('box-segments-slider')?.value || '1');
    this.torusRadialSeg = parseInt(document.getElementById('torus-radial-slider')?.value || '16');
    this.torusTubularSeg = parseInt(document.getElementById('torus-tubular-slider')?.value || '100');
    this.coneRadialSeg = parseInt(document.getElementById('cone-segments-slider')?.value || '32');
    this.shapeCount = parseInt(document.getElementById('shape-count-slider')?.value || '1');
    this.layoutMode = document.getElementById('layout-select')?.value || 'Nested';
    this.materialMode = document.getElementById('material-select')?.value || 'Hue';
    this.isSmoothSurface = document.getElementById('smooth-surface-toggle')?.checked || false;
    this.baseScale = parseFloat(document.getElementById('scale-slider')?.value || '1.0');

    this.buildScene();
  }

  setSceneMode(mode) {
    this.sceneMode = mode;
    this.buildScene();
  }

  buildScene() {
    if (!this.meshGroup) return;

    // Clear everything
    this.meshGroup.clear();
    
    // Dispose Shapes
    this.meshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
      else mesh.material.dispose();
    });
    this.meshes = [];

    // Dispose Terrain
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.material.dispose();
      this.terrainMesh = null;
    }

    // Dispose Particles
    if (this.particleSystem) {
      this.particleSystem.geometry.dispose();
      this.particleSystem.material.dispose();
      this.particleSystem = null;
    }

    // Reset rotation/scale
    this.meshGroup.rotation.set(0, 0, 0);
    this.meshGroup.position.set(0, 0, 0);
    this.meshGroup.scale.set(this.baseScale, this.baseScale, this.baseScale);

    if (this.sceneMode === 'Shapes') {
      this.buildShapes();
    } else if (this.sceneMode === 'Synthwave') {
      this.buildSynthwave();
    } else if (this.sceneMode === 'Particles') {
      this.buildParticles();
    }
  }

  // ALIAS for backward compatibility with UI slider events
  updateMeshInstances() {
    if (this.sceneMode === 'Shapes') {
      this.buildScene();
    }
  }

  buildShapes() {
    let geometry;
    switch (this.currentShape) {
      case 'Box':
        const seg = this.boxSegments;
        geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5, seg, seg, seg);
        break;
      case 'Torus':
        geometry = new THREE.TorusGeometry(1, 0.4, this.torusRadialSeg, this.torusTubularSeg);
        break;
      case 'Cone':
        geometry = new THREE.ConeGeometry(1, 2, this.coneRadialSeg, 1, false, 0, Math.PI * 2);
        break;
      case 'TorusKnot':
        geometry = new THREE.TorusKnotGeometry(1, 0.3, this.torusTubularSeg, this.torusRadialSeg);
        break;
      case 'Dodecahedron':
        geometry = new THREE.DodecahedronGeometry(1, 0);
        break;
      case 'Octahedron':
        geometry = new THREE.OctahedronGeometry(1, 0);
        break;
      case 'Tetrahedron':
        geometry = new THREE.TetrahedronGeometry(1, 0);
        break;
      case 'Cylinder':
        geometry = new THREE.CylinderGeometry(1, 1, 2, this.coneRadialSeg);
        break;
      case 'Sphere':
      default:
        geometry = new THREE.IcosahedronGeometry(1, this.sphereDetail);
        break;
    }

    let material;
    const flatShading = !this.isSmoothSurface;

    switch (this.materialMode) {
      case 'Monochrome':
        // "Wireframe" — always lines
        material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        break;
      case 'Lit':
        // "Solid" — always a filled, lit surface
        material = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading });
        break;
      case 'Hue':
      default:
        // "Holographic" — classic rainbow wireframe; Smooth Surface toggle fills it.
        // flatShading must stay off: derivative-based flat normals turn wireframe lines black (NaN).
        material = new THREE.MeshNormalMaterial({ wireframe: !this.isSmoothSurface, flatShading: false });
        break;
    }

    for (let i = 0; i < this.shapeCount; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      
      if (this.shapeCount === 1) {
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
      } else {
        if (this.layoutMode === 'Nested') {
          mesh.position.set(0, 0, 0);
          // Scale grows outward linearly
          const scaleMult = 1 + (i * 0.4);
          mesh.scale.set(scaleMult, scaleMult, scaleMult);
          
          // Slightly offset rotations so they look like complex gyroscopes
          mesh.rotation.set(
            (i * Math.PI) / this.shapeCount,
            (i * Math.PI) / this.shapeCount,
            0
          );
        } else if (this.layoutMode === 'Linear') {
          // Stack along the Y axis
          const spacing = 3.0;
          const totalHeight = (this.shapeCount - 1) * spacing;
          const yPos = (i * spacing) - (totalHeight / 2);
          mesh.position.set(0, yPos, 0);
          mesh.rotation.set(0, 0, 0);
        } else if (this.layoutMode === 'Radial') {
          // Ring layout
          const radius = Math.max(3, this.shapeCount * 0.8);
          const angle = (i / this.shapeCount) * Math.PI * 2;
          mesh.position.set(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
          );
          mesh.rotation.set(0, -angle, 0); // Face outward
        }
      }
      
      this.meshGroup.add(mesh);
      this.meshes.push(mesh);
    }
  }

  buildSynthwave() {
    const segments = 40;
    const size = 30;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    
    const count = geometry.attributes.position.count;
    this.terrainOriginalZ = new Float32Array(count);
    
    // Add some random noise to the vertices
    for (let i = 0; i < count; i++) {
      const noise = (Math.random() - 0.5) * 1.5;
      this.terrainOriginalZ[i] = noise;
      geometry.attributes.position.setZ(i, noise);
    }

    const material = new THREE.MeshBasicMaterial({ 
      color: 0xc084fc, // purple-400
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.rotation.x = -Math.PI / 2; // Lay flat
    this.terrainMesh.position.y = -3;
    this.meshGroup.add(this.terrainMesh);
  }

  buildParticles() {
    const particleCount = 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    this.particleVelocities = [];
    this.originalPositions = [];
    
    for (let i = 0; i < particleCount; i++) {
        // Sphere distribution
        const radius = 2 + Math.random() * 8;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos((Math.random() * 2) - 1);
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);
        
        positions[i*3] = x;
        positions[i*3+1] = y;
        positions[i*3+2] = z;
        
        this.originalPositions.push(new THREE.Vector3(x, y, z));
        this.particleVelocities.push(new THREE.Vector3(0,0,0));
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0x00ffff, // cyan
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    this.meshGroup.add(this.particleSystem);
  }

  update(rotationSpeed, audioData) {
    if (!this.meshGroup) return;

    // Routed band energies (defaults preserve the classic bass/high/mid mapping)
    const routing = this.app.audioRouting;
    const scaleV = routing ? routing.value('scalePulse', audioData) : 0;
    const rotV = routing ? routing.value('rotationBoost', audioData) : 0;
    const hueV = routing ? routing.value('hueShift', audioData) : 0;
    const high = audioData ? audioData.high : 0; // raw sparkle for particle jitter

    // Apply global scale
    let targetScale = this.baseScale;

    if (this.sceneMode === 'Shapes') {
        const scalePulse = scaleV * (this.baseScale * 1.2);
        targetScale += scalePulse;

        this.meshGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15);

        const speedMult = 1 + (rotV * 3);
        this.meshGroup.rotation.x += (rotationSpeed / 2.5) * speedMult;
        this.meshGroup.rotation.y += rotationSpeed * speedMult;

        const individualSpeed = (rotationSpeed * 0.1) * speedMult;
        this.meshes.forEach(mesh => {
            mesh.rotation.x += individualSpeed;
            mesh.rotation.z += individualSpeed;
        });
    } 
    else if (this.sceneMode === 'Synthwave') {
        // Slowly rotate camera container for flyover effect
        this.meshGroup.scale.set(this.baseScale, this.baseScale, this.baseScale);
        
        // Scroll the terrain
        this.terrainClock += 0.05 + (scaleV * 0.1);
        
        if (this.terrainMesh) {
            const positions = this.terrainMesh.geometry.attributes.position;
            const count = positions.count;
            
            // Displace vertices based on bass and a wave function
            for (let i = 0; i < count; i++) {
                const baseZ = this.terrainOriginalZ[i];
                // Get the Y position (which is Z in the flat plane)
                const y = positions.getY(i);
                
                // Create rolling hills that react to the routed scale band
                const wave = Math.sin(y * 0.5 + this.terrainClock) * (scaleV * 4);

                // Exaggerate heights on the edges, leave a valley in the middle
                const x = positions.getX(i);
                const valleyMask = Math.abs(x) / 15.0; // 0 at center, 1 at edges

                positions.setZ(i, baseZ + (wave * valleyMask) + (scaleV * 2 * valleyMask));
            }
            positions.needsUpdate = true;

            // Color follows the routed hue band
            this.terrainMesh.material.color.setHSL((this.terrainClock * 0.01 + hueV * 0.5) % 1, 0.8, 0.6);
        }
    } 
    else if (this.sceneMode === 'Particles') {
        this.meshGroup.scale.set(this.baseScale, this.baseScale, this.baseScale);
        
        // Slowly rotate the galaxy
        this.meshGroup.rotation.y += rotationSpeed * 0.5 * (1 + rotV);
        this.meshGroup.rotation.z += rotationSpeed * 0.2;

        if (this.particleSystem) {
            const positions = this.particleSystem.geometry.attributes.position;
            const count = positions.count;
            
            // Color shift follows the routed hue band
            this.particleSystem.material.color.setHSL((Date.now() * 0.0001 + hueV) % 1, 0.8, 0.6);

            for (let i = 0; i < count; i++) {
                const orig = this.originalPositions[i];
                const vel = this.particleVelocities[i];
                
                // Current position
                let px = positions.getX(i);
                let py = positions.getY(i);
                let pz = positions.getZ(i);
                
                // On heavy hits in the routed scale band, explode outward
                if (scaleV > 0.4) {
                    _scratchVec.set(px, py, pz).normalize();
                    vel.add(_scratchVec.multiplyScalar(scaleV * 0.05));
                }

                // Apply velocity
                px += vel.x;
                py += vel.y;
                pz += vel.z;

                // Dampen velocity
                vel.multiplyScalar(0.9);

                // Spring back to original position
                const dx = orig.x - px;
                const dy = orig.y - py;
                const dz = orig.z - pz;
                
                px += dx * 0.02; // Return speed
                py += dy * 0.02;
                pz += dz * 0.02;

                // Add a bit of jitter based on high frequencies
                px += (Math.random() - 0.5) * high * 0.1;
                py += (Math.random() - 0.5) * high * 0.1;
                pz += (Math.random() - 0.5) * high * 0.1;

                positions.setXYZ(i, px, py, pz);
            }
            positions.needsUpdate = true;
        }
    }
  }
}
