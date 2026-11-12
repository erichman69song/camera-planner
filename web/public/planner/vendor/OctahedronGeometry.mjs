import { BufferGeometry, Float32BufferAttribute } from '../three-bridge.mjs';
/** Eight triangular faces for the center transform handle. */
export class OctahedronGeometry extends BufferGeometry {
  constructor(radius = 1) {
    super();
    const vertices=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const faces=[[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,2,5],[1,5,3],[1,3,4],[1,4,2]];
    this.setAttribute('position',new Float32BufferAttribute(faces.flatMap(face=>face.flatMap(i=>vertices[i].map(v=>v*radius))),3));
    this.computeVertexNormals();
  }
}
