import * as THREE from 'three'

/**
 * Computes the dominant orientation angle of a set of meshes in the XZ plane
 * using Principal Component Analysis (PCA) on their vertices.
 */
export function computeDominantAngle(meshes: THREE.Mesh[]): number {
    if (meshes.length === 0) return 0

    let count = 0
    let sumX = 0
    let sumZ = 0

    // 1. Calculate Centroid
    // Sampling strategy: Use centroid of each mesh weighted by bounding box size?
    // Or sample vertices? Using all vertices might be slow for large models.
    // Let's use mesh positions (if many small objects) or sample vertices from large objects.
    // Better: Use bounding box centers of all meshes for a fast approximation.
    // If the model is a single large mesh, we must use vertices.

    // Strategy: Sample up to 1000 random vertices across all meshes to approximate distribution
    const samples: { x: number, z: number }[] = []
    const maxSamples = 2000

    // Total vertex count estimate
    let totalVerts = 0
    for (const mesh of meshes) {
        if (mesh.geometry) {
            totalVerts += mesh.geometry.attributes.position.count
        }
    }

    const stride = Math.max(1, Math.floor(totalVerts / maxSamples))

    for (const mesh of meshes) {
        if (!mesh.geometry) continue

        // Ensure world matrix is updated
        mesh.updateMatrixWorld()
        const matrix = mesh.matrixWorld
        const posAttr = mesh.geometry.attributes.position

        for (let i = 0; i < posAttr.count; i += stride) {
            const v = new THREE.Vector3()
            v.fromBufferAttribute(posAttr, i)
            v.applyMatrix4(matrix)

            samples.push({ x: v.x, z: v.z })
            sumX += v.x
            sumZ += v.z
            count++
            if (count >= maxSamples) break
        }
        if (count >= maxSamples) break
    }

    if (count < 2) return 0

    const centerX = sumX / count
    const centerZ = sumZ / count

    // 2. Compute Covariance Matrix components
    let xx = 0
    let zz = 0
    let xz = 0

    for (const p of samples) {
        const dx = p.x - centerX
        const dz = p.z - centerZ
        xx += dx * dx
        zz += dz * dz
        xz += dx * dz
    }

    xx /= count
    zz /= count
    xz /= count

    // 3. Eigen decomposition of 2x2 symmetric matrix
    // [ xx  xz ]
    // [ xz  zz ]

    // We want the angle of the dominant eigenvector
    // Angle = 0.5 * atan2(2*xz, xx - zz)
    // This gives angle of the major axis relative to X axis

    const angle = 0.5 * Math.atan2(2 * xz, xx - zz)

    // We want to align the grid to this, but we often want to snap to nearest 90 degrees
    // if it's close, OR we just return the raw angle.
    // The user asked to "derive rotation angle... and rotate overlay".
    // Let's return the raw angle.

    return angle
}
