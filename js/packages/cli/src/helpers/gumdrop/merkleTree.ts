import { keccak_256 } from 'js-sha3';
import log from 'loglevel';

export class MerkleTree {
  leafs: Array<Buffer>;
  leaf_flags: undefined | Array<number>;
  layers: Array<Array<Buffer>>;

  constructor(leafs: Array<Buffer>, leaf_flags?: Array<number>) {
    this.leafs = leafs.slice();
    this.leaf_flags = leaf_flags && leaf_flags.slice();
    this.layers = [];

    let hashes;
    if (!leaf_flags) {
      hashes = this.leafs.map((l) => MerkleTree.nodeHash(l, 0));
    } else {
      hashes = this.leafs.map((l, idx) => MerkleTree.nodeHash(l, leaf_flags[idx]));
    }
    while (hashes.length > 0) {
      log.debug('Hashes', this.layers.length, hashes);
      this.layers.push(hashes.slice());
      if (hashes.length === 1) break;
      hashes = hashes.reduce((acc, cur, idx, arr) => {
        if (idx % 2 === 0) {
          const nxt = arr[idx + 1];
          acc.push(MerkleTree.internalHash(cur, nxt));
        }
        return acc;
      }, Array<Buffer>());
    }
  }

  static nodeHash(data: Buffer, data_flags: number = 0x00): Buffer {
    return Buffer.from(keccak_256.digest([data_flags, ...data]));
  }


  static internalHash(
    first : Buffer,
    second : Buffer | undefined,
  ) : Buffer {
    if (!second) return first;
    const [fst, snd] = [first, second].sort(Buffer.compare)
    return Buffer.from(
      keccak_256.digest([0x01, ...fst, ...snd])
    );
  }

  getRoot() : Buffer {
    return this.layers[this.layers.length - 1][0];
  }

  getProof(idx : number) : Buffer[] {
    return this.layers.reduce((proof, layer) => {
      const sibling = idx ^ 1;
      if (sibling < layer.length) {
        proof.push(layer[sibling]);
      }

      idx = Math.floor(idx / 2);

      return proof;
    }, []);
  }

  getHexRoot(): string {
    return this.getRoot().toString("hex");
  }

  getHexProof(idx : number) : string[] {
    return this.getProof(idx).map((el) => el.toString("hex"));
  }

  verifyProof(
    idx : number,
    proof : Buffer[],
    root : Buffer
  ): boolean {
    let pair = MerkleTree.nodeHash(
      this.leafs[idx],
      this.leaf_flags ? this.leaf_flags[idx] : 0x00,
    );
    for (const item of proof) {
      pair = MerkleTree.internalHash(pair, item);
    }

    return pair.equals(root);
  }

  static verifyClaim(
    leaf : Buffer,
    proof : Buffer[],
    root : Buffer
  ): boolean {
    let pair = MerkleTree.nodeHash(leaf);
    for (const item of proof) {
      pair = MerkleTree.internalHash(pair, item);
    }

    return pair.equals(root);
  }

}
