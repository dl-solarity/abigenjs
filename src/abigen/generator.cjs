require("./wasm/wasm_exec_node.cjs");

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

module.exports = class Generator {
  lang = "go";

  constructor(outDir, abigenVersion, abigenPath = "./node_modules/abigenjs/bin/abigen.wasm") {
    this.outDir = path.resolve(outDir);

    this.abigenVersion = abigenVersion;
    if (this.abigenVersion !== "v1" && this.abigenVersion !== "v2") {
      throw new Error(`Unsupported abigen version: ${this.abigenVersion}`);
    }

    this.abigenPath = path.resolve(abigenPath);
  }

  async clean() {
    if (!fs.existsSync(this.outDir)) {
      return;
    }

    const dirStats = await fsp.stat(this.outDir);

    if (!dirStats.isDirectory()) {
      throw new Error(`outdir is not a directory: ${this.outDir}`);
    }

    await fsp.rm(this.outDir, { recursive: true });
  }

  async generate(artifacts, deployable, verbose) {
    this._verboseLog(
      `Generating bindings into ${this.outDir} ${deployable ? "with" : "without"} deployment method\n`,
      verbose,
    );

    for (const artifact of artifacts) {
      const contract = artifact.contractName;
      const source = artifact.sourceName;

      const abiPath = `${this.outDir}/${contract}.abi`;

      const packageName = contract.replaceAll("-", "").replaceAll("_", "").toLowerCase();

      const genDir = `${this.outDir}/${path.dirname(source)}/${packageName}`;
      const genPath = `${genDir}/${contract}.${this.lang}`;

      const v2Flag = this.abigenVersion == "v1" ? `` : ` --v2`;
      const argv = `abigen${v2Flag} --abi ${abiPath} --pkg ${packageName} --type ${contract} --out ${genPath}`;

      this._verboseLog(`Generating bindings: ${argv}`, verbose);

      this._verboseLog(`${contract}: ${source}`, verbose);

      if (!fs.existsSync(this.outDir)) {
        await fsp.mkdir(this.outDir, { recursive: true });
      }

      await fsp.mkdir(genDir, { recursive: true });
      await fsp.writeFile(abiPath, JSON.stringify(artifact.abi));

      if (deployable) {
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

  _verboseLog(msg, verbose) {
    if (verbose) {
      console.log(msg);
    }
  }

  async abigen(path, argv) {
    const go = new Go();

    go.argv = argv;
    go.env = Object.assign({ TMPDIR: require("os").tmpdir() }, process.env);

    try {
      const abigenObj = await WebAssembly.instantiate(await fsp.readFile(path), go.importObject);

      await go.run(abigenObj.instance);
      go._pendingEvent = { id: 0 };
    } catch (e) {
      throw new Error(e.message);
    }
  }
};
