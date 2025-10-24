#!/usr/bin/env node

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

function deriveArtifactFromAbiOnly(filePath: string, data: unknown): Artifact | null {
  const fileBase = path.basename(filePath, path.extname(filePath));
  if (Array.isArray(data)) {
    return {
      contractName: fileBase,
      sourceName: "",
      abi: data,
    } as Artifact;
  }

  if (data && typeof data === "object") {
    const anyData = data as Record<string, unknown>;
    const abi = anyData.abi;
    if (Array.isArray(abi)) {
      return {
        contractName: fileBase,
        sourceName: "",
        abi,
        bytecode: typeof anyData.bytecode === "string" ? anyData.bytecode : undefined,
      } as Artifact;
    }
  }
  return null;
}

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
      errors.push("Missing or invalid field: bytecode (string) required when --deployable is set");
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
    .description("Generate Go bindings from artifacts using abigen.wasm")
    .option("-o, --out <dir>", "Output directory", "generated-types/bindings")
    .option("-V, --abigen-version <version>", "abigen version to use", "v2")
    .option(
      "--deployable",
      "Include deployable methods; requires artifacts to have bytecode",
      false,
    )
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
      deployable?: boolean;
      abigenPath?: string;
      verbose: boolean;
      clean: boolean;
    }>();
    const inputs = parsed.args as string[];

    if (!inputs || inputs.length === 0) {
      throw new Error("Provide at least one file or directory containing artifacts");
    }

    const candidateFiles = await collectCandidateFiles(inputs);
    if (candidateFiles.length === 0) {
      throw new Error("No candidate JSON files found in provided inputs");
    }

    const artifacts: Artifact[] = [];
    const notices: string[] = [];
    const validationFailures: string[] = [];
    const includeDeployable = Boolean(opts.deployable);

    for (const file of candidateFiles) {
      try {
        const data = (await readJson(file)) as Artifact;
        let errs = validateArtifact(data, includeDeployable);
        if (errs.length > 0) {
          const fallback = deriveArtifactFromAbiOnly(file, data as unknown);
          if (fallback) {
            // Only require ABI for fallback; generate non-deployable if bytecode is absent
            if (includeDeployable && typeof fallback.bytecode !== "string") {
              notices.push(`- ${path.resolve(file)}: --deployable passed but ABI-only input; generated non-deployable bindings only`);
            }
            artifacts.push(fallback as Artifact);
          } else {
            validationFailures.push(formatValidationErrors(file, errs));
          }
        } else {
          // Valid full artifact, proceed
          artifacts.push(data);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        validationFailures.push(`- ${path.resolve(file)}: ${msg}`);
      }
    }

    if (validationFailures.length > 0) {
      console.warn(`Some inputs were skipped due to validation issues:\n${validationFailures.join("\n")}`);
    }
    if (notices.length > 0) {
      console.warn(`Warnings:\n${notices.join("\n")}`);
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

    await generator.generate(artifacts, includeDeployable, opts.verbose);

    console.log(`Generated ${artifacts.length} binding(s) into ${path.resolve(opts.out)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    throw new Error(msg);
  }
}

void main();
