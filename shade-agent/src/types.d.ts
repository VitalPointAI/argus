declare module '@neardefi/shade-agent-cli' {
  export function agentInfo(): Promise<{
    agentId: string;
    teeType: string;
    timestamp: string;
  }>;
  
  export function agentAccountId(): Promise<string>;
  
  export function agentView(args: {
    contractId: string;
    methodName: string;
    args: object;
  }): Promise<any>;
  
  export function requestSignature(args: {
    path: string;
    payload: string;
    keyType: 'Ecdsa' | 'Ed25519';
  }): Promise<{
    signature: string;
    publicKey: string;
  }>;
}

declare module 'cors';
