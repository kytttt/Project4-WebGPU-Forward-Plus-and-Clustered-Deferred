// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.


@group(0) @binding(0) var<uniform> clustering: ClusteringUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterLightCount: array<u32>;
@group(0) @binding(3) var<storage, read_write> clusterLightIndices: array<u32>; 

fn clusterIndex(x: u32, y: u32, z: u32, dims: vec3u) -> u32 {
    return (z * dims.y + y) * dims.x + x;
}

fn unproject_to_view(ndc: vec3f) -> vec3f {
    let clip = vec4f(ndc, 1.0);
    let p = clustering.invProjMat * clip;
    return p.xyz / p.w;
}


fn viewZ_to_ndc(viewZ: f32) -> f32 {
    let clip = clustering.projMat * vec4f(0.0, 0.0, viewZ, 1.0);
    return clip.z / clip.w;
}

fn sphere_aabb_intersect(center: vec3f, radius: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    var d2 = 0.0;
    for (var i = 0; i < 3; i++) {
        var c = center[i];
        if (c < aabbMin[i]) {
            let s = aabbMin[i] - c;
            d2 += s * s;
        } else if (c > aabbMax[i]) {
            let s = c - aabbMax[i];
            d2 += s * s;
        }
    }
    return d2 <= radius * radius;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let clustersX = clustering.clusterDims_maxLights.x;
    let clustersY = clustering.clusterDims_maxLights.y;
    let clustersZ = clustering.clusterDims_maxLights.z;
    let maxLightsPerCluster = clustering.clusterDims_maxLights.w;

    let numClusters = clustersX * clustersY * clustersZ;
    let idx = gid.x;
    if (idx >= numClusters) {
        return;
    }


    let z = idx / (clustersX * clustersY);
    let remain = idx - z * clustersX * clustersY;
    let y = remain / clustersX;
    let x = remain - y * clustersX;

    
    let x0_ndc = 2.0 * f32(x) / f32(clustersX) - 1.0;
    let x1_ndc = 2.0 * f32(x + 1u) / f32(clustersX) - 1.0;

    let y0_ndc = 1.0 - 2.0 * f32(y + 1u) / f32(clustersY);
    let y1_ndc = 1.0 - 2.0 * f32(y) / f32(clustersY);

    let nearDist = clustering.screenSize_near_far.z;
    let farDist  = clustering.screenSize_near_far.w;
    let ratio = farDist / nearDist;

    let z0_dist = nearDist * pow(ratio, f32(z) / f32(clustersZ));
    let z1_dist = nearDist * pow(ratio, f32(z + 1u) / f32(clustersZ));

    let z0_view = -z0_dist;
    let z1_view = -z1_dist;
    let z0_ndc = viewZ_to_ndc(z0_view);
    let z1_ndc = viewZ_to_ndc(z1_view);

    let v000 = unproject_to_view(vec3f(x0_ndc, y0_ndc, z0_ndc));
    let v010 = unproject_to_view(vec3f(x0_ndc, y1_ndc, z0_ndc));
    let v100 = unproject_to_view(vec3f(x1_ndc, y0_ndc, z0_ndc));
    let v110 = unproject_to_view(vec3f(x1_ndc, y1_ndc, z0_ndc));

    let v001 = unproject_to_view(vec3f(x0_ndc, y0_ndc, z1_ndc));
    let v011 = unproject_to_view(vec3f(x0_ndc, y1_ndc, z1_ndc));
    let v101 = unproject_to_view(vec3f(x1_ndc, y0_ndc, z1_ndc));
    let v111 = unproject_to_view(vec3f(x1_ndc, y1_ndc, z1_ndc));

    var aabbMin = min(min(v000, v010), min(v100, v110));
    aabbMin = min(aabbMin, min(min(v001, v011), min(v101, v111)));
    var aabbMax = max(max(v000, v010), max(v100, v110));
    aabbMax = max(aabbMax, max(max(v001, v011), max(v101, v111)));

    var count: u32 = 0u;
    let startIdx = idx * maxLightsPerCluster;

    let V = clustering.viewMat;

    for (var li: u32 = 0u; li < lightSet.numLights; li = li + 1u) {
        let L = lightSet.lights[li];
        
        let lp = V * vec4f(L.pos, 1.0);
        let centerVS = lp.xyz / lp.w;

        let radius = ${lightRadius};
        
        if (sphere_aabb_intersect(centerVS, radius, aabbMin, aabbMax)) {
            if (count < maxLightsPerCluster) {
                clusterLightIndices[startIdx + count] = li;
                count = count + 1u;
            }
        }
    }

    clusterLightCount[idx] = count;
}