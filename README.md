## AbigenJS

Generate Go bindings from artifacts via abigen.wasm, without requiring a Go toolchain.

### Installation

```bash
npm install --save-dev abigenjs
```

This package includes:

- Runtime CLI: `abigenjs`
- Programmatic API: `Generator` (CommonJS module at `src/abigen/generator.cjs`)

### CLI Usage

```bash
abigenjs -o <outDir> -V <v1|v2> [--deployable] [--abigen-path <path>] [--verbose] [--clean] <inputs...>
```

- **Defaults**: `-o generated-types/bindings`, `-V v2`.
- **Inputs** can be JSON files or directories (recursively scanned). Invalid JSON or unreadable files are skipped with warnings.
- **Artifacts**: expected fields are `contractName`, `sourceName`, and `abi`. If `--deployable` is set, `bytecode` is also required.
- **ABI-only inputs**: If a JSON file is either (a) a raw ABI array or (b) an object with an `abi` array (and optional `bytecode`), AbigenJS will infer `contractName` from the filename and use an empty `sourceName`. When `--deployable` is passed but `bytecode` is missing, non-deployable bindings will still be generated and a warning will be printed.
- **abigen.wasm**: A packaged `abigen.wasm` is used by default; `--abigen-path` lets you override the path if needed.

Examples:

```bash
# Generate without deployable bindings from a directory of artifacts
abigenjs -o ./gen -V v1 tests/mock_data

# Generate with deployable bindings for a single artifact file
abigenjs --deployable tests/mock_data/ERC20Mock.json

# Use a custom abigen.wasm path (optional)
abigenjs -o ./gen -V v1 --abigen-path ./bin/abigen.wasm tests/mock_data
```

### Programmatic API

```ts
// ESM context
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Generator = require("abigenjs/dist/src/abigen/generator.cjs");

const gen = new Generator("./gen", "v1");
await gen.clean();
await gen.generate([artifact1, artifact2], /* deployable */ false, /* verbose */ false);
```

### Development

Scripts:

```bash
npm run build   # Build TS, copy wasm runtime
npm run test    # Run mocha tests
npm run lint    # Lint
```

Publishing checklist:

- Ensure `bin/abigen.wasm` exists and is included via the `files` array
- Run `npm run build` to produce `dist/`
- Optionally run `npm pack` to verify bundled contents
- `npm publish`
