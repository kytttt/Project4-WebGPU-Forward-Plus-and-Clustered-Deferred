import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { Camera } from '../stage/camera';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    sceneBindGroupLayout: GPUBindGroupLayout;
    sceneBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        this.sceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Forward+ scene bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // light set
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clustering
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // cluster counts
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // cluster indices
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneBindGroup = renderer.device.createBindGroup({
            label: "forward+ scene bind group",
            layout: this.sceneBindGroupLayout,
            entries: [
                { // camera
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                { // lights
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                { // clustering uniforms
                    binding: 2,
                    resource: { buffer: this.camera.clusteringUniformsBuffer }
                },
                { // cluster counts
                    binding: 3,
                    resource: { buffer: this.lights.clusterCountsBuffer }
                },
                { // cluster indices
                    binding: 4,
                    resource: { buffer: this.lights.clusterIndicesBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            label: "forward+ depth",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.pipeline = renderer.device.createRenderPipeline({
            label: "Forward+ pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "Forward+ pipeline layout",
                bindGroupLayouts: [
                    this.sceneBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Forward+ fragment shader",
                    code: shaders.forwardPlusFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        });
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting

        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder);

        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const renderPass = encoder.beginRenderPass({
            label: "Forward+ render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneBindGroup);

        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}