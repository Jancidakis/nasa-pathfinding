import { Canvas } from '@react-three/fiber';
import { OrbitControls, Plane, GizmoHelper, GizmoViewport, Html } from '@react-three/drei';
import React, { useState } from 'react';
import { SceneData, SceneObject } from '../types/building';
import * as THREE from 'three';

// A single, shared material for all ghost objects for performance
const ghostMaterial = new THREE.MeshStandardMaterial({
  color: 'cyan',
  transparent: true,
  opacity: 0.6,
  emissive: '#008888',
  emissiveIntensity: 0.5,
});

interface ViewerProps {
  data: SceneData;
  placementModeData: SceneData | null;
  onPlaceModel: (position: [number, number, number]) => void;
}

// Reusable helper to get the correct geometry for a scene object
const getObjectGeometry = (object: SceneObject) => {
  const geometryArgs = object.size as any;
  const isDoor = object.type === 'door' || object.type === 'exit';

  if (isDoor) {
    const doorHeight = geometryArgs[1] || 2.5;
    const doorLength = geometryArgs[0] || 1;
    const doorWidth = 0.2;
    return <boxGeometry args={[doorLength, doorHeight, doorWidth]} />;
  }

  switch (object.shape) {
    case 'box':
      return <boxGeometry args={geometryArgs} />;
    case 'sphere':
      return <sphereGeometry args={[geometryArgs[0], geometryArgs[1] || 32, geometryArgs[2] || 16]} />;
    case 'cylinder':
      return <cylinderGeometry args={[geometryArgs[0], geometryArgs[1], geometryArgs[2], geometryArgs[3] || 32]} />;
    default:
      return null;
  }
};

// Component for a single, solid object already in the scene
const Object3D = ({ object }: { object: SceneObject }) => {
  const [hovered, setHovered] = useState(false);
  const isDoor = object.type === 'door' || object.type === 'exit';
  const doorColor = object.type === 'exit' ? '#EF4444' : '#22c55e';

  return (
    <group>
      <mesh
        position={object.position}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {getObjectGeometry(object)}
        <meshStandardMaterial
          color={isDoor ? doorColor : object.color}
          transparent
          opacity={hovered ? 0.95 : (isDoor ? 0.85 : 0.7)}
          emissive={hovered ? (isDoor ? doorColor : object.color) : '#000000'}
          emissiveIntensity={hovered ? 0.4 : (isDoor ? 0.2 : 0)}
        />
      </mesh>
      {hovered && object.label && (
        <Html position={object.position} center distanceFactor={10}>
          <div className="bg-black bg-opacity-75 text-white px-3 py-1 rounded-md text-sm whitespace-nowrap pointer-events-none">
            {object.label}
          </div>
        </Html>
      )}
    </group>
  );
};

// Renders the semi-transparent 'ghost' model that follows the cursor
const GhostModel = ({ scene, position }: { scene: SceneData; position: [number, number, number] }) => {
  return (
    <group position={position}>
      {scene.objects.map(object => (
        <mesh key={`ghost-${object.id}`} position={object.position}>
          {getObjectGeometry(object)}
          <primitive object={ghostMaterial} attach="material" />
        </mesh>
      ))}
    </group>
  );
};

// Main Scene Content
const SceneContent: React.FC<ViewerProps> = ({ data, placementModeData, onPlaceModel }) => {
  const [pointerPosition, setPointerPosition] = useState<[number, number, number] | null>(null);

  const handlePointerMove = (e: any) => {
    // Only track pointer if we are in placement mode
    if (placementModeData) {
      setPointerPosition([e.point.x, 0, e.point.z]);
    }
  };

  const handlePlaceModel = () => {
    // Only place model if we are in placement mode and have a valid position
    if (placementModeData && pointerPosition) {
      onPlaceModel(pointerPosition);
    }
  };

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <pointLight position={[0, 10, 0]} intensity={0.5} />

      {/* Invisible plane for mouse interaction */}
      <Plane
        args={[2000, 2000]} // Very large plane
        rotation={[-Math.PI / 2, 0, 0]} // Lay flat on the ground
        visible={false} // Make it invisible
        onPointerMove={handlePointerMove}
        onClick={handlePlaceModel}
      />

      {/* Render existing, solid models */}
      {data.objects.map((object) => (
        <Object3D key={object.id} object={object} />
      ))}

      {/* Render the ghost model if in placement mode */}
      {placementModeData && pointerPosition && (
        <GhostModel scene={placementModeData} position={pointerPosition} />
      )}

      {/* Camera Controls */}
      <OrbitControls
        makeDefault
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.1}
        enableDamping
        dampingFactor={0.05}
      />

      {/* Gizmo Helper for orientation */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={['#ef4444', '#22c55e', '#3b82f6']}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
};

export const Viewer: React.FC<ViewerProps> = (props) => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{
          position: [500, 500, 500],
          fov: 50,
          near: 0.1,
          far: 50000 // Aumentar far plane para terrenos grandes
        }}
        style={{ background: '#0f172a' }}
      >
        <SceneContent {...props} />
      </Canvas>
    </div>
  );
};
