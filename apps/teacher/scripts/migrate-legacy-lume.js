#!/usr/bin/env node

const { migrateLegacyLume } = require('./legacy-lume-migrator');

function usage() {
    console.error('Usage: node scripts/migrate-legacy-lume.js <input.legacy.lume> [output.lume]');
}

async function main() {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3];

    if (!inputPath) {
        usage();
        process.exitCode = 1;
        return;
    }

    const result = await migrateLegacyLume(inputPath, outputPath);
    console.log(`[migrate-legacy-lume] wrote ${result.outputPath}`);
}

main().catch((err) => {
    console.error(`[migrate-legacy-lume] ${err.message}`);
    process.exitCode = 1;
});
