// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

// Clustered Deferred G-buffer fragment shader
// Stores world-space position, world-space normal, and base color (albedo).

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,  
    @location(1) nor: vec3f,   
    @location(2) uv: vec2f     
};

struct GBufferOut {
    @location(0) gPosition: vec4f, // world-space position.xyz
    @location(1) gNormal: vec4f,   // world-space normal.xyz (normalized)
    @location(2) gAlbedo: vec4f    // base color (diffuse)
};

@fragment
fn main(in: FragmentInput) -> GBufferOut {
    let albedo = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (albedo.a < 0.5f) {
        discard;
    }

    var out: GBufferOut;
    out.gPosition = vec4f(in.pos, 1.0);
    out.gNormal = vec4f(normalize(in.nor), 0.0);
    out.gAlbedo = albedo;
    return out;
}