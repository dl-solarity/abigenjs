import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Command, Option } from "commander";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
// CommonJS module in ESM context
const Generator = require("./abigen/generator.cjs");

type Artifact = {
  contractName: unknown;
  sourceName: unknown;
  abi: unknown;
  bytecode?: unknown;
};

function formatValidationErrors(filePath: string, errors: string[]): string {
  const rel = path.resolve(filePath);
  return `- ${rel}:\n  - ${errors.join("\n  - ")}`;
}

function validateArtifact(artifact: Artifact, requireBytecode: boolean): string[] {
  const errors: string[] = [];
  if (typeof artifact.contractName !== "string" || artifact.contractName.length === 0) {
    errors.push("Missing or invalid field: contractName (string)");
  }
  if (typeof artifact.sourceName !== "string" || artifact.sourceName.length === 0) {
    errors.push("Missing or invalid field: sourceName (string)");
  }
  if (!Array.isArray(artifact.abi)) {
    errors.push("Missing or invalid field: abi (array)");
  }
  if (requireBytecode) {
    if (typeof artifact.bytecode !== "string" || artifact.bytecode.length === 0) {
      errors.push("Missing or invalid field: bytecode (string) required when --deploy is set");
    }
  }
  return errors;
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function listFilesRecursively(dirPath: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursively(full);
      out.push(...nested);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function collectCandidateFiles(inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const p of inputs) {
    const abs = path.resolve(p);
    try {
      const st = await fsp.stat(abs);
      if (st.isFile()) {
        files.push(abs);
      } else if (st.isDirectory()) {
        const children = await listFilesRecursively(abs);
        for (const c of children) files.push(c);
      }
    } catch {
      // notify missing; we'll print later as warning
      console.warn(`Input not found, skipping: ${abs}`);
    }
  }
  // Only JSON files are candidates
  return Array.from(new Set(files.filter((f) => f.toLowerCase().endsWith(".json"))));
}

function resolveDefaultAbigenPath(): string | null {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const candidates = [
    path.resolve(__dirname, "../../bin/abigen.wasm"),
    path.resolve(process.cwd(), "node_modules/abigenjs/bin/abigen.wasm"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("abigenjs")
    .description("Generate Go bindings from Hardhat artifacts using abigen.wasm")
    .addOption(new Option("-o, --out <dir>", "Output directory").makeOptionMandatory())
    .addOption(
      new Option("-V, --abigen-version <version>", "abigen version to use").choices([
        "v1",
        "v2",
      ]) as Option,
    )
    .option("--deploy", "Include deploy methods; requires artifacts to have bytecode", false)
    .option("--abigen-path <path>", "Path to abigen.wasm (defaults to packaged wasm)")
    .option("--verbose", "Enable verbose logging", false)
    .option("--clean", "Remove output directory before generating", false)
    .argument("<inputs...>", "Artifact files or directories containing artifacts")
    .showHelpAfterError();

  try {
    const parsed = await program.parseAsync(process.argv);
    const opts = parsed.opts<{
      out: string;
      abigenVersion?: "v1" | "v2";
      deploy: boolean;
      abigenPath?: string;
      verbose: boolean;
      clean: boolean;
    }>();
    const inputs = parsed.args as string[];

    if (!opts.abigenVersion) {
      throw new Error("Missing required option: --abigen-version <v1|v2>");
    }

    if (!inputs || inputs.length === 0) {
      throw new Error("Provide at least one file or directory containing artifacts");
    }

    const candidateFiles = await collectCandidateFiles(inputs);
    if (candidateFiles.length === 0) {
      throw new Error("No candidate JSON files found in provided inputs");
    }

    const artifacts: Artifact[] = [];
    const warnings: string[] = [];

    for (const file of candidateFiles) {
      try {
        const data = (await readJson(file)) as Artifact;
        const errs = validateArtifact(data, opts.deploy);
        if (errs.length > 0) {
          warnings.push(formatValidationErrors(file, errs));
          continue;
        }
        artifacts.push(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`- ${file}: ${msg}`);
      }
    }

    if (warnings.length > 0) {
      console.warn(`Some inputs were skipped due to validation issues:\n${warnings.join("\n")}`);
    }

    if (artifacts.length === 0) {
      throw new Error("No valid artifacts to process after validation");
    }

    if (opts.clean && fs.existsSync(opts.out)) {
      await fsp.rm(opts.out, { recursive: true, force: true });
    }
    await fsp.mkdir(opts.out, { recursive: true });

    const resolvedAbigenPath = opts.abigenPath
      ? path.resolve(opts.abigenPath)
      : resolveDefaultAbigenPath();

    const generator = resolvedAbigenPath
      ? new Generator(opts.out, opts.abigenVersion, resolvedAbigenPath)
      : new Generator(opts.out, opts.abigenVersion);

    await generator.generate(artifacts, opts.deploy, opts.verbose);

    console.log(`Generated ${artifacts.length} binding(s) into ${path.resolve(opts.out)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    throw new Error(msg);
  }
}

void main();
