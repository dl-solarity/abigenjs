import fs from "fs";
import fsp from "fs/promises";

import path from "path";

import("./wasm/wasm_exec_node.cjs");

export interface Artifact {
  contractName: string;
  sourceName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any;
  bytecode?: string;
}

export class Generator {
  private readonly lang = "go";

  constructor(
    private readonly outDir: string,
    private readonly abigenVersion: string,
    private readonly abigenPath: string = "./node_modules/abigenjs/bin/abigen.wasm",
  ) {
    this.outDir = path.resolve(outDir);

    this.abigenVersion = abigenVersion;
    if (this.abigenVersion !== "v1" && this.abigenVersion !== "v2") {
      throw new Error(`Unsupported abigen version: ${this.abigenVersion}`);
    }

    this.abigenPath = path.resolve(abigenPath);
  }

  public async clean(): Promise<void> {
    if (!fs.existsSync(this.outDir)) {
      return;
    }

    const dirStats = await fsp.stat(this.outDir);

    if (!dirStats.isDirectory()) {
      throw new Error(`outdir is not a directory: ${this.outDir}`);
    }

    await fsp.rm(this.outDir, { recursive: true });
  }

  public async generate(
    artifacts: Artifact[],
    deployable: boolean,
    verbose: boolean,
  ): Promise<void> {
    this._verboseLog(
      `Generating bindings into ${this.outDir} ${deployable ? "with" : "without"} deployable bindings\n`,
      verbose,
    );

    for (const artifact of artifacts) {
      const contract = artifact.contractName;
      const source = artifact.sourceName;

      const abiPath = `${this.outDir}/${contract}.abi`;

      const packageName = contract.replaceAll("-", "").replaceAll("_", "").toLowerCase();

      const sourceDir = path.dirname(source);
      const useFlatOut = !source || source.length === 0 || sourceDir === ".";
      const genDir = useFlatOut ? `${this.outDir}` : `${this.outDir}/${sourceDir}/${packageName}`;
      const genPath = `${genDir}/${contract}.${this.lang}`;

      const sanitizedType = this._sanitizeTypeName(String(contract));
      const v2Flag = this.abigenVersion === "v1" ? `` : ` --v2`;
      const argv = `abigen${v2Flag} --abi ${abiPath} --pkg ${packageName} --type ${sanitizedType} --out ${genPath}`;

      this._verboseLog(`Generating bindings: ${argv}`, verbose);

      this._verboseLog(`${contract}: ${source}`, verbose);

      if (!fs.existsSync(this.outDir)) {
        await fsp.mkdir(this.outDir, { recursive: true });
      }

      await fsp.mkdir(genDir, { recursive: true });
      await fsp.writeFile(abiPath, JSON.stringify(artifact.abi));

      if (deployable && artifact.bytecode && artifact.bytecode.length > 0) {
        const binPath = `${this.outDir}/${contract}.bin`;
        const argvBin = `${argv} --bin ${binPath}`;

        await fsp.writeFile(binPath, artifact.bytecode);
        await this.abigen(this.abigenPath, argvBin.split(" "));
        await fsp.rm(binPath);
      } else {
        await this.abigen(this.abigenPath, argv.split(" "));
      }

      await fsp.rm(abiPath);
    }
  }

  private _verboseLog(msg: string, verbose: boolean): void {
    if (verbose) {
      console.log(msg);
    }
  }

  private async abigen(path: string, argv: string[]): Promise<void> {
    const go = new (globalThis as any).Go();

    go.argv = argv;
    go.env = Object.assign({ TMPDIR: require("os").tmpdir() }, process.env);

    try {
      const abigenObj = await (globalThis as any).WebAssembly.instantiate(
        await fsp.readFile(path),
        go.importObject,
      );

      await go.run(abigenObj.instance);
      go._pendingEvent = { id: 0 };
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(e.message);
      }

      throw new Error(`Unknown error: ${String(e)}`);
    }
  }

  private _sanitizeTypeName(name: string): string {
    // remove non-alphanumeric characters
    let t = String(name).replace(/[^a-zA-Z0-9]/g, "");
    if (t.length === 0) t = "Contract";
    // ensure starts with a letter
    if (!/^[A-Za-z]/.test(t)) t = `X${t}`;
    // capitalize first letter
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return t;
  }
}
