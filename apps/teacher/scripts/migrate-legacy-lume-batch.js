#!/usr/bin/env node

const path = require('path');
const {
    collectLegacyLumeFiles,
    migrateLegacyLume
} = require('./legacy-lume-migrator');

function usage() {
    console.error('Usage: node scripts/migrate-legacy-lume-batch.js <input-path> [--out-dir <dir>] [--in-place]');
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
        inputPath: '',
        outDir: '',
        inPlace: false
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (!options.inputPath && !arg.startsWith('--')) {
            options.inputPath = arg;
            continue;
        }
        if (arg === '--out-dir') {
            const next = args[index + 1];
            if (!next || next.startsWith('--')) {
                throw new Error('--out-dir requires a directory path');
            }
            options.outDir = next;
            index += 1;
            continue;
        }
        if (arg === '--in-place') {
            options.inPlace = true;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.inputPath) {
        usage();
        process.exitCode = 1;
        return null;
    }
    if (options.inPlace && options.outDir) {
        throw new Error('Use either --in-place or --out-dir, not both');
    }

    return options;
}

function resolveOutputPath(filePath, options, inputRoot) {
    if (options.inPlace) {
        return filePath.replace(/\.lume$/i, '.migrated.lume');
    }

    if (options.outDir) {
        const relativePath = path.relative(inputRoot, filePath);
        return path.join(
            path.resolve(options.outDir),
            relativePath.replace(/\.lume$/i, '.migrated.lume')
        );
    }

    return filePath.replace(/\.lume$/i, '.migrated.lume');
}

async function main() {
    const options = parseArgs(process.argv);
    if (!options) return;

    const files = collectLegacyLumeFiles(options.inputPath);
    if (files.length === 0) {
        console.log('[migrate-legacy-lume-batch] no legacy .lume files found');
        return;
    }

    const inputRoot = path.resolve(options.inputPath);
    const results = [];

    for (const filePath of files) {
        const outputPath = resolveOutputPath(filePath, options, inputRoot);
        const result = await migrateLegacyLume(filePath, outputPath);
        results.push(result);
        console.log(`[migrate-legacy-lume-batch] migrated ${path.basename(result.inputPath)} -> ${result.outputPath}`);
    }

    console.log(`[migrate-legacy-lume-batch] completed ${results.length} file(s)`);
}

main().catch((err) => {
    console.error(`[migrate-legacy-lume-batch] ${err.message}`);
    process.exitCode = 1;
});
