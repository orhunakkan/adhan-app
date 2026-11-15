// The one place that imports zod (ESLint-enforced). zod 4 builds a fast path
// with `new Function` when a schema is constructed, after probing whether eval
// is allowed. Our Content-Security-Policy forbids eval, so the probe would log
// a securitypolicyviolation on every start; jitless skips both. It must run
// before any schema is built, which is why every module imports z from here.
import { z } from 'zod';

z.config({ jitless: true });

export { z };
