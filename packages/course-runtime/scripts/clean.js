const fs = require('fs');
const path = require('path');

for (const entry of ['dist', '.typecheck']) {
  fs.rmSync(path.join(__dirname, '..', entry), { recursive: true, force: true });
}
