// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).


@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> clustering: ClusteringUniforms;
@group(${bindGroup_scene}) @binding(3) var<storage, read> clusterLightCount: array<u32>;
@group(${bindGroup_scene}) @binding(4) var<storage, read> clusterLightIndices: array<u32>;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @builtin(position) fragCoord: vec4f
}

fn clusterIndex(x: u32, y: u32, z: u32, dims: vec3u) -> u32 {
    return (z * dims.y + y) * dims.x + x;
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let dims = vec3u(clustering.clusterDims_maxLights.xyz);
    let maxLightsPerCluster = clustering.clusterDims_maxLights.w;

    let screenW = clustering.screenSize_near_far.x;
    let screenH = clustering.screenSize_near_far.y;

    let eps = 1e-6;
    let ndcX = clamp((in.fragCoord.x / screenW) * 2.0 - 1.0, -1.0, 1.0 - eps);
    let ndcY = clamp(1.0 - (in.fragCoord.y / screenH) * 2.0, -1.0, 1.0 - eps);

    let cx = u32(clamp(floor((ndcX + 1.0) * 0.5 * f32(dims.x)), 0.0, f32(dims.x - 1u)));
    let cy = u32(clamp(floor((1.0 - (ndcY + 1.0) * 0.5) * f32(dims.y)), 0.0, f32(dims.y - 1u)));

    let V = clustering.viewMat;
    let vp = V * vec4f(in.pos, 1.0);
    let viewDist = -vp.z;

    let nearDist = clustering.screenSize_near_far.z;
    let farDist  = clustering.screenSize_near_far.w;
    let ratio = farDist / nearDist;


    let cz = u32(clamp(floor(log(viewDist / nearDist) / log(ratio) * f32(dims.z)),
                        0.0, f32(dims.z - 1u)));

    let cIdx = clusterIndex(cx, cy, cz, dims);

    let count = clusterLightCount[cIdx];
    let startIdx = cIdx * maxLightsPerCluster;

    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    let N = normalize(in.nor);

    for (var i: u32 = 0u; i < count; i = i + 1u) {
        let li = clusterLightIndices[startIdx + i];
        let light = lightSet.lights[li];
        totalLightContrib += calculateLightContrib(light, in.pos, N);
    }

    let finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4f(finalColor, 1.0);
}