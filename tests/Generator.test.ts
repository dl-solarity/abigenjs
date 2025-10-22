import os from "os";
import path from "path";

import fs from "fs";
import fsp from "fs/promises";

import { expect } from "chai";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CommonJS modules loaded via createRequire in ESM context

const Generator = require("../src/abigen/generator.cjs");

const ERC20 = require("./mock_data/ERC20Mock.json");

const SBT = require("./mock_data/SBTMock.json");

function fileExistsSync(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

describe("Generator", function () {
  this.timeout(120000);

  const artifacts = [ERC20, SBT] as const;
  const abigenPath = path.resolve(__dirname, "../bin/abigen.wasm");
  let outDir: string;

  beforeEach(async () => {
    outDir = path.join(
      os.tmpdir(),
      `abigenjs-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    await fsp.mkdir(outDir, { recursive: true });
  });

  afterEach(async () => {
    if (fileExistsSync(outDir)) {
      await fsp.rm(outDir, { recursive: true, force: true });
    }
  });

  it("throws on unsupported abigen version", () => {
    expect(() => new Generator(outDir, "v3", abigenPath)).to.throw("Unsupported abigen version");
  });

  (["v1", "v2"] as const).forEach((version) => {
    it(`generates bindings without deploy (version ${version})`, async () => {
      const gen = new Generator(outDir, version, abigenPath);

      await gen.clean();
      await fsp.mkdir(outDir, { recursive: true });

      await gen.generate(artifacts, false, false);

      for (const artifact of artifacts) {
        const contract = artifact.contractName;
        const source = artifact.sourceName;
        const packageName = contract.replaceAll("-", "").replaceAll("_", "").toLowerCase();

        const abiPath = path.join(outDir, `${contract}.abi`);
        expect(fileExistsSync(abiPath)).to.equal(false);

        const genDir = path.join(outDir, path.dirname(source), packageName);
        const genPath = path.join(genDir, `${contract}.go`);
        expect(fileExistsSync(genPath)).to.equal(true);

        const content = await fsp.readFile(genPath, "utf8");
        expect(content.length).to.be.greaterThan(0);
      }
    });

    it(`generates bindings with deploy (version ${version})`, async () => {
      const gen = new Generator(outDir, version, abigenPath);

      await gen.clean();
      await fsp.mkdir(outDir, { recursive: true });

      await gen.generate(artifacts, true, false);

      for (const artifact of artifacts) {
        const contract = artifact.contractName;
        const source = artifact.sourceName;
        const packageName = contract.replaceAll("-", "").replaceAll("_", "").toLowerCase();

        const abiPath = path.join(outDir, `${contract}.abi`);
        const binPath = path.join(outDir, `${contract}.bin`);
        expect(fileExistsSync(abiPath)).to.equal(false);
        expect(fileExistsSync(binPath)).to.equal(false);

        const genDir = path.join(outDir, path.dirname(source), packageName);
        const genPath = path.join(genDir, `${contract}.go`);
        expect(fileExistsSync(genPath)).to.equal(true);

        const content = await fsp.readFile(genPath, "utf8");
        expect(content.length).to.be.greaterThan(0);
      }
    });
  });

  it("clean removes the output directory", async () => {
    const gen = new Generator(outDir, "v1", abigenPath);

    const dummy = path.join(outDir, "dummy.txt");
    await fsp.writeFile(dummy, "x");
    expect(fileExistsSync(dummy)).to.equal(true);

    await gen.clean();
    expect(fileExistsSync(outDir)).to.equal(false);
  });
});
