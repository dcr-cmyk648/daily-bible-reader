import {lstat, realpath} from "node:fs/promises";
import path from "node:path";

// Check every existing component, including Windows junctions. A lexical prefix
// alone cannot confine a write through a redirected ancestor.
export async function assertCanonicalPath(base, target, {allowMissing = false} = {}) {
  base = path.resolve(base);
  target = path.resolve(target);
  const relative = path.relative(base, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw Error("Native path escaped its canonical root.");
  }
  let current = base;
  for (const part of ["", ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    const stat = await lstat(current).catch(error => {
      if (allowMissing && error.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) continue;
    if (stat.isSymbolicLink() || await realpath(current) !== current) {
      throw Error("Native path redirects outside its canonical layout.");
    }
  }
  return target;
}
