/**
 * IFC 3D Viewer Component using Three.js and web-ifc
 * Supports storey-based visibility toggling and plan/3D viewing modes.
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as WebIFC from 'web-ifc'
import { computeDominantAngle } from '../lib/geometry'
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
  highlightElements: (expressIds: number[], color?: number, opacity?: number) => void
  clearHighlights: () => void
  setElementsOpacity: (expressIds: number[], opacity: number) => void
  resetElementsAppearance: () => void
  getAllMeshExpressIds: () => number[]
  hideAllMeshes: () => void
  showAllMeshes: () => void
  showOnlyElements: (expressIds: number[]) => void  // Show only specified elements, hide all others
}

interface GridAxis {
  tag: string
  direction: string
  position: number
}

interface IFCViewerProps {
  fileId: string
  fileName: string
  onStoreysLoaded?: (storeys: StoreyInfo[]) => void
  gridData?: {
    u_axes: GridAxis[]
    v_axes: GridAxis[]
  }
  // View mode: '3d' = normal perspective orbit, 'plan' = top-down plan view
  mode?: '3d' | 'plan'
  // Opacity for the 2D grid overlay (0 = hidden, 1 = solid)
  gridOverlayOpacity?: number
  // Hover from left grid into viewer (row = U axis index, col = V axis index)
  hoverCell?: { row: number; col: number } | null
  // When viewer overlay is hovered, report back to parent
  onOverlayHover?: (cell: { row: number; col: number } | null) => void
  // Draft selection rectangle (live drag) in grid coordinates
  draftSelection?: { uStart: number | string; uEnd: number | string; vStart: number | string; vEnd: number | string } | null
  // Applied selection rectangle in grid coordinates
  appliedSelection?: { uStart: number | string; uEnd: number | string; vStart: number | string; vEnd: number | string } | null
  // Opacity for the model elements (to make grid more visible)
  modelOpacity?: number
}

export const IFCViewer = forwardRef<IFCViewerHandle, IFCViewerProps>(
  ({
    fileId,
    fileName,
    onStoreysLoaded,
    gridData,
    mode = '3d',
    gridOverlayOpacity = 0.8,
    hoverCell,
    onOverlayHover,
    draftSelection,
    appliedSelection,
    modelOpacity = 1,
  }, ref) => {
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
    const overlayRef = useRef<THREE.Group | null>(null)
    const overlayHitPlaneRef = useRef<THREE.Mesh | null>(null)
    const overlayBoundsRef = useRef<THREE.Box3 | null>(null)
    const overlayCountsRef = useRef<{ rows: number; cols: number }>({ rows: 0, cols: 0 })
    const overlayRotationRef = useRef<number>(0)
    const modelOpacityRef = useRef<number>(1)
    const modelOffsetRef = useRef<THREE.Vector3 | null>(null)

    // --- Interaction & Updates ---

    // Helper to update a selection mesh geometry/visibility
    const updateSelectionMesh = useCallback((
      meshName: string,
      selection: { uStart: number | string; uEnd: number | string; vStart: number | string; vEnd: number | string } | null | undefined
    ) => {
      if (!overlayRef.current || !overlayBoundsRef.current || !gridData) return

      const mesh = overlayRef.current.getObjectByName(meshName) as THREE.Mesh
      if (!mesh) return

      if (!selection) {
        mesh.visible = false
        return
      }

      // Sort axes by position ascending for correct spatial mapping
      const uAxes = [...gridData.u_axes].sort((a, b) => a.position - b.position)
      const vAxes = [...gridData.v_axes].sort((a, b) => a.position - b.position)

      // Find start/end axis tags in the sorted arrays
      const findAxis = (axes: typeof uAxes, tag: string | number) => {
        if (typeof tag === 'number') return tag < axes.length ? tag : -1
        return axes.findIndex(a => a.tag === tag)
      }

      const uIdxStart = findAxis(uAxes, selection.uStart)
      const uIdxEnd = findAxis(uAxes, selection.uEnd)
      const vIdxStart = findAxis(vAxes, selection.vStart)
      const vIdxEnd = findAxis(vAxes, selection.vEnd)

      const uMin = Math.min(uIdxStart, uIdxEnd)
      const uMax = Math.max(uIdxStart, uIdxEnd)
      const vMin = Math.min(vIdxStart, vIdxEnd)
      const vMax = Math.max(vIdxStart, vIdxEnd)

      if (uMin < 0 || vMin < 0) {
        mesh.visible = false
        return
      }

      // Map axis positions to overlay local coordinates using model offset
      const bounds = overlayBoundsRef.current
      const mOff = modelOffsetRef.current
      if (!mOff) {
        mesh.visible = false
        return
      }
      const width = bounds.max.x - bounds.min.x
      const depth = bounds.max.z - bounds.min.z
      const halfW = width / 2
      const startX = -halfW
      const halfD = depth / 2
      const startZ = -halfD

      // U-axes map to X using actual IFC coordinates + model offset
      const selUStartPos = uAxes[uMin].position
      const selUEndPos = uAxes[uMax].position
      const x1 = startX + (selUStartPos + mOff.x)
      const x2 = startX + (selUEndPos + mOff.x)
      const selWidth = Math.abs(x2 - x1) || width / uAxes.length
      const centerX = (x1 + x2) / 2

      // V-axes map to Z using actual IFC coordinates + model offset
      const selVStartPos = vAxes[vMin].position
      const selVEndPos = vAxes[vMax].position
      const z1 = startZ + (selVStartPos + mOff.z)
      const z2 = startZ + (selVEndPos + mOff.z)
      const selDepth = Math.abs(z2 - z1) || depth / vAxes.length
      const centerZ = (z1 + z2) / 2

      mesh.position.set(centerX, 0, centerZ)
      mesh.scale.set(selWidth, selDepth, 1)
      mesh.visible = true

    }, [gridData])

    // Update Draft Selection
    useEffect(() => {
      updateSelectionMesh('draft-selection', draftSelection)
    }, [draftSelection, updateSelectionMesh])

    // Update Applied Selection
    useEffect(() => {
      updateSelectionMesh('applied-selection', appliedSelection)
    }, [appliedSelection, updateSelectionMesh])

    // Update Hover Selection
    useEffect(() => {
      // Convert numeric row/col indices to axis tags for correct positioning.
      // Row index is in descending-sorted U-axes (matching grid table),
      // Col index is in ascending-sorted V-axes (matching grid table).
      if (hoverCell && gridData) {
        const uAxesDesc = [...gridData.u_axes].sort((a, b) => b.position - a.position)
        const vAxesAsc = [...gridData.v_axes].sort((a, b) => a.position - b.position)

        const uTag = uAxesDesc[hoverCell.row]?.tag
        const vTag = vAxesAsc[hoverCell.col]?.tag

        if (uTag && vTag) {
          updateSelectionMesh('hover-selection', {
            uStart: uTag, uEnd: uTag,
            vStart: vTag, vEnd: vTag
          })
        } else {
          updateSelectionMesh('hover-selection', null)
        }
      } else {
        updateSelectionMesh('hover-selection', null)
      }
    }, [hoverCell, updateSelectionMesh, gridData])


    // Raycaster for Hover detection
    useEffect(() => {
      if (!containerRef.current || !onOverlayHover || !sceneRef.current) return

      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()

      const onMouseMove = (event: MouseEvent) => {
        if (!containerRef.current || !overlayHitPlaneRef.current || !overlayBoundsRef.current || !gridData) return

        const rect = containerRef.current.getBoundingClientRect()
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        raycaster.setFromCamera(mouse, sceneRef.current!.camera)

        const intersects = raycaster.intersectObject(overlayHitPlaneRef.current)
        if (intersects.length > 0) {
          const pt = intersects[0].point

          if (!overlayRef.current) return

          const localPt = overlayRef.current.worldToLocal(pt.clone())

          const bounds = overlayBoundsRef.current
          const width = bounds.max.x - bounds.min.x
          const depth = bounds.max.z - bounds.min.z
          const halfW = width / 2
          const halfD = depth / 2

          // Normalized 0..1 coordinates
          const nx = (localPt.x + halfW) / width
          const nz = (localPt.z + halfD) / depth

          if (nx >= 0 && nx <= 1 && nz >= 0 && nz <= 1 && modelOffsetRef.current) {
            const mOff = modelOffsetRef.current

            // Convert overlay local coordinates to IFC coordinates
            const ifcX = localPt.x + halfW - mOff.x
            const ifcY = localPt.z + halfD - mOff.z

            // Sort axes by position ascending for spatial lookup
            const uAxesSorted = [...gridData.u_axes].sort((a, b) => a.position - b.position)
            const vAxesSorted = [...gridData.v_axes].sort((a, b) => a.position - b.position)

            // Find nearest U-axis cell by IFC X position
            let uCellIdx = 0
            for (let i = 0; i < uAxesSorted.length - 1; i++) {
              const mid = (uAxesSorted[i].position + uAxesSorted[i + 1].position) / 2
              if (ifcX > mid) uCellIdx = i + 1
            }

            // Find nearest V-axis cell by IFC Y position
            let vCellIdx = 0
            for (let i = 0; i < vAxesSorted.length - 1; i++) {
              const mid = (vAxesSorted[i].position + vAxesSorted[i + 1].position) / 2
              if (ifcY > mid) vCellIdx = i + 1
            }

            // Convert ascending U index to descending index (matching grid table row order)
            const uDescIdx = uAxesSorted.length - 1 - uCellIdx

            onOverlayHover({ row: uDescIdx, col: vCellIdx })
            return
          }
        }

        onOverlayHover(null)
      }

      containerRef.current.addEventListener('mousemove', onMouseMove)
      return () => {
        containerRef.current?.removeEventListener('mousemove', onMouseMove)
      }
    }, [onOverlayHover, gridData])

    // Expose methods to parent component
    const viewerHandle = {
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
      highlightElements: (expressIds: number[], color: number = 0x00ff00, opacity: number = 1) => {
        const expressIdSet = new Set(expressIds)
        allMeshesRef.current.forEach(mesh => {
          if (expressIdSet.has(mesh.userData.expressID)) {
            // Store original material if not already stored
            if (!originalMaterialsRef.current.has(mesh)) {
              originalMaterialsRef.current.set(mesh, mesh.material)
            }
            // Make the mesh visible
            mesh.visible = true
            // Create highlight material with specified opacity
            const highlightMaterial = new THREE.MeshStandardMaterial({
              color: color,
              emissive: color,
              emissiveIntensity: opacity < 1 ? 0.1 : 0.3,
              roughness: 0.4,
              metalness: 0.1,
              side: THREE.DoubleSide,
              transparent: opacity < 1,
              opacity: opacity,
              depthTest: true, // Highlights should be occluded by other geometry usually, or false if overlay-like
              depthWrite: true
            })
            mesh.material = highlightMaterial
          }
        })
      },
      clearHighlights: () => {
        // ... (existing clearHighlights)
        originalMaterialsRef.current.forEach((originalMaterial, mesh) => {
          mesh.material = originalMaterial
        })
        originalMaterialsRef.current.clear()

        // Re-apply global model opacity if needed
        if (modelOpacityRef.current < 1) {
          viewerHandle.setElementsOpacity(allMeshesRef.current.map(m => m.userData.expressID), modelOpacityRef.current)
        }
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
            } else if (opacity === 1) { // Reset to opaque if opacity is 1
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => {
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    mat.transparent = false
                    mat.opacity = 1
                  }
                })
              } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.transparent = false
                mesh.material.opacity = 1
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
      },
      showOnlyElements: (expressIds: number[]) => {
        // Show only the specified elements, hide all others
        const expressIdSet = new Set(expressIds)
        allMeshesRef.current.forEach(mesh => {
          mesh.visible = expressIdSet.has(mesh.userData.expressID)
        })
      }
    }

    useImperativeHandle(ref, () => viewerHandle)

    // Effect to handle modelOpacity prop changes
    useEffect(() => {
      if (modelOpacity !== undefined && Math.abs(modelOpacity - modelOpacityRef.current) > 0.01) {
        modelOpacityRef.current = modelOpacity
        // Apply to all meshes
        if (allMeshesRef.current.length > 0) {
          viewerHandle.setElementsOpacity(
            allMeshesRef.current.map(m => m.userData.expressID),
            modelOpacity
          )
        }
      }
    }, [modelOpacity])


    // Mount/unmount logging to verify the viewer is not being remounted unnecessarily
    useEffect(() => {
      console.log('[IFCViewer] MOUNT')
      return () => {
        console.log('[IFCViewer] UNMOUNT')
      }
    }, [])

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
              // Note: web-ifc's flatTransformation includes the full placement hierarchy
              // (local → parent → global transforms), so this should correctly position
              // all elements including reinforcing bars (IfcReinforcingBar) that are
              // nested within other elements. If bars appear "floating", check:
              // 1. IFC file has correct IfcLocalPlacement chain
              // 2. Parent element placement is properly defined
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
          setLoadingStage('Aligning model to grid...')

          // Calculate model bounding box
          const box = new THREE.Box3()
          scene.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.Mesh && obj !== ground && obj.userData.expressID) {
              box.expandByObject(obj)
            }
          })

          if (!box.isEmpty()) {
            // Calculate model offset to align to grid origin (0,0)
            // We want the minimum X and Z (or X and Y depending on up-axis) to be at origin
            const modelOffset = new THREE.Vector3()
            modelOffset.x = -box.min.x
            modelOffset.y = 0  // Keep Y as-is (vertical)
            modelOffset.z = -box.min.z
            modelOffsetRef.current = modelOffset.clone()

            // Apply offset to all meshes (except ground)
            scene.traverse((obj: THREE.Object3D) => {
              if (obj instanceof THREE.Mesh && obj !== ground && obj.userData.expressID) {
                obj.position.add(modelOffset)
              }
            })

            // Recalculate bounding box after offset
            const newBox = new THREE.Box3()
            scene.traverse((obj: THREE.Object3D) => {
              if (obj instanceof THREE.Mesh && obj !== ground && obj.userData.expressID) {
                newBox.expandByObject(obj)
              }
            })

            const size = newBox.getSize(new THREE.Vector3())
            const maxDim = Math.max(size.x, size.y, size.z)
            const center = newBox.getCenter(new THREE.Vector3())

            // Position camera to frame model + surrounding grid area
            // Offset camera to show model and some grid space around it
            const gridPadding = maxDim * 0.3  // 30% padding for grid visibility
            camera.position.set(
              center.x + maxDim * 0.7 + gridPadding,
              center.y + maxDim * 0.5,
              center.z + maxDim * 0.7 + gridPadding
            )
            controls.target.copy(center)

            // Adjust ground to align with model bottom
            ground.position.y = newBox.min.y - 1
            gridHelper.position.y = newBox.min.y - 0.5

            // Adjust sun light
            sunLight.position.set(
              center.x + maxDim + gridPadding,
              center.y + maxDim * 1.5,
              center.z + maxDim + gridPadding
            )
            sunLight.target.position.copy(center)
            scene.add(sunLight.target)

            // Store bounds for overlay/grid mapping
            overlayBoundsRef.current = newBox.clone()
            overlayCountsRef.current = {
              rows: gridData?.u_axes?.length || 0,
              cols: gridData?.v_axes?.length || 0,
            }

            // Compute dominant orientation
            const rotationAngle = computeDominantAngle(allMeshesRef.current)
            overlayRotationRef.current = rotationAngle
            console.log('Detected model rotation:', (rotationAngle * 180 / Math.PI).toFixed(1), 'deg')

            // --- GRID OVERLAY IMPLEMENTATION ---
            const buildOverlay = (
              bounds: THREE.Box3,
              rows: number,
              cols: number,
              scene: THREE.Scene
            ) => {
              if (overlayRef.current) {
                scene.remove(overlayRef.current)
                overlayRef.current = null
              }

              const overlayGroup = new THREE.Group()
              const center = bounds.getCenter(new THREE.Vector3())

              // We rotate around the CENTER of the bounding box
              overlayGroup.position.copy(center)
              // Lift Y slightly above bounds min
              overlayGroup.position.y = bounds.min.y - 0.5
              // Keep grid aligned with world axes (no rotation)

              // We need to construct geometry centered at (0,0,0) in the group
              const width = bounds.max.x - bounds.min.x
              const depth = bounds.max.z - bounds.min.z
              const halfW = width / 2
              const halfD = depth / 2

              const startX = -halfW
              const startZ = -halfD
              const endX = halfW
              const endZ = halfD

              // Visibility Settings (Always on top)
              const depthConfig = { depthTest: false, depthWrite: false }
              const renderOrderGrid = 999
              const renderOrderSel = 1000

              // Background Plane (faint)
              const bgPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(width + 2, depth + 2),
                new THREE.MeshBasicMaterial({
                  color: 0x000000,
                  transparent: true,
                  opacity: 0.1,
                  side: THREE.DoubleSide,
                  ...depthConfig
                })
              )
              bgPlane.rotation.x = -Math.PI / 2
              bgPlane.position.y = -0.1 // below lines
              bgPlane.renderOrder = renderOrderGrid - 1
              overlayGroup.add(bgPlane)

              // 1. Grid Lines - Dual Pass for Contrast
              // Pass 1: Thick dark lines
              // Pass 2: Thin bright lines

              const positionsMain: number[] = []
              const positionsMajor: number[] = []

              // Sort axes by position ascending for correct spatial mapping
              const uAxesSorted = gridData?.u_axes ? [...gridData.u_axes].sort((a, b) => a.position - b.position) : []
              const vAxesSorted = gridData?.v_axes ? [...gridData.v_axes].sort((a, b) => a.position - b.position) : []

              // Reuse logic for even/explicit
              const useExplicit = uAxesSorted.length > 0 && vAxesSorted.length > 0

              if (useExplicit && modelOffsetRef.current) {
                // Use model offset to place grid lines at their actual IFC coordinates,
                // converted to overlay local space (centered at model center).
                const mOff = modelOffsetRef.current

                // U-axis lines: vertical lines at actual IFC X positions
                uAxesSorted.forEach((axis, i) => {
                  const x = startX + (axis.position + mOff.x)
                  if (x < startX - 1 || x > endX + 1) return
                  const isMajor = i % 5 === 0
                  if (isMajor) {
                    positionsMajor.push(x, 0, startZ, x, 0, endZ)
                  } else {
                    positionsMain.push(x, 0, startZ, x, 0, endZ)
                  }
                })
                // V-axis lines: horizontal lines at actual IFC Y positions
                vAxesSorted.forEach((axis, i) => {
                  const z = startZ + (axis.position + mOff.z)
                  if (z < startZ - 1 || z > endZ + 1) return
                  const isMajor = i % 5 === 0
                  if (isMajor) {
                    positionsMajor.push(startX, 0, z, endX, 0, z)
                  } else {
                    positionsMain.push(startX, 0, z, endX, 0, z)
                  }
                })
              } else {
                // Fallback
                for (let i = 0; i <= cols; i++) {
                  const x = startX + (i / Math.max(1, cols)) * width
                  if (i % 5 === 0) positionsMajor.push(x, 0, startZ, x, 0, endZ)
                  else positionsMain.push(x, 0, startZ, x, 0, endZ)
                }
                for (let i = 0; i <= rows; i++) {
                  const z = startZ + (i / Math.max(1, rows)) * depth
                  if (i % 5 === 0) positionsMajor.push(startX, 0, z, endX, 0, z)
                  else positionsMain.push(startX, 0, z, endX, 0, z)
                }
              }

              // Create Geometries
              const geomMain = new THREE.BufferGeometry()
              geomMain.setAttribute('position', new THREE.Float32BufferAttribute(positionsMain, 3))

              const geomMajor = new THREE.BufferGeometry()
              geomMajor.setAttribute('position', new THREE.Float32BufferAttribute(positionsMajor, 3))

              // Thick Dark Bottom Layer (Halo)
              const matDark = new THREE.LineBasicMaterial({
                color: 0x000000,
                opacity: 0.3,
                transparent: true,
                linewidth: 3, // Note: WebGL limitation often ignores linewidth > 1 on Windows
                ...depthConfig
              })
              const linesMainDark = new THREE.LineSegments(geomMain, matDark)
              linesMainDark.renderOrder = renderOrderGrid
              linesMainDark.position.y = -0.02
              overlayGroup.add(linesMainDark)

              const linesMajorDark = new THREE.LineSegments(geomMajor, matDark)
              linesMajorDark.renderOrder = renderOrderGrid
              linesMajorDark.position.y = -0.02
              overlayGroup.add(linesMajorDark)

              // Thin Bright Top Layer
              const matBright = new THREE.LineBasicMaterial({
                color: 0x60a5fa, // bright blue
                opacity: 0.6,
                transparent: true,
                ...depthConfig
              })
              const matMajorBright = new THREE.LineBasicMaterial({
                color: 0x93c5fd, // lighter blue
                opacity: 0.8,
                transparent: true,
                ...depthConfig
              })

              const linesMain = new THREE.LineSegments(geomMain, matBright)
              linesMain.renderOrder = renderOrderGrid
              overlayGroup.add(linesMain)

              const linesMajor = new THREE.LineSegments(geomMajor, matMajorBright)
              linesMajor.renderOrder = renderOrderGrid
              overlayGroup.add(linesMajor)

              // Selection Meshes (re-used logic but adjusted for local centered coords)
              const createSelMesh = (name: string, color: number) => {
                const m = new THREE.Mesh(
                  new THREE.PlaneGeometry(1, 1),
                  new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.4,
                    side: THREE.DoubleSide,
                    ...depthConfig
                  })
                )
                m.rotation.x = -Math.PI / 2
                m.visible = false
                m.name = name
                m.renderOrder = renderOrderSel
                return m
              }

              overlayGroup.add(createSelMesh('draft-selection', 0x3b82f6))
              overlayGroup.add(createSelMesh('applied-selection', 0x22c55e))
              overlayGroup.add(createSelMesh('hover-selection', 0xffffff))

              // Hit Plane for Raycast (invisible)
              // Must assume SAME dimensions as grid
              const hitPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(width, depth),
                new THREE.MeshBasicMaterial({ visible: false })
              )
              hitPlane.rotation.x = -Math.PI / 2
              // Centered locally at 0,0,0
              overlayGroup.add(hitPlane)
              overlayHitPlaneRef.current = hitPlane

              // UX Markers: Origin and Axis Arrows
              // Origin is at minX, minZ (which is startX, startZ in local coords)
              // We want to show "Origin (A/Y1)" 
              // Create SVG or Sprite for text would be ideal, but for now simple arrows

              const originMarker = new THREE.Group()
              originMarker.position.set(startX, 0, startZ)

              const arrowLen = Math.min(width, depth) * 0.15
              const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), arrowLen, 0xef4444) // Red X = Cols
              const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), arrowLen, 0x3b82f6) // Blue Z = Rows

              // Custom heavy arrows? Standard helper is fine.
              // Add simple text sprites?
              // Implementing text sprite helper
              const createTextSprite = (text: string, color: string) => {
                const canvas = document.createElement('canvas')
                canvas.width = 256
                canvas.height = 64
                const ctx = canvas.getContext('2d')
                if (ctx) {
                  ctx.fillStyle = color
                  ctx.font = 'bold 32px monospace'
                  ctx.textAlign = 'left'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(text, 10, 32)
                }
                const tex = new THREE.CanvasTexture(canvas)
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, ...depthConfig }))
                sprite.scale.set(arrowLen, arrowLen * 0.25, 1)
                return sprite
              }

              const lblOrigin = createTextSprite("Origin (A/Y1)", "#ffffff")
              lblOrigin.position.set(0, 0, -arrowLen * 0.2)
              originMarker.add(lblOrigin)

              const lblCols = createTextSprite("Cols (Y) ->", "#ef4444")
              lblCols.position.set(arrowLen * 0.5, 0, -arrowLen * 0.1)
              originMarker.add(lblCols)

              const lblRows = createTextSprite("Rows (A) ->", "#3b82f6")
              lblRows.position.set(-arrowLen * 0.1, 0, arrowLen * 0.5)
              lblRows.rotation.z = -Math.PI / 2 // Sprites always face camera but we can rotate? No, sprites rotate in 2D.
              // We need 3D text or just position it along the axis. Sprite rotation is screen space.
              // Let's just place it.
              originMarker.add(lblRows)

              originMarker.add(arrowX)
              originMarker.add(arrowZ)

              overlayGroup.add(originMarker)

              scene.add(overlayGroup)
              overlayRef.current = overlayGroup
            }

            buildOverlay(newBox, overlayCountsRef.current.rows, overlayCountsRef.current.cols, scene)
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
      // IMPORTANT: only depend on fileId so the model is NOT reloaded when
      // selection state or callbacks in the parent component change.
    }, [fileId])

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

        // Frame model with padding for grid visibility
        const gridPadding = maxDim * 0.3
        camera.position.set(
          center.x + maxDim * 0.7 + gridPadding,
          center.y + maxDim * 0.5,
          center.z + maxDim * 0.7 + gridPadding
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

    // React to external view mode changes without reloading the model
    useEffect(() => {
      if (!sceneRef.current) return
      const { controls } = sceneRef.current

      if (mode === 'plan') {
        // Lock to a top-down view and disable rotation for intuitive plan navigation
        setTopView()
          ; (controls as any).enableRotate = false
        controls.enablePan = true
      } else {
        // Restore full 3D orbit controls
        ; (controls as any).enableRotate = true
        controls.enablePan = true
      }
    }, [mode, setTopView])

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

        {/* Grid Labels Overlay */}
        {!loading && !error && gridData && gridData.u_axes.length > 0 && gridData.v_axes.length > 0 && (
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{ opacity: gridOverlayOpacity }}
          >
            {/* U-axis labels (letters) on left side - sorted by position descending to match GridSelector */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2">
              {[...gridData.u_axes]
                .sort((a, b) => b.position - a.position)
                .map((axis, idx) => {
                  const totalAxes = gridData.u_axes.length
                  const positionPercent = totalAxes > 1 ? (idx / (totalAxes - 1)) * 100 : 50
                  return (
                    <div
                      key={`u-${axis.tag}`}
                      className="text-xs font-mono font-bold text-blue-400 bg-blue-900/80 px-1.5 py-0.5 rounded border border-blue-600/50 shadow-sm"
                      style={{
                        transform: `translateY(${positionPercent * 0.8 - 50}%)`,
                      }}
                    >
                      {axis.tag}
                    </div>
                  )
                })}
            </div>

            {/* V-axis labels (numbers) on bottom */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-row gap-2">
              {[...gridData.v_axes]
                .sort((a, b) => a.position - b.position)
                .map((axis, idx) => {
                  const totalAxes = gridData.v_axes.length
                  const positionPercent = totalAxes > 1 ? (idx / (totalAxes - 1)) * 100 : 50
                  return (
                    <div
                      key={`v-${axis.tag}`}
                      className="text-xs font-mono font-bold text-green-400 bg-green-900/80 px-1.5 py-0.5 rounded border border-green-600/50 shadow-sm"
                      style={{
                        transform: `translateX(${positionPercent * 0.8 - 50}%)`,
                      }}
                    >
                      {axis.tag}
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    )
  }
)

IFCViewer.displayName = 'IFCViewer'
