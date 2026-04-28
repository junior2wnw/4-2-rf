import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["README.md", "docs", "src", "tests", "scripts"];
const extensions = new Set([".md", ".ts", ".tsx", ".json"]);
const skippedDirs = new Set([".git", "dist", "node_modules", "coverage"]);

const sensitiveFingerprints = new Set([
  "ebf20cefc9169e0b714703d63d480c3e63c64a8535a13acf5a62ea66c5f0ea8c",
  "a80ad1fef6385dc49aadec56f85cf0366bc2a0cf6ac398da52e78d58879088c5",
  "f271a122bf4230c7c217b4cb8a66f8b4325b9c1821627dca16924fff32d6aa71",
  "e564b4081d7a9ea4b00dada53bdae70c99b87b6fce869f0c3dd4d2bfa1e53e1c",
  "b75af7ef6c4de2b99053f7f6c005d549e95be118be0eb500f1cf86f36ec8f324",
  "0650235331babae2f466a7f1ac5e0ec4fa581d2051dde9806207bdb46e43674b",
  "5a9cf40c7b2a1649529d903c56e64bdd3b2e82ed590cf9fe57f710d19403bb03",
  "04c5e757c18eeda9587e6904607687f7be221a432d1139e03999264fbdecd968",
  "d8390c279c52817decb811e78a0a862993a3dfb2d8ce396a2d44fab626df5507",
  "d8facfe0335de594ec199912bdc4755e5567b483c641e40cf57e2259b3b9160c",
  "83e92550e8e9b35089019a6b5d4460f57a2a03ed3b305a45eacab87749e3ff61",
  "288bada7936e9f95434f5f7d5eabe28fa3a8eb00355cf10427e99be2e38c93ff",
  "415e41a0f018452ac07609af4b9edb1cefc3de19042d6ae4e2aeb32857a72456",
  "dd0da78aa0d0e11e0d8f416fa47ddc8b92cd7a37a8241c1dc29070a45a60208c",
  "a8792157cb4f27fb949c035f45518c61e884bb86e6f420204379c2baa8beb66e",
  "244210e48437b6556980a70249a99369934a352429034cef9d7bd253b3bf2c01",
  "ab8e18ef4ebebeddc0b3152ce9c9006e14fc05242e3fc9ce32246ea6a9543074",
  "254bb97b57f12e1608fefc4517de768427b2fd6d2cffbbfcbc09f3c818198d5f",
  "6497e4b3d7bed16979a343a7db4efa6d57725529f5ac3cec45c1f08fabcbdafc",
  "682fbae20f3428bcec4c117c57bea18d438c4758d972909b41dbe22884e0d6b8",
  "efb7b4fa5b973a130179252ae699d4bc117c9744126803d723b003df0b5e7912",
  "7ce54cbababdd64826b853179905315617306f430e5154177ddbed04c282b7da",
  "ad936fcbed631fa67e05c3ea03953905221c9d46af0616b70badf105a966fb11"
]);

interface Finding {
  readonly file: string;
  readonly line: number;
}

const findings: Finding[] = [];

for (const root of roots) {
  scan(root);
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: language marker needs review`);
  }
  process.exitCode = 1;
}

function scan(path: string): void {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) {
    return;
  }

  if (stats.isDirectory()) {
    if (skippedDirs.has(path.split(/[\\/]/).at(-1) ?? "")) {
      return;
    }
    for (const item of readdirSync(path)) {
      scan(join(path, item));
    }
    return;
  }

  const extension = path.match(/\.[^.]+$/)?.[0] ?? "";
  if (!extensions.has(extension)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const token of tokens(line)) {
      if (sensitiveFingerprints.has(fingerprint(token))) {
        findings.push({
          file: relative(process.cwd(), path),
          line: index + 1
        });
        return;
      }
    }
  });
}

function tokens(line: string): string[] {
  const found = line.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return found.flatMap((token) => [token, ...token.split("-")]).filter(Boolean);
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
