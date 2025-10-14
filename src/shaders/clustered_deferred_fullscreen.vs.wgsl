// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.


struct VSOut {
    @builtin(position) pos: vec4f
};

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VSOut {

    var pos = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0)
    );

    var out: VSOut;
    out.pos = vec4f(pos[vertexIndex], 0.0, 1.0);
    return out;
}