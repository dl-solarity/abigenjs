[![npm](https://img.shields.io/npm/v/abigenjs.svg)](https://www.npmjs.com/package/abigenjs)

## AbigenJS

Generate Go bindings from artifacts via abigen.wasm compiled from [Abigen](https://geth.ethereum.org/docs/tools/abigen), without requiring the Go toolchain.

### Installation

```bash
npm install -g abigenjs
```

This package includes:

- Runtime CLI: `abigenjs`
- Programmatic API: `Generator` (CommonJS module at `src/abigen/generator.cjs`)

### CLI Usage

```bash
abigenjs <paths to JSONs/dirs...> [-o <outDir>] [-v <v1|v2>] [--deployable] [--abigen-path <path>] [--verbose|--quiet] [--clean]
```

- **Defaults**: `-o generated-types/bindings`, `-v v2`.
- **Inputs**: JSON files or directories (recursively scanned) containing contract artifacts or ABI-only JSON.
- **Artifacts**: expected fields are `contractName`, `sourceName`, and `abi`. If `--deployable` is set, `bytecode` is also required.
- **ABI-only inputs**: If a JSON file is either (a) a raw ABI array or (b) an object with an `abi` array (and optional `bytecode`), AbigenJS will infer `contractName` from the filename and use an empty `sourceName`. When `--deployable` is passed but `bytecode` is missing, non-deployable bindings will still be generated and a warning will be printed.
- **abigen.wasm**: A packaged `abigen.wasm` is used by default; `--abigen-path` lets you override the path if needed.
- **Quiet mode**: `--quiet` suppresses all non-error output and warnings, and overrides `--verbose`.

Examples:

```bash
# Generate without deployable bindings from a directory of artifacts
abigenjs -o ./gen -v v1 tests/mock_data

# Generate with deployable bindings for a single artifact file
abigenjs --deployable tests/mock_data/ERC20Mock.json

# Use a custom abigen.wasm path (optional)
abigenjs -o ./gen -v v1 --abigen-path ./bin/abigen.wasm tests/mock_data
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

### Limitations

- **Environment variables are not forwarded into `abigen.wasm`**: The embedded Go WASM runtime intentionally omits passing host ENV to the binary.
