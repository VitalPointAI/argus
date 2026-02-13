declare module 'snarkjs' {
  export const groth16: {
    fullProve: (
      input: Record<string, any>,
      wasmPath: string | Uint8Array,
      zkeyPath: string | Uint8Array
    ) => Promise<{ proof: any; publicSignals: string[] }>;
    
    verify: (
      vkey: any,
      publicSignals: string[],
      proof: any
    ) => Promise<boolean>;
    
    exportSolidityCallData: (
      proof: any,
      publicSignals: string[]
    ) => Promise<string>;
  };
  
  export const plonk: {
    fullProve: (
      input: Record<string, any>,
      wasmPath: string | Uint8Array,
      zkeyPath: string | Uint8Array
    ) => Promise<{ proof: any; publicSignals: string[] }>;
    
    verify: (
      vkey: any,
      publicSignals: string[],
      proof: any
    ) => Promise<boolean>;
  };
  
  export const powersOfTau: any;
  export const zKey: any;
  export const r1cs: any;
  export const wtns: any;
}
