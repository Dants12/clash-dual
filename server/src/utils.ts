export const now = () => Date.now();
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
