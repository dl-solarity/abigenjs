## AbigenJS

Generate Go bindings from Hardhat artifacts via abigen.wasm, without requiring a Go toolchain.

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

- inputs can be JSON files or directories (recursively scanned). Invalid JSON or artifacts missing fields are skipped with warnings.
- required artifact fields: `contractName`, `sourceName`, `abi`. If `--deployable` is set, `bytecode` is also required.

Examples:

```bash
# Generate without deployable bindings from a directory of artifacts
abigenjs -o ./gen -V v1 tests/mock_data

# Generate with deployable bindings for a single artifact file
abigenjs -o ./gen -V v2 --deployable tests/mock_data/ERC20Mock.json

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
await gen.generate([artifact1, artifact2], /* deploy */ false, /* verbose */ false);
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
