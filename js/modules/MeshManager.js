import * as THREE from 'three';

export class MeshManager {
  constructor(app) {
    this.app = app;
    this.meshGroup = null;
    this.meshes = [];

    // Mesh Settings State
    this.currentShape = 'Sphere';
    this.shapeCount = 1;
    this.materialMode = 'Hue';
    this.isSmoothSurface = false;

    this.sphereDetail = 3;
    this.boxSegments = 1;
    this.torusRadialSeg = 16;
    this.torusTubularSeg = 100;
    this.coneRadialSeg = 32;
  }

  init() {
    this.meshGroup = new THREE.Group();
    this.app.rendererManager.scene.add(this.meshGroup);

    // Load initial values from DOM elements if they exist
    this.currentShape = document.getElementById('shape-select')?.value || 'Sphere';
    this.sphereDetail = parseInt(document.getElementById('detail-slider')?.value || '3');
    this.boxSegments = parseInt(document.getElementById('box-segments-slider')?.value || '1');
    this.torusRadialSeg = parseInt(document.getElementById('torus-radial-slider')?.value || '16');
    this.torusTubularSeg = parseInt(document.getElementById('torus-tubular-slider')?.value || '100');
    this.coneRadialSeg = parseInt(document.getElementById('cone-segments-slider')?.value || '32');
    this.shapeCount = parseInt(document.getElementById('shape-count-slider')?.value || '1');
    this.materialMode = document.getElementById('material-select')?.value || 'Hue';
    this.isSmoothSurface = document.getElementById('smooth-surface-toggle')?.checked || false;

    this.updateMeshInstances();
  }

  updateMeshInstances() {
    if (!this.meshGroup) return;

    // Dispose of old geometry/materials
    this.meshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.meshGroup.clear();
    this.meshes = [];

    const { geometry, material } = this.createBaseGeometryAndMaterial();

    for (let i = 0; i < this.shapeCount; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      if (this.shapeCount === 1) {
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
      } else {
        mesh.position.set(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7
        );
        mesh.rotation.set(
          Math.random() * 2 * Math.PI,
          Math.random() * 2 * Math.PI,
          Math.random() * 2 * Math.PI
        );
      }
      this.meshGroup.add(mesh);
      this.meshes.push(mesh);
    }

    // Re-apply scale when meshes are rebuilt
    const scaleSlider = document.getElementById('scale-slider');
    const currentScale = scaleSlider ? parseFloat(scaleSlider.value) : 1.0;
    this.meshGroup.scale.set(currentScale, currentScale, currentScale);
  }

  createBaseGeometryAndMaterial() {
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
      case 'Sphere':
      default:
        geometry = new THREE.IcosahedronGeometry(1, this.sphereDetail);
        break;
    }

    let material;
    const wireframe = !this.isSmoothSurface;

    switch (this.materialMode) {
      case 'Monochrome':
        material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          wireframe: wireframe
        });
        break;
      case 'Lit':
        material = new THREE.MeshPhongMaterial({
          color: 0xffffff,
          wireframe: wireframe,
          flatShading: this.isSmoothSurface
        });
        break;
      case 'Hue':
      default:
        material = new THREE.MeshNormalMaterial({
          wireframe: wireframe,
          flatShading: this.isSmoothSurface
        });
        break;
    }
    return { geometry, material };
  }

  setScale(scale) {
    if (this.meshGroup) {
      this.meshGroup.scale.set(scale, scale, scale);
    }
  }

  update(rotationSpeed) {
    if (this.meshGroup) {
      this.meshGroup.rotation.x += rotationSpeed / 2.5;
      this.meshGroup.rotation.y += rotationSpeed;

      const individualSpeed = rotationSpeed * 0.1;
      this.meshes.forEach(mesh => {
        mesh.rotation.x += individualSpeed;
        mesh.rotation.z += individualSpeed;
      });
    }
  }
}
