// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

// Clustered Deferred fullscreen fragment shader
// Reads from the G-buffer and performs clustered lighting similar to Forward+.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> clustering: ClusteringUniforms;
@group(${bindGroup_scene}) @binding(3) var<storage, read> clusterLightCount: array<u32>;
@group(${bindGroup_scene}) @binding(4) var<storage, read> clusterLightIndices: array<u32>;

@group(${bindGroup_material}) @binding(0) var gPosition: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var gNormal: texture_2d<f32>;
@group(${bindGroup_material}) @binding(2) var gAlbedo: texture_2d<f32>;
@group(${bindGroup_material}) @binding(3) var gSampler: sampler;

struct FragmentInput {
    @builtin(position) fragCoord: vec4f
};

fn clusterIndex(x: u32, y: u32, z: u32, dims: vec3u) -> u32 {
    return (z * dims.y + y) * dims.x + x;
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {

    let screenW = clustering.screenSize_near_far.x;
    let screenH = clustering.screenSize_near_far.y;

    let uv = in.fragCoord.xy / vec2f(screenW, screenH);

    let pos = textureSampleLevel(gPosition, gSampler, uv, 0.0).xyz;
    let N = normalize(textureSampleLevel(gNormal,  gSampler, uv, 0.0).xyz);
    let albedo = textureSampleLevel(gAlbedo, gSampler, uv, 0.0);

    let dims = vec3u(clustering.clusterDims_maxLights.xyz);
    let maxLightsPerCluster = clustering.clusterDims_maxLights.w;

    let eps = 1e-6;
    let ndcX = clamp((in.fragCoord.x / screenW) * 2.0 - 1.0, -1.0, 1.0 - eps);
    let ndcY = clamp(1.0 - (in.fragCoord.y / screenH) * 2.0, -1.0, 1.0 - eps);

    let cx = u32(clamp(floor((ndcX + 1.0) * 0.5 * f32(dims.x)), 0.0, f32(dims.x - 1u)));
    let cy = u32(clamp(floor((1.0 - (ndcY + 1.0) * 0.5) * f32(dims.y)), 0.0, f32(dims.y - 1u)));

    let V = clustering.viewMat;
    let vp = V * vec4f(pos, 1.0);
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
    for (var i: u32 = 0u; i < count; i = i + 1u) {
        let li = clusterLightIndices[startIdx + i];
        let light = lightSet.lights[li];
        totalLightContrib += calculateLightContrib(light, pos, N);
    }

    let finalColor = albedo.rgb * totalLightContrib;
    return vec4f(finalColor, 1.0);
}