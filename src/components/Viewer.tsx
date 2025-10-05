import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Html } from '@react-three/drei';
import React, { useState } from 'react';
import { SceneData, SceneObject } from '../types/building';

interface ViewerProps {
  data: SceneData;
}

// Individual 3D object component with hover interaction
const Object3D = ({ object }: { object: SceneObject }) => {
  const [hovered, setHovered] = useState(false);
  const geometryArgs = object.size as any;

  return (
    <group>
      <mesh
        position={object.position}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {object.shape === 'box' && <boxGeometry args={geometryArgs} />}
        {object.shape === 'sphere' && (
          <sphereGeometry args={[geometryArgs[0], geometryArgs[1] || 32, geometryArgs[2] || 16]} />
        )}
        {object.shape === 'cylinder' && (
          <cylinderGeometry args={[geometryArgs[0], geometryArgs[1], geometryArgs[2], geometryArgs[3] || 32]} />
        )}
        <meshStandardMaterial
          color={object.color}
          transparent
          opacity={hovered ? 0.9 : 0.7}
          emissive={hovered ? object.color : '#000000'}
          emissiveIntensity={hovered ? 0.3 : 0}
        />
      </mesh>

      {/* Label that appears on hover */}
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

const Model = ({ data }: { data: SceneData }) => {
  return (
    <>
      {data.objects.map((object) => (
        <Object3D key={object.id} object={object} />
      ))}
    </>
  );
};

export const Viewer: React.FC<ViewerProps> = ({ data }) => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [30, 30, 30], fov: 50 }}
        style={{ background: '#0f172a' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <directionalLight position={[-10, 10, -5]} intensity={0.5} />
        <pointLight position={[0, 10, 0]} intensity={0.5} />

        {/* Grid for reference */}
        <Grid
          args={[100, 100]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#334155"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#475569"
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid
        />

        {/* 3D Models */}
        <Model data={data} />

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
      </Canvas>
    </div>
  );
};
