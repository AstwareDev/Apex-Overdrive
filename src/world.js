import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function buildPhysicsWorld() {
  const world = new CANNON.World();
  world.gravity.set(0, -20, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 20;

  // Default contact material — good grip on asphalt
  const groundMat = new CANNON.Material('ground');
  const wheelMat  = new CANNON.Material('wheel');
  const contact   = new CANNON.ContactMaterial(groundMat, wheelMat, {
    friction: 0.6,
    restitution: 0.01,
  });
  world.addContactMaterial(contact);
  world.defaultContactMaterial = contact;

  return world;
}

export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.004);

  // Sky gradient via background
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
  sun.position.set(80, 120, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 600;
  sun.shadow.camera.left   = -200;
  sun.shadow.camera.right  =  200;
  sun.shadow.camera.top    =  200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8ab4f8, 0.5);
  fill.position.set(-60, 40, -80);
  scene.add(fill);

  return scene;
}


export function loadTrack(scene, world, onProgress) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      '/track.glb',
      (gltf) => {
        const track = gltf.scene;

        // Auto-scale: assume the track is very large in world units; normalise it
        const box = new THREE.Box3().setFromObject(track);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        if (maxDim > 800 || maxDim < 50) {
          const targetSize = 300;
          track.scale.setScalar(targetSize / maxDim);
        }

        // Center track at origin, sit on y=0
        box.setFromObject(track);
        const center = new THREE.Vector3();
        box.getCenter(center);
        track.position.x -= center.x;
        track.position.z -= center.z;
        track.position.y -= box.min.y;

        track.traverse(child => {
          if (child.isMesh) {
            child.receiveShadow = true;
            child.castShadow    = false;
          }
        });

        scene.add(track);

        // Make sure world matrices reflect the new transform before we sample
        track.updateWorldMatrix(true, true);

        // The drivable drift pad is a large flat platform. Detect its height at the
        // origin and lay a fast analytic ground plane there for the car to drive on.
        // (A full trimesh of all 300k+ track triangles is far too slow for the
        //  vehicle's per-wheel raycasts to run in real time.)
        const surfaceY = sampleTrackHeight(track, 0, 0);
        const collider = buildDrivableGround(world, surfaceY);

        resolve({ gltf, collider, spawnY: surfaceY });
      },
      (xhr) => onProgress && onProgress(xhr.loaded / xhr.total),
      (err) => { console.error('Track load error:', err); resolve(null); },
    );
  });
}

// Lay a static, infinite ground plane at the drift-pad height. An analytic plane
// makes the vehicle's wheel raycasts essentially free, so the sim runs full speed.
function buildDrivableGround(world, surfaceY) {
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
  body.addShape(new CANNON.Plane());
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // face up (+y)
  body.position.set(0, surfaceY, 0);
  world.addBody(body);
  console.log(`Drivable ground plane placed at y=${surfaceY.toFixed(2)}`);
  return body;
}

// Raycast straight down through the track to find the surface height at (x, z)
function sampleTrackHeight(track, x, z) {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObject(track, true);
  return hits.length ? hits[0].point.y : 0;
}

export function loadCar(onProgress) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      '/car.glb',
      (gltf) => {
        gltf.scene.traverse(child => {
          if (child.isMesh) {
            child.castShadow    = true;
            child.receiveShadow = false;
          }
        });
        resolve(gltf);
      },
      (xhr) => onProgress && onProgress(xhr.loaded / xhr.total),
      (err) => { console.error('Car load error:', err); resolve(null); },
    );
  });
}
