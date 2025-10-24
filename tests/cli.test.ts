import os from "os";
import path from "path";

import fs from "fs";
import fsp from "fs/promises";

import { expect } from "chai";
import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function runCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd ?? path.resolve(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: opts?.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function runBuild(cwd: string): Promise<void> {
  const { code, stderr } = await runCmd("npm", ["run", "build", "--silent"], { cwd });
  if (code !== 0) {
    throw new Error(`Build failed: ${stderr}`);
  }
}

function runCli(
  args: string[],
  opts?: { cwd?: string },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const repo = opts?.cwd ?? path.resolve(__dirname, "..");
  const entry = path.resolve(repo, "dist/src/index.js");
  return runCmd(process.execPath, [entry, ...args], { cwd: repo });
}

describe("CLI", function () {
  this.timeout(120000);

  const repoRoot = path.resolve(__dirname, "..");
  const abigenPath = path.resolve(repoRoot, "bin/abigen.wasm");

  let outDir: string;

  before(async () => {
    await runBuild(repoRoot);
  });

  beforeEach(async () => {
    outDir = path.join(
      os.tmpdir(),
      `abigenjs-cli-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    await fsp.mkdir(outDir, { recursive: true });
  });

  afterEach(async () => {
    if (fileExistsSync(outDir)) {
      await fsp.rm(outDir, { recursive: true, force: true });
    }
  });

  it("generates from directory without deployable", async () => {
    const inputsDir = path.resolve(repoRoot, "tests/mock_data");

    const { code, stderr } = await runCli([
      "-o",
      outDir,
      "-V",
      "v1",
      "--abigen-path",
      abigenPath,
      inputsDir,
    ]);

    expect(code).to.equal(0, `stderr: ${stderr}`);

    for (const artifact of [ERC20, SBT]) {
      const contract = artifact.contractName;
      const source = artifact.sourceName;
      const packageName = contract.replaceAll("-", "").replaceAll("_", "").toLowerCase();
      const genDir = path.join(outDir, path.dirname(source), packageName);
      const genPath = path.join(genDir, `${contract}.go`);
      expect(fileExistsSync(genPath)).to.equal(true, `${genPath} should exist`);
      const content = await fsp.readFile(genPath, "utf8");
      expect(content.length).to.be.greaterThan(0);
    }
  });

  it("generates from directory with deployable", async () => {
    const inputsDir = path.resolve(repoRoot, "tests/mock_data");

    const { code, stderr } = await runCli([
      "-o",
      outDir,
      "-V",
      "v2",
      "--deployable",
      "--abigen-path",
      abigenPath,
      inputsDir,
    ]);

    expect(code).to.equal(0, `stderr: ${stderr}`);

    for (const artifact of [ERC20, SBT]) {
      const contract = artifact.contractName;
      const source = artifact.sourceName;
      const packageName = contract.replaceAll("-", "").replaceAll("_", "").toLowerCase();
      const genDir = path.join(outDir, path.dirname(source), packageName);
      const genPath = path.join(genDir, `${contract}.go`);
      expect(fileExistsSync(genPath)).to.equal(true, `${genPath} should exist`);
      const content = await fsp.readFile(genPath, "utf8");
      expect(content.length).to.be.greaterThan(0);
    }
  });

  it("skips invalid json files inside directories and proceeds with valid ones", async () => {
    const mixedDir = path.join(
      os.tmpdir(),
      `abigenjs-cli-mixed-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    await fsp.mkdir(mixedDir, { recursive: true });
    try {
      // valid copy
      const ercPath = path.join(mixedDir, "ERC20Mock.json");
      await fsp.writeFile(ercPath, JSON.stringify(ERC20));
      // invalid JSON
      await fsp.writeFile(path.join(mixedDir, "bad.json"), "{ not-valid-json ");
      // missing required fields
      await fsp.writeFile(
        path.join(mixedDir, "missing.json"),
        JSON.stringify({ contractName: "X" }),
      );
      // non-json file
      await fsp.writeFile(path.join(mixedDir, "readme.txt"), "hello");

      const { code, stderr } = await runCli([
        "-o",
        outDir,
        "-V",
        "v1",
        "--abigen-path",
        abigenPath,
        mixedDir,
      ]);

      expect(code).to.equal(0, `stderr: ${stderr}`);
      // Warned about skipped inputs
      expect(stderr).to.include("Some inputs were skipped");

      const contract = ERC20.contractName;
      const source = ERC20.sourceName;
      const packageName = contract.replaceAll("-", "").replaceAll("_", "").toLowerCase();
      const genDir = path.join(outDir, path.dirname(source), packageName);
      const genPath = path.join(genDir, `${contract}.go`);
      expect(fileExistsSync(genPath)).to.equal(true);
    } finally {
      if (fileExistsSync(mixedDir)) {
        await fsp.rm(mixedDir, { recursive: true, force: true });
      }
    }
  });

  it("fails when version flag is missing", async () => {
    const inputsDir = path.resolve(repoRoot, "tests/mock_data");
    const { code, stderr } = await runCli(["-o", outDir, "--abigen-path", abigenPath, inputsDir]);

    expect(code).to.equal(1);
    expect(stderr).to.include("--abigen-version");
  });
});
