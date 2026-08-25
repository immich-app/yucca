export const isInAppPath = (path: string) => path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
