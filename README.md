# evalharness

**Test your prompts, agents, and RAG pipelines — red teaming, regression testing, and CI/CD for AI**

![Build](https://img.shields.io/badge/build-passing-brightgreen) ![License](https://img.shields.io/badge/license-proprietary-red)

## Install
```bash
npm install
```

## Quick Start
```typescript
import { Evalharness } from "./evalharness";
const instance = new Evalharness()
const r = await instance.runtest({ input: 'test' })
```

## CLI
```bash
npx tsx src/cli.ts status
npx tsx src/cli.ts run --input "data"
```

## API
| Method | Description |
|--------|-------------|
| `runtest()` | Runtest |
| `assertcontains()` | Assertcontains |
| `assertsemantic()` | Assertsemantic |
| `redteam()` | Redteam |
| `generatereport()` | Generatereport |
| `comparemodels()` | Comparemodels |

## Test
```bash
npx vitest
```

## License
(c) 2026 Officethree Technologies. All Rights Reserved.
