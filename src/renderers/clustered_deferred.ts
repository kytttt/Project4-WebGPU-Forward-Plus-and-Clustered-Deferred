import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    
    sceneBindGroupLayout: GPUBindGroupLayout;
    sceneBindGroup: GPUBindGroup;

    gPositionTex: GPUTexture;
    gNormalTex: GPUTexture;
    gAlbedoTex: GPUTexture;
    gPositionView: GPUTextureView;
    gNormalView: GPUTextureView;
    gAlbedoView: GPUTextureView;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gbufferPipeline: GPURenderPipeline;

    gbufferReadBindGroupLayout: GPUBindGroupLayout;
    gbufferReadBindGroup: GPUBindGroup;
    gbufferSampler: GPUSampler;
    fullscreenPipeline: GPURenderPipeline;

    fullscreenModelMatBuffer: GPUBuffer;
    fullscreenModelBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        this.sceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered-deferred scene bind group layout",
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
                { // cluster light counts
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // cluster light indices
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneBindGroup = renderer.device.createBindGroup({
            label: "clustered-deferred scene bind group",
            layout: this.sceneBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.camera.clusteringUniformsBuffer } },
                { binding: 3, resource: { buffer: this.lights.clusterCountsBuffer } },
                { binding: 4, resource: { buffer: this.lights.clusterIndicesBuffer } }
            ]
        });

        const size: GPUExtent3D = [renderer.canvas.width, renderer.canvas.height];

        this.gPositionTex = renderer.device.createTexture({
            label: "gPosition",
            size,
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gNormalTex = renderer.device.createTexture({
            label: "gNormal",
            size,
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gAlbedoTex = renderer.device.createTexture({
            label: "gAlbedo",
            size,
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.gPositionView = this.gPositionTex.createView();
        this.gNormalView = this.gNormalTex.createView();
        this.gAlbedoView = this.gAlbedoTex.createView();

        this.depthTexture = renderer.device.createTexture({
            label: "deferred depth",
            size,
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.gbufferPipeline = renderer.device.createRenderPipeline({
            label: "deferred gbuffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred gbuffer pipeline layout",
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
                    label: "deferred gbuffer fragment",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    { format: 'rgba16float' }, // position
                    { format: 'rgba16float' }, // normal
                    { format: 'rgba8unorm' }   // albedo
                ]
            }
        });

        this.gbufferSampler = renderer.device.createSampler({
            label: "gbuffer sampler",
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'nearest',
            minFilter: 'nearest',
            mipmapFilter: 'nearest'
        });

        this.gbufferReadBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer read bind group layout",
            entries: [
                { // gPosition 
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'unfilterable-float' }
                },
                { // gNormal
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'unfilterable-float' }
                },
                { // gAlbedo
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' }
                },
                { // sampler
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'non-filtering' }
                }
            ]
        });

        this.gbufferReadBindGroup = renderer.device.createBindGroup({
            label: "gbuffer read bind group",
            layout: this.gbufferReadBindGroupLayout,
            entries: [
                { binding: 0, resource: this.gPositionView },
                { binding: 1, resource: this.gNormalView },
                { binding: 2, resource: this.gAlbedoView },
                { binding: 3, resource: this.gbufferSampler }
            ]
        });

        this.fullscreenModelMatBuffer = renderer.device.createBuffer({
            label: "fullscreen model mat",
            size: 16 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(
            this.fullscreenModelMatBuffer,
            0,
            new Float32Array([
                1,0,0,0,
                0,1,0,0,
                0,0,1,0,
                0,0,0,1
            ])
        );
        this.fullscreenModelBindGroup = renderer.device.createBindGroup({
            label: "fullscreen model bind group",
            layout: renderer.modelBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.fullscreenModelMatBuffer } }
            ]
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "deferred fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    this.gbufferReadBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen vertex",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                buffers: []
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen fragment",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [{ format: renderer.canvasFormat }]
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder);

        const gbufferPass = encoder.beginRenderPass({
            label: "deferred gbuffer pass",
            colorAttachments: [
                {
                    view: this.gPositionView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gNormalView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gAlbedoView,
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

        gbufferPass.setPipeline(this.gbufferPipeline);
        gbufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneBindGroup);

        this.scene.iterate(node => {
            gbufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gbufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gbufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gbufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gbufferPass.drawIndexed(primitive.numIndices);
        });

        gbufferPass.end();

        const canvasView = renderer.context.getCurrentTexture().createView();
        const lightPass = encoder.beginRenderPass({
            label: "clustered-deferred fullscreen pass",
            colorAttachments: [
                {
                    view: canvasView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        lightPass.setPipeline(this.fullscreenPipeline);

        lightPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneBindGroup);

        lightPass.setBindGroup(shaders.constants.bindGroup_model, this.fullscreenModelBindGroup);

        lightPass.setBindGroup(shaders.constants.bindGroup_material, this.gbufferReadBindGroup);

        lightPass.draw(3);

        lightPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
