/**
 * IFC 3D Viewer Component using Three.js and web-ifc
 * Supports storey-based visibility toggling
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as WebIFC from 'web-ifc'
import { LoadingSpinner } from './ui/LoadingSpinner'

// Color palette for different IFC types
const IFC_COLORS: Record<string, number> = {
  // Structural
  IFCWALL: 0xdcd5c5,
  IFCWALLSTANDARDCASE: 0xdcd5c5,
  IFCSLAB: 0xb8b0a0,
  IFCFOOTING: 0x8b8680,
  IFCCOLUMN: 0x6b7b8c,
  IFCBEAM: 0x7d8b9c,
  IFCPLATE: 0x5c6670,
  IFCMEMBER: 0x6e7880,
  // Architectural
  IFCDOOR: 0x9c7050,
  IFCWINDOW: 0xa8d4e6,
  IFCSTAIR: 0xc5bdb0,
  IFCSTAIRFLIGHT: 0xc5bdb0,
  IFCRAILING: 0x4a4a4a,
  IFCROOF: 0xa05030,
  IFCCURTAINWALL: 0x88c8e8,
  IFCCOVERING: 0xe0d8d0,
  // MEP
  IFCFLOWSEGMENT: 0x5080c0,
  IFCFLOWTERMINAL: 0x40a060,
  IFCFLOWFITTING: 0x608040,
  IFCDISTRIBUTIONELEMENT: 0x8070b0,
  IFCPIPESEGMENT: 0x4080a0,
  IFCDUCTSEGMENT: 0x808080,
  // Furniture & Proxy
  IFCFURNISHINGELEMENT: 0xc09040,
  IFCFURNITURE: 0xb08030,
  IFCBUILDINGELEMENTPROXY: 0x909098,
  // Spaces
  IFCSPACE: 0x80e080,
  IFCOPENINGELEMENT: 0xffffff,
  // Default
  DEFAULT: 0x8090a0,
}

export interface StoreyInfo {
  name: string
  elevation: number
  meshCount: number
  visible: boolean
}

interface StoreyData {
  name: string
  elevation: number
  meshes: THREE.Mesh[]
  visible: boolean
}

export interface IFCViewerHandle {
  setStoreyVisibility: (storeyName: string, visible: boolean) => void
  setAllStoreysVisibility: (visible: boolean) => void
  getStoreys: () => StoreyInfo[]
  highlightElements: (expressIds: number[], color?: number) => void
  clearHighlights: () => void
  setElementsOpacity: (expressIds: number[], opacity: number) => void
  resetElementsAppearance: () => void
  getAllMeshExpressIds: () => number[]
  hideAllMeshes: () => void
  showAllMeshes: () => void
}

interface IFCViewerProps {
  fileId: string
  fileName: string
  onStoreysLoaded?: (storeys: StoreyInfo[]) => void
}

export const IFCViewer = forwardRef<IFCViewerHandle, IFCViewerProps>(
  ({ fileId, fileName, onStoreysLoaded }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [loading, setLoading] = useState(true)
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [loadingStage, setLoadingStage] = useState('Initializing...')

    const sceneRef = useRef<{
      scene: THREE.Scene
      camera: THREE.PerspectiveCamera
      renderer: THREE.WebGLRenderer
      controls: OrbitControls
      animationId: number
    } | null>(null)

    const storeysRef = useRef<StoreyData[]>([])
    const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map())
    const allMeshesRef = useRef<THREE.Mesh[]>([])

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      setStoreyVisibility: (storeyName: string, visible: boolean) => {
        const storey = storeysRef.current.find(s => s.name === storeyName)
        if (storey) {
          storey.visible = visible
          storey.meshes.forEach(mesh => {
            mesh.visible = visible
          })
        }
      },
      setAllStoreysVisibility: (visible: boolean) => {
        storeysRef.current.forEach(storey => {
          storey.visible = visible
          storey.meshes.forEach(mesh => {
            mesh.visible = visible
          })
        })
      },
      getStoreys: () => storeysRef.current.map(s => ({
        name: s.name,
        elevation: s.elevation,
        meshCount: s.meshes.length,
        visible: s.visible
      })),
      highlightElements: (expressIds: number[], color: number = 0x00ff00) => {
        const expressIdSet = new Set(expressIds)
        allMeshesRef.current.forEach(mesh => {
          if (expressIdSet.has(mesh.userData.expressID)) {
            // Store original material if not already stored
            if (!originalMaterialsRef.current.has(mesh)) {
              originalMaterialsRef.current.set(mesh, mesh.material)
            }
            // Create highlight material
            const highlightMaterial = new THREE.MeshStandardMaterial({
              color: color,
              emissive: color,
              emissiveIntensity: 0.3,
              roughness: 0.4,
              metalness: 0.1,
              side: THREE.DoubleSide,
            })
            mesh.material = highlightMaterial
          }
        })
      },
      clearHighlights: () => {
        originalMaterialsRef.current.forEach((originalMaterial, mesh) => {
          mesh.material = originalMaterial
        })
        originalMaterialsRef.current.clear()
      },
      setElementsOpacity: (expressIds: number[], opacity: number) => {
        const expressIdSet = new Set(expressIds)
        allMeshesRef.current.forEach(mesh => {
          if (expressIdSet.has(mesh.userData.expressID)) {
            // Use mesh.visible for true hide/show (opacity 0 = hidden, > 0 = visible)
            mesh.visible = opacity > 0
            // Also set material opacity for partial transparency
            if (opacity > 0 && opacity < 1) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => {
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    mat.transparent = true
                    mat.opacity = opacity
                  }
                })
              } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.transparent = true
                mesh.material.opacity = opacity
              }
            }
          }
        })
      },
      resetElementsAppearance: () => {
        // Clear highlights first
        originalMaterialsRef.current.forEach((originalMaterial, mesh) => {
          mesh.material = originalMaterial
        })
        originalMaterialsRef.current.clear()
        // Reset visibility and opacity for all meshes
        allMeshesRef.current.forEach(mesh => {
          mesh.visible = true  // Make all meshes visible again
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.opacity = 1
                mat.transparent = false
              }
            })
          } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.opacity = 1
            mesh.material.transparent = false
          }
        })
      },
      getAllMeshExpressIds: () => {
        return allMeshesRef.current
          .filter(mesh => mesh.userData.expressID !== undefined)
          .map(mesh => mesh.userData.expressID as number)
      },
      hideAllMeshes: () => {
        allMeshesRef.current.forEach(mesh => {
          mesh.visible = false
        })
      },
      showAllMeshes: () => {
        allMeshesRef.current.forEach(mesh => {
          mesh.visible = true
        })
      }
    }))

    useEffect(() => {
      if (!containerRef.current) return

      const container = containerRef.current
      let mounted = true

      // Scene setup
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x1a1f2e)

      // Camera
      const camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.1,
        20000
      )
      camera.position.set(100, 80, 100)

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      })
      renderer.setSize(container.clientWidth, container.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.0
      container.appendChild(renderer.domElement)

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.1
      controls.screenSpacePanning = true
      controls.minDistance = 1
      controls.maxDistance = 10000
      controls.maxPolarAngle = Math.PI * 0.95
      controls.rotateSpeed = 0.6
      controls.panSpeed = 1.0
      controls.zoomSpeed = 1.5

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
      scene.add(ambientLight)

      const sunLight = new THREE.DirectionalLight(0xffffff, 1.2)
      sunLight.position.set(200, 400, 200)
      sunLight.castShadow = true
      sunLight.shadow.mapSize.width = 4096
      sunLight.shadow.mapSize.height = 4096
      sunLight.shadow.camera.near = 1
      sunLight.shadow.camera.far = 2000
      sunLight.shadow.camera.left = -500
      sunLight.shadow.camera.right = 500
      sunLight.shadow.camera.top = 500
      sunLight.shadow.camera.bottom = -500
      sunLight.shadow.bias = -0.0001
      scene.add(sunLight)

      const fillLight = new THREE.DirectionalLight(0x8ec8ff, 0.4)
      fillLight.position.set(-150, 100, -150)
      scene.add(fillLight)

      const backLight = new THREE.DirectionalLight(0xfff0e0, 0.3)
      backLight.position.set(0, 50, -200)
      scene.add(backLight)

      const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x404050, 0.4)
      scene.add(hemiLight)

      // Ground
      const groundGeometry = new THREE.PlaneGeometry(3000, 3000)
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x252a38,
        roughness: 0.9,
        metalness: 0.0
      })
      const ground = new THREE.Mesh(groundGeometry, groundMaterial)
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -1
      ground.receiveShadow = true
      scene.add(ground)

      // Grid
      const gridHelper = new THREE.GridHelper(1000, 100, 0x3b82f6, 0x2d3748)
      gridHelper.position.y = -0.5
      scene.add(gridHelper)

      // Store refs
      sceneRef.current = { scene, camera, renderer, controls, animationId: 0 }

      // Animation loop
      const animate = () => {
        if (!mounted) return
        sceneRef.current!.animationId = requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
      }
      animate()

      // Handle resize
      const handleResize = () => {
        if (!container || !sceneRef.current) return
        const { camera, renderer } = sceneRef.current
        camera.aspect = container.clientWidth / container.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(container.clientWidth, container.clientHeight)
      }
      window.addEventListener('resize', handleResize)

      // Load IFC
      const loadIFC = async () => {
        try {
          setLoading(true)
          setProgress(5)
          setLoadingStage('Initializing WebIFC...')

          const ifcApi = new WebIFC.IfcAPI()
          ifcApi.SetWasmPath('/')
          await ifcApi.Init()

          if (!mounted) return
          setProgress(10)
          setLoadingStage('Downloading IFC file...')

          const response = await fetch(`/api/files/${fileId}/download`)
          if (!response.ok) throw new Error('Failed to fetch IFC file')

          const buffer = await response.arrayBuffer()
          const data = new Uint8Array(buffer)

          if (!mounted) return
          setProgress(25)
          setLoadingStage('Parsing IFC structure...')

          const modelID = ifcApi.OpenModel(data)

          // Extract storeys with elevations
          setProgress(30)
          setLoadingStage('Extracting storey information...')

          const storeyDataMap = new Map<number, { name: string; elevation: number }>()
          const storeyLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)

          for (let i = 0; i < storeyLines.size(); i++) {
            const storeyId = storeyLines.get(i)
            const storey = ifcApi.GetLine(modelID, storeyId)
            const name = storey.Name?.value || storey.LongName?.value || `Level ${i + 1}`
            const elevation = storey.Elevation?.value || 0
            storeyDataMap.set(storeyId, { name, elevation })
          }

          // Get element-to-storey mapping via spatial relationships
          const elementStoreyMap = new Map<number, number>()

          try {
            const relContained = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)
            for (let i = 0; i < relContained.size(); i++) {
              const relId = relContained.get(i)
              const rel = ifcApi.GetLine(modelID, relId)

              const relatingStructure = rel.RelatingStructure
              if (!relatingStructure) continue

              const structureId = relatingStructure.value
              if (!storeyDataMap.has(structureId)) continue

              const relatedElements = rel.RelatedElements
              if (!relatedElements) continue

              for (const elem of relatedElements) {
                if (elem?.value) {
                  elementStoreyMap.set(elem.value, structureId)
                }
              }
            }
          } catch (e) {
            console.warn('Could not extract spatial relationships:', e)
          }

          // Sort storeys by elevation
          const sortedStoreys = Array.from(storeyDataMap.entries())
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => a.elevation - b.elevation)

          // Create storey data structures
          const storeyDataList: StoreyData[] = sortedStoreys.map(storey => ({
            name: storey.name,
            elevation: storey.elevation,
            meshes: [],
            visible: true
          }))

          // Create storey ID to index lookup
          const storeyIdToIndex = new Map<number, number>()
          sortedStoreys.forEach((s, idx) => storeyIdToIndex.set(s.id, idx))

          // Calculate elevation ranges for Z-based fallback
          const elevationRanges = sortedStoreys.map((storey, index) => {
            const nextStorey = sortedStoreys[index + 1]
            return {
              minZ: storey.elevation - 500, // Buffer below
              maxZ: nextStorey ? nextStorey.elevation - 1 : storey.elevation + 100000
            }
          })

          if (!mounted) return
          setProgress(40)
          setLoadingStage('Loading 3D geometry...')

          const flatMeshes = ifcApi.LoadAllGeometry(modelID)
          const totalMeshes = flatMeshes.size()

          setProgress(50)
          setLoadingStage(`Processing ${totalMeshes} objects...`)

          // Track all meshes for those without storey assignment
          const unassignedMeshes: THREE.Mesh[] = []

          // Process all meshes
          for (let i = 0; i < totalMeshes; i++) {
            if (!mounted) return

            if (i % 50 === 0) {
              const meshProgress = 50 + Math.floor((i / totalMeshes) * 40)
              setProgress(meshProgress)
            }

            const flatMesh = flatMeshes.get(i)
            const expressID = flatMesh.expressID
            const placedGeometries = flatMesh.geometries

            // Get element type for coloring
            let elementType = 'DEFAULT'
            try {
              const element = ifcApi.GetLine(modelID, expressID)
              if (element) {
                const typeName = element.constructor?.name || ''
                elementType = typeName.toUpperCase()
              }
            } catch {
              // Ignore
            }

            // Check if element has a storey mapping
            const mappedStoreyId = elementStoreyMap.get(expressID)
            let storeyIndex: number | null = null
            if (mappedStoreyId !== undefined) {
              storeyIndex = storeyIdToIndex.get(mappedStoreyId) ?? null
            }

            // Process each geometry
            for (let j = 0; j < placedGeometries.size(); j++) {
              const placedGeometry = placedGeometries.get(j)
              const geometry = ifcApi.GetGeometry(modelID, placedGeometry.geometryExpressID)

              const verts = ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
              const indices = ifcApi.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())

              if (verts.length === 0 || indices.length === 0) continue

              const bufferGeometry = new THREE.BufferGeometry()

              // Extract positions and normals (interleaved: x,y,z,nx,ny,nz)
              const positions: number[] = []
              const normals: number[] = []
              for (let k = 0; k < verts.length; k += 6) {
                positions.push(verts[k], verts[k + 1], verts[k + 2])
                normals.push(verts[k + 3], verts[k + 4], verts[k + 5])
              }

              bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
              bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
              bufferGeometry.setIndex(Array.from(indices))

              // Get color
              const typeColor = IFC_COLORS[elementType] || IFC_COLORS.DEFAULT
              const pgColor = placedGeometry.color

              let meshColor: THREE.Color
              if (pgColor.x !== 1 || pgColor.y !== 1 || pgColor.z !== 1) {
                meshColor = new THREE.Color(pgColor.x, pgColor.y, pgColor.z)
              } else {
                meshColor = new THREE.Color(typeColor)
              }

              const material = new THREE.MeshStandardMaterial({
                color: meshColor,
                roughness: 0.65,
                metalness: 0.05,
                side: THREE.DoubleSide,
                transparent: pgColor.w < 0.99,
                opacity: Math.max(pgColor.w, 0.4),
              })

              const mesh = new THREE.Mesh(bufferGeometry, material)

              // Apply transformation
              const matrix = new THREE.Matrix4()
              matrix.fromArray(placedGeometry.flatTransformation)
              mesh.applyMatrix4(matrix)

              mesh.castShadow = true
              mesh.receiveShadow = true
              mesh.userData.expressID = expressID
              mesh.userData.type = elementType

              // Assign to storey
              let assignedIndex = storeyIndex

              // If no spatial mapping, use Z-height fallback
              if (assignedIndex === null && storeyDataList.length > 0) {
                bufferGeometry.computeBoundingBox()
                if (bufferGeometry.boundingBox) {
                  const worldBox = bufferGeometry.boundingBox.clone()
                  worldBox.applyMatrix4(matrix)
                  const centerZ = (worldBox.min.z + worldBox.max.z) / 2

                  // Find which elevation range this falls into
                  for (let s = 0; s < elevationRanges.length; s++) {
                    if (centerZ >= elevationRanges[s].minZ && centerZ < elevationRanges[s].maxZ) {
                      assignedIndex = s
                      break
                    }
                  }
                }
              }

              if (assignedIndex !== null && assignedIndex >= 0 && assignedIndex < storeyDataList.length) {
                storeyDataList[assignedIndex].meshes.push(mesh)
                mesh.userData.storeyName = storeyDataList[assignedIndex].name
              } else {
                unassignedMeshes.push(mesh)
                mesh.userData.storeyName = 'Unassigned'
              }

              scene.add(mesh)
              allMeshesRef.current.push(mesh)
            }
          }

          // Add unassigned storey if there are meshes
          if (unassignedMeshes.length > 0) {
            storeyDataList.push({
              name: 'Unassigned',
              elevation: -Infinity,
              meshes: unassignedMeshes,
              visible: true
            })
          }

          storeysRef.current = storeyDataList

          // Log results
          console.log('=== IFC Viewer Storey Distribution ===')
          storeyDataList.forEach((s, i) => {
            console.log(`  ${i}: "${s.name}" (elev: ${s.elevation === -Infinity ? 'N/A' : s.elevation.toFixed(1)}) - ${s.meshes.length} meshes`)
          })
          console.log(`  Total meshes: ${storeyDataList.reduce((sum, s) => sum + s.meshes.length, 0)}`)

          if (!mounted) return
          setProgress(95)
          setLoadingStage('Centering view...')

          // Center camera on model
          const box = new THREE.Box3()
          scene.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.Mesh && obj !== ground && obj.userData.expressID) {
              box.expandByObject(obj)
            }
          })

          if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3())
            const size = box.getSize(new THREE.Vector3())
            const maxDim = Math.max(size.x, size.y, size.z)

            camera.position.set(
              center.x + maxDim * 0.7,
              center.y + maxDim * 0.5,
              center.z + maxDim * 0.7
            )
            controls.target.copy(center)

            // Adjust ground
            ground.position.y = box.min.y - 1
            gridHelper.position.y = box.min.y - 0.5

            // Adjust sun light
            sunLight.position.set(
              center.x + maxDim,
              center.y + maxDim * 1.5,
              center.z + maxDim
            )
            sunLight.target.position.copy(center)
            scene.add(sunLight.target)
          }

          controls.update()

          // Notify parent of storey info
          if (onStoreysLoaded) {
            const storeyInfoList: StoreyInfo[] = storeyDataList.map(s => ({
              name: s.name,
              elevation: s.elevation,
              meshCount: s.meshes.length,
              visible: s.visible
            }))
            onStoreysLoaded(storeyInfoList)
          }

          ifcApi.CloseModel(modelID)

          setProgress(100)
          setLoadingStage('Complete!')
          setLoading(false)

        } catch (err) {
          console.error('Error loading IFC:', err)
          if (mounted) {
            setError(err instanceof Error ? err.message : 'Failed to load IFC model')
            setLoading(false)
          }
        }
      }

      loadIFC()

      return () => {
        mounted = false
        window.removeEventListener('resize', handleResize)
        if (sceneRef.current) {
          cancelAnimationFrame(sceneRef.current.animationId)
          sceneRef.current.renderer.dispose()
          sceneRef.current.controls.dispose()
        }
        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }
      }
    }, [fileId, onStoreysLoaded])

    // View controls
    const resetView = useCallback(() => {
      if (!sceneRef.current) return
      const { camera, controls, scene } = sceneRef.current

      const box = new THREE.Box3()
      scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh && obj.userData.expressID && obj.visible) {
          box.expandByObject(obj)
        }
      })

      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)

        camera.position.set(
          center.x + maxDim * 0.7,
          center.y + maxDim * 0.5,
          center.z + maxDim * 0.7
        )
        controls.target.copy(center)
        controls.update()
      }
    }, [])

    const setTopView = useCallback(() => {
      if (!sceneRef.current) return
      const { camera, controls, scene } = sceneRef.current

      const box = new THREE.Box3()
      scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh && obj.userData.expressID && obj.visible) {
          box.expandByObject(obj)
        }
      })

      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        camera.position.set(center.x, center.y + Math.max(size.x, size.z) * 1.5, center.z + 0.01)
        controls.target.copy(center)
        controls.update()
      }
    }, [])

    const setFrontView = useCallback(() => {
      if (!sceneRef.current) return
      const { camera, controls, scene } = sceneRef.current

      const box = new THREE.Box3()
      scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh && obj.userData.expressID && obj.visible) {
          box.expandByObject(obj)
        }
      })

      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        camera.position.set(center.x, center.y, center.z + Math.max(size.x, size.y) * 1.5)
        controls.target.copy(center)
        controls.update()
      }
    }, [])

    const setSideView = useCallback(() => {
      if (!sceneRef.current) return
      const { camera, controls, scene } = sceneRef.current

      const box = new THREE.Box3()
      scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh && obj.userData.expressID && obj.visible) {
          box.expandByObject(obj)
        }
      })

      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        camera.position.set(center.x + Math.max(size.y, size.z) * 1.5, center.y, center.z)
        controls.target.copy(center)
        controls.update()
      }
    }, [])

    return (
      <div className="relative w-full h-full">
        <div ref={containerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-secondary-950/95 flex flex-col items-center justify-center z-10">
            <LoadingSpinner size="xl" />
            <p className="text-secondary-200 mt-4 font-semibold text-lg">Loading 3D Model</p>
            <p className="text-secondary-400 text-sm mt-1">{fileName}</p>
            <p className="text-primary-400 text-sm mt-3">{loadingStage}</p>
            <div className="w-72 mt-4 bg-secondary-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-secondary-500 text-xs mt-2">{progress}%</p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 bg-secondary-950/95 flex flex-col items-center justify-center z-10">
            <div className="w-16 h-16 rounded-full bg-danger-500/20 flex items-center justify-center mb-4">
              <span className="text-danger-400 text-3xl font-bold">!</span>
            </div>
            <p className="text-secondary-200 font-semibold text-lg">Failed to load model</p>
            <p className="text-secondary-500 text-sm mt-2 max-w-md text-center">{error}</p>
          </div>
        )}

        {/* Controls toolbar */}
        {!loading && !error && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 rounded-xl bg-secondary-900/95 backdrop-blur-sm border border-secondary-700 shadow-lg z-10">
            <button
              onClick={resetView}
              className="px-3 py-2 text-sm font-medium text-secondary-300 hover:text-white hover:bg-secondary-700 rounded-lg transition-all"
            >
              Fit View
            </button>
            <div className="w-px h-6 bg-secondary-700" />
            <button
              onClick={setTopView}
              className="px-3 py-2 text-sm font-medium text-secondary-300 hover:text-white hover:bg-secondary-700 rounded-lg transition-all"
            >
              Top
            </button>
            <button
              onClick={setFrontView}
              className="px-3 py-2 text-sm font-medium text-secondary-300 hover:text-white hover:bg-secondary-700 rounded-lg transition-all"
            >
              Front
            </button>
            <button
              onClick={setSideView}
              className="px-3 py-2 text-sm font-medium text-secondary-300 hover:text-white hover:bg-secondary-700 rounded-lg transition-all"
            >
              Side
            </button>
          </div>
        )}

        {/* Instructions */}
        {!loading && !error && (
          <div className="absolute top-4 right-4 text-xs text-secondary-400 bg-secondary-900/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-secondary-800">
            <p><span className="text-secondary-500">Rotate:</span> Left Click + Drag</p>
            <p><span className="text-secondary-500">Pan:</span> Right Click + Drag</p>
            <p><span className="text-secondary-500">Zoom:</span> Scroll</p>
          </div>
        )}
      </div>
    )
  }
)

IFCViewer.displayName = 'IFCViewer'
