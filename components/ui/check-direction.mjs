import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["app", "components/ui"];
const cssFiles = [];
for (const scanRoot of scanRoots) {
  const visit = (path) => {
    for (const name of readdirSync(path)) {
      const fullPath = join(path, name);
      if (statSync(fullPath).isDirectory()) visit(fullPath);
      else if (name.endsWith(".css")) cssFiles.push(fullPath);
    }
  };
  visit(join(root, scanRoot));
}

const physicalProperty = /(?:^|[;{\n])\s*(?:(?:margin|padding|inset|border(?:-(?:top|bottom))?|scroll-margin|scroll-padding)-(?:left|right)(?:-[\w-]+)?|(?:left|right))\s*:/i;
const failures = [];
for (const file of cssFiles) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (physicalProperty.test(line)) failures.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
  });
}

const checkFile = (path, pattern, message) => {
  const contents = readFileSync(join(root, path), "utf8");
  if (!pattern.test(contents)) failures.push(`${path}: ${message}`);
};
checkFile("app/layout.tsx", /<html[^>]*lang="ar"[^>]*dir="rtl"/, "patient root must start Arabic RTL");
for (const folder of ["doctor", "admin", "nurse", "staff"]) {
  checkFile(`app/${folder}/layout.tsx`, /dir="ltr"\s+lang="en"/, `${folder} subtree must be English LTR`);
}
checkFile("components/ui/primitives.tsx", /<bdi dir="auto"/, "user-provided text primitive must isolate auto-direction text");

if (failures.length) {
  console.error(`FAIL check:direction (${failures.length})`);
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS check:direction (${cssFiles.length} CSS files checked; direction wrappers and bidi isolation present)`);
}
