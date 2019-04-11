/****************************************************************************
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
  worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
  not use Cocos Creator software for developing other software or tools that's
  used for developing games. You are not granted to publish, distribute,
  sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

import { Asset } from '../../assets/asset';
import { ccclass, property } from '../../core/data/class-decorator';
import { Vec3 } from '../../core/value-types';
import { ccenum } from '../../core/value-types/enum';
import { GFXBuffer } from '../../gfx/buffer';
import { GFXBufferUsageBit, GFXFormat, GFXMemoryUsageBit, GFXPrimitiveMode } from '../../gfx/define';
import { GFXDevice } from '../../gfx/device';
import { IGFXAttribute } from '../../gfx/input-assembler';
import { IBufferRange } from './utils/buffer-range';
import { vec3 } from '../../core/vmath';

export enum IndexUnit {
    /**
     * 8 bits unsigned integer.
     */
    UINT8,

    /**
     * 8 bits unsigned integer.
     */
    UINT16,

    /**
     * 8 bits unsigned integer.
     */
    UINT32,
}

ccenum(IndexUnit);

function getIndexUnitStride (indexUnit: IndexUnit) {
    switch (indexUnit) {
        case IndexUnit.UINT8: return 1;
        case IndexUnit.UINT16: return 2;
        case IndexUnit.UINT32: return 4;
    }
    return 1;
}

function getIndexUnitCtor (indexUnit: IndexUnit) {
    switch (indexUnit) {
        case IndexUnit.UINT8: return Uint8Array;
        case IndexUnit.UINT16: return Uint16Array;
        case IndexUnit.UINT32: return Uint32Array;
    }
    return Uint8Array;
}

export interface IVertexBundle {
    /**
     * The data range of this bundle.
     * This range of data is essentially mapped to a GPU vertex buffer.
     */
    data: IBufferRange;

    /**
     * This bundle's vertices count.
     */
    verticesCount: number;

    /**
     * Attributes.
     */
    attributes: IGFXAttribute[];
}

/**
 * A primitive is a geometry constituted with a list of
 * same topology primitive graphic(such as points, lines or triangles).
 */
export interface IPrimitive {
    /**
     * The vertex bundles that this primitive use.
     */
    vertexBundelIndices: number[];

    /**
     * This primitive's topology.
     */
    primitiveMode: GFXPrimitiveMode;

    indices?: {
        /**
         * The indices data range of this primitive.
         */
        range: IBufferRange;

        /**
         * The type of this primitive's indices.
         */
        indexUnit: IndexUnit;
    };

    /**
     * Geometric info for raycast purposes.
     */
    geometricInfo?: {
        doubleSided?: boolean;
        range: IBufferRange;
    };
}

/**
 * Describes a mesh.
 */
export interface IMeshStruct {
    /**
     * The vertex bundles that this mesh owns.
     */
    vertexBundles: IVertexBundle[];

    /**
     * The primitives that this mesh owns.
     */
    primitives: IPrimitive[];

    /**
     * The min position of this mesh's vertices.
     */
    minPosition?: Vec3;

    /**
     * The max position of this mesh's vertices.
     */
    maxPosition?: Vec3;
}

// for raycast purpose
export type IBArray = Uint8Array | Uint16Array | Uint32Array;
export interface IGeometricInfo {
    positions: Float32Array;
    indices: IBArray;
    doubleSided?: boolean;
}

export interface IRenderingSubmesh {
    vertexBuffers: GFXBuffer[];
    indexBuffer: GFXBuffer | null;
    indirectBuffer?: GFXBuffer;
    attributes: IGFXAttribute[];
    primitiveMode: GFXPrimitiveMode;
    geometricInfo?: IGeometricInfo;
}

export class RenderingMesh {
    public constructor (
        private _subMeshes: IRenderingSubmesh[],
        private _vertexBuffers: GFXBuffer[],
        private _indexBuffers: GFXBuffer[]) {

    }

    public get subMeshes (): IRenderingSubmesh[] {
        return this._subMeshes;
    }

    public get subMeshCount () {
        return this._subMeshes.length;
    }

    public getSubmesh (index: number) {
        return this._subMeshes[index];
    }

    public destroy () {
        this._vertexBuffers.forEach((vertexBuffer) => {
            vertexBuffer.destroy();
        });
        this._vertexBuffers.length = 0;

        this._indexBuffers.forEach((indexBuffer) => {
            indexBuffer.destroy();
        });
        this._indexBuffers.length = 0;
        this._subMeshes.length = 0;
    }
}

@ccclass('cc.Mesh')
export class Mesh extends Asset {

    get _nativeAsset () {
        return this._data;
    }

    set _nativeAsset (value) {
        this._data = value;
    }

    /**
     * Submeshes count of this mesh.
     * @deprecated Use this.renderingMesh.subMeshCount instead.
     */
    get subMeshCount () {
        const renderingMesh = this.renderingMesh;
        return renderingMesh ? renderingMesh.subMeshCount : 0;
    }

    /**
     * Min position of this mesh.
     * @deprecated Use this.struct.minPosition instead.
     */
    get minPosition () {
        return this.struct.minPosition;
    }

    /**
     * Max position of this mesh.
     * @deprecated Use this.struct.maxPosition instead.
     */
    get maxPosition () {
        return this.struct.maxPosition;
    }

    get struct () {
        return this._struct;
    }

    get data () {
        return this._data;
    }

    @property
    private _struct: IMeshStruct = {
        vertexBundles: [],
        primitives: [],
    };

    private _data: Uint8Array | null = null;

    private _initialized = false;

    private _renderingMesh: RenderingMesh | null = null;

    constructor () {
        super();
    }

    /**
     * Destory this mesh and immediately release its GPU resources.
     */
    public destroy () {
        this._tryDestroyRenderingMesh();
        return super.destroy();
    }

    /**
     * Assigns new mesh struct to this.
     * @param struct The new mesh's struct.
     * @param data The new mesh's data.
     */
    public assign (struct: IMeshStruct, data: Uint8Array) {
        this._struct = struct;
        this._data = data;
        this._tryDestroyRenderingMesh();
    }

    /**
     * Gets the rendering mesh.
     */
    public get renderingMesh (): RenderingMesh {
        this._deferredInit();
        return this._renderingMesh!;
    }

    /**
     * !#en
     * Gets the specified submesh.
     * @param index Index of the specified submesh.
     * @deprecated Use this.renderingMesh.getSubmesh(index).inputAssembler instead.
     */
    public getSubMesh (index: number): IRenderingSubmesh {
        return this.renderingMesh.getSubmesh(index);
    }

    public merge (mesh: Mesh, validate?: boolean): boolean {
        if (validate !== undefined && validate) {
            if (!this.validateMergingMesh(mesh)) {
                return false;
            }
        } // if

        // merge vertex bundles
        for (let i = 0; i < this._struct.vertexBundles.length; ++i) {
            const bundle = this._struct.vertexBundles[i];
            const dstBundle = mesh._struct.vertexBundles[i];
            bundle.data.length += dstBundle.data.length;
            bundle.verticesCount += dstBundle.verticesCount;
        }

        // merge primitives
        for (let i = 0; i < this._struct.primitives.length; ++i) {
            const prim = this._struct.primitives[i];
            const dstPrim = mesh._struct.primitives[i];

            if (prim.indices && dstPrim.indices) {
                prim.indices.range.length += dstPrim.indices.range.length;
            }
        }

        // merget bounding box
        if (this._struct.maxPosition && mesh._struct.maxPosition) {
            this._struct.maxPosition.x = Math.max(this._struct.maxPosition.x, mesh._struct.maxPosition.x);
            this._struct.maxPosition.y = Math.max(this._struct.maxPosition.y, mesh._struct.maxPosition.y);
            this._struct.maxPosition.z = Math.max(this._struct.maxPosition.z, mesh._struct.maxPosition.z);
        }
        if (this._struct.minPosition && mesh._struct.minPosition) {
            this._struct.minPosition.x = Math.min(this._struct.minPosition.x, mesh._struct.minPosition.x);
            this._struct.minPosition.y = Math.min(this._struct.minPosition.y, mesh._struct.minPosition.y);
            this._struct.minPosition.z = Math.min(this._struct.minPosition.z, mesh._struct.minPosition.z);
        }

        return true;
    }

    public validateMergingMesh (mesh: Mesh) {
        // validate vertex bundles
        if (this._struct.vertexBundles.length !== mesh._struct.vertexBundles.length) {
            return false;
        }

        for (let i = 0; i < this._struct.vertexBundles.length; ++i) {
            const bundle = this._struct.vertexBundles[i];
            const dstBundle = mesh._struct.vertexBundles[i];

            if (bundle.attributes.length !== dstBundle.attributes.length) {
                return false;
            }
            for (let j = 0; j < bundle.attributes.length; ++j) {
                if (bundle.attributes[j].format !== dstBundle.attributes[j].format) {
                    return false;
                }
            }
        }

        // validate primitives
        if (this._struct.primitives.length !== mesh._struct.primitives.length) {
            return false;
        }
        for (let i = 0; i < this._struct.primitives.length; ++i) {
            const prim = this._struct.primitives[i];
            const dstPrim = mesh._struct.primitives[i];
            if (prim.vertexBundelIndices.length !== dstPrim.vertexBundelIndices.length) {
                return false;
            }
            for (let j = 0; j < prim.vertexBundelIndices.length; ++j) {
                if (prim.vertexBundelIndices[j] !== dstPrim.vertexBundelIndices[j]) {
                    return false;
                }
            }
            if (prim.primitiveMode !== dstPrim.primitiveMode) {
                return false;
            }
            if (prim.indices && dstPrim.indices) {
                if (prim.indices.indexUnit !== dstPrim.indices.indexUnit) {
                    return false;
                }
            }
        }

        return true;
    }

    private _deferredInit () {
        if (this._initialized) {
            return;
        }

        this._initialized = true;

        if (this._data === null) {
            return;
        }

        const buffer = this._data.buffer;
        const gfxDevice: GFXDevice = cc.director.root.device;
        const vertexBuffers = this._createVertexBuffers(gfxDevice, buffer);
        const indexBuffers: GFXBuffer[] = [];
        const submeshes: IRenderingSubmesh[] = [];

        for (const prim of this._struct.primitives) {
            if (prim.vertexBundelIndices.length === 0) {
                continue;
            }

            let indexBuffer: GFXBuffer | null = null;
            let ib: any = null;
            if (prim.indices) {
                const indices = prim.indices;

                indexBuffer = gfxDevice.createBuffer({
                    usage: GFXBufferUsageBit.INDEX | GFXBufferUsageBit.TRANSFER_DST,
                    memUsage: GFXMemoryUsageBit.HOST | GFXMemoryUsageBit.DEVICE,
                    size: indices.range.length,
                    stride: getIndexUnitStride(indices.indexUnit),
                });
                indexBuffers.push(indexBuffer);

                ib = new (getIndexUnitCtor(indices.indexUnit))(buffer, indices.range.offset,
                    indices.range.length / getIndexUnitStride(indices.indexUnit));
                indexBuffer.update(ib);
            }

            const vbReference = prim.vertexBundelIndices.map((i) => vertexBuffers[i]);

            let gfxAttributes: IGFXAttribute[] = [];
            if (prim.vertexBundelIndices.length > 0) {
                const idx = prim.vertexBundelIndices[0];
                const vertexBundle = this._struct.vertexBundles[idx];
                gfxAttributes = vertexBundle.attributes;
            }

            const geomInfo: any = prim.geometricInfo;
            if (geomInfo) {
                geomInfo.indices = ib;
                geomInfo.positions = new Float32Array(buffer, geomInfo.range.offset, geomInfo.range.length / 4);
            }

            const subMesh: IRenderingSubmesh = {
                primitiveMode: prim.primitiveMode,
                vertexBuffers: vbReference,
                indexBuffer,
                attributes: gfxAttributes,
                geometricInfo: geomInfo,
            };

            submeshes.push(subMesh);
        }

        this._renderingMesh = new RenderingMesh(submeshes, vertexBuffers, indexBuffers);
    }

    private _createVertexBuffers (gfxDevice: GFXDevice, data: ArrayBuffer): GFXBuffer[] {
        return this._struct.vertexBundles.map((vertexBundle) => {
            const vertexBuffer = gfxDevice.createBuffer({
                usage: GFXBufferUsageBit.VERTEX | GFXBufferUsageBit.TRANSFER_DST,
                memUsage: GFXMemoryUsageBit.HOST | GFXMemoryUsageBit.DEVICE,
                size: vertexBundle.data.length,
                stride: vertexBundle.data.length / vertexBundle.verticesCount,
            });
            vertexBuffer.update(new Uint8Array(data, vertexBundle.data.offset, vertexBundle.data.length));
            return vertexBuffer;
        });
    }

    private _tryDestroyRenderingMesh () {
        if (this._renderingMesh) {
            this._renderingMesh.destroy();
            this._renderingMesh = null;
            this._initialized = false;
        }
    }
}
cc.Mesh = Mesh;