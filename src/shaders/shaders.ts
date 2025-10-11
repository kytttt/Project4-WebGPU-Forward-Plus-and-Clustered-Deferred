// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

const shaderConstants = Object.freeze({
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,
    moveLightsWorkgroupSize: 128,
    lightRadius: '2.f'
});

export const constants = {
    get bindGroup_scene() { return shaderConstants.bindGroup_scene as number; },
    get bindGroup_model() { return shaderConstants.bindGroup_model as number; },
    get bindGroup_material() { return shaderConstants.bindGroup_material as number; },

    get moveLightsWorkgroupSize() { return shaderConstants.moveLightsWorkgroupSize as number; },
    get lightRadius() { return shaderConstants.lightRadius as string; }
};

// =================================

function evalShaderRaw(raw: string) {
    return raw.replace(/\$\{(\w+)\}/g, (_m, key: string) => {
        const val = (shaderConstants as Record<string, string | number>)[key];
        if (val === undefined) {
            throw new Error(`Unknown shader constant: ${key}`);
        }
        return String(val);
    });
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
