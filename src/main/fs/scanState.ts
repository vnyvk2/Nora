export let scanState: 'IDLE' | 'SCANNING' | 'CANCELLING' = 'IDLE';

export const setScanState = (state: 'IDLE' | 'SCANNING' | 'CANCELLING') => {
  scanState = state;
};

export const getScanState = () => scanState;
