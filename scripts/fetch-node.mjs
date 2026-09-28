#!/usr/bin/env node
import { createHash } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, chmodSync, readFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);

const NODE_VERSION = '22.13.0';
const TARGETS = {
	'aarch64-apple-darwin': 'node-v22.13.0-darwin-arm64',
	'x86_64-apple-darwin': 'node-v22.13.0-darwin-x64',
	'x86_64-pc-windows-msvc': 'node-v22.13.0-win-x64',
	'x86_64-unknown-linux-gnu': 'node-v22.13.0-linux-x64',
};

function parseArgs() {
	const args = process.argv.slice(2);
	let target = null;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--target' && i + 1 < args.length) {
			target = args[i + 1];
			break;
		}
	}

	if (!target) {
		console.error('Usage: fetch-node.mjs --target <triple>');
		console.error('Supported targets:');
		Object.keys(TARGETS).forEach(t => console.error(`  ${t}`));
		process.exit(1);
	}

	if (!TARGETS[target]) {
		console.error(`Unsupported target: ${target}`);
		console.error('Supported targets:');
		Object.keys(TARGETS).forEach(t => console.error(`  ${t}`));
		process.exit(1);
	}

	return target;
}

function getOutputPath(target) {
	const isWindows = target === 'x86_64-pc-windows-msvc';
	const filename = `node-${target}${isWindows ? '.exe' : ''}`;
	return join(projectRoot, 'src-tauri', 'binaries', filename);
}

async function fetchShasums() {
	const url = `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to fetch SHASUMS256.txt: ${response.statusText}`);
	return response.text();
}

async function downloadFile(url, dest) {
	console.log(`Downloading ${url}...`);

	const response = await fetch(url);
	if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

	const dir = dirname(dest);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const buffer = await response.arrayBuffer();
	await import('fs/promises').then(fs => fs.writeFile(dest, new Uint8Array(buffer)));
}

function computeSha256(filePath) {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(filePath);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
		stream.on('error', reject);
	});
}

async function extractBinary(archivePath, target, outputPath) {
	const dir = dirname(outputPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const isWindows = target === 'x86_64-pc-windows-msvc';
	const archiveBasename = TARGETS[target];
	const tempExtractDir = join(dirname(archivePath), 'extract-temp');

	if (!existsSync(tempExtractDir)) {
		mkdirSync(tempExtractDir, { recursive: true });
	}

	const { execSync } = await import('child_process');

	try {
		if (isWindows) {
			// For Windows, the archive is a .zip file
			// We need to extract node.exe from it
			execSync(`cd "${tempExtractDir}" && unzip -q "${archivePath}" "${archiveBasename}/node.exe"`, {
				stdio: 'pipe',
			});
			const tempBinary = join(tempExtractDir, archiveBasename, 'node.exe');
			const fs = await import('fs/promises');
			const data = await fs.readFile(tempBinary);
			await fs.writeFile(outputPath, data);
		} else {
			// For Unix, the archive is a .tar.gz file
			// We need to extract bin/node from it
			execSync(`cd "${tempExtractDir}" && tar -xzf "${archivePath}" "${archiveBasename}/bin/node"`, {
				stdio: 'pipe',
			});
			const tempBinary = join(tempExtractDir, archiveBasename, 'bin', 'node');
			const fs = await import('fs/promises');
			const data = await fs.readFile(tempBinary);
			await fs.writeFile(outputPath, data);
			chmodSync(outputPath, 0o755);
		}
	} catch (e) {
		throw new Error(`Failed to extract binary: ${e.message}`);
	} finally {
		// Cleanup temp extract directory
		try {
			await import('fs/promises').then(fs => fs.rm(tempExtractDir, { recursive: true, force: true }));
		} catch {}
	}
}

async function verifyVersion(binaryPath, target) {
	const isWindows = target === 'x86_64-pc-windows-msvc';
	const cmd = isWindows ? `"${binaryPath}" --version` : `"${binaryPath}" --version`;

	try {
		const { stdout } = await execAsync(cmd);
		const version = stdout.trim();
		console.log(`✓ Binary version: ${version}`);
		return true;
	} catch (e) {
		console.error(`✗ Failed to verify binary version: ${e.message}`);
		return false;
	}
}

async function main() {
	const target = parseArgs();
	const outputPath = getOutputPath(target);
	const basename_ = TARGETS[target];

	console.log(`Fetching Node ${NODE_VERSION} for ${target}...`);

	// Check if we already have the binary
	if (existsSync(outputPath)) {
		console.log(`✓ Binary already present, verifying...`);
		const verified = await verifyVersion(outputPath, target);
		if (verified) {
			console.log(`✓ Done!`);
			process.exit(0);
		}
		console.error('Binary version verification failed');
		process.exit(1);
	}

	// Fetch SHASUMS
	let shasums;
	try {
		shasums = await fetchShasums();
	} catch (e) {
		console.error(`Failed to fetch SHASUMS256.txt: ${e.message}`);
		process.exit(1);
	}

	// Determine file extension
	const isWindows = target === 'x86_64-pc-windows-msvc';
	const ext = isWindows ? '.zip' : '.tar.gz';
	const archiveBasename = basename_ + ext;
	const archiveUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveBasename}`;
	const tempDir = join(projectRoot, '.node-fetch-tmp');
	const archivePath = join(tempDir, archiveBasename);

	if (!existsSync(tempDir)) {
		mkdirSync(tempDir, { recursive: true });
	}

	// Download archive
	try {
		await downloadFile(archiveUrl, archivePath);
	} catch (e) {
		console.error(`Failed to download: ${e.message}`);
		process.exit(1);
	}

	// Verify checksum
	try {
		const hash = await computeSha256(archivePath);
		const nodeExeName = isWindows ? 'node.exe' : 'node';
		const shaLine = shasums.split('\n').find(line => line.includes(nodeExeName) && line.includes(archiveBasename));

		if (!shaLine) {
			throw new Error(`No checksum found for ${archiveBasename}`);
		}

		const [expectedHash] = shaLine.split(/\s+/);
		if (hash !== expectedHash) {
			throw new Error(`Checksum mismatch!\nExpected: ${expectedHash}\nGot: ${hash}`);
		}

		console.log(`✓ Checksum verified`);
	} catch (e) {
		console.error(`✗ Verification failed: ${e.message}`);
		// Clean up the bad download
		try {
			await import('fs/promises').then(fs => fs.unlink(archivePath));
		} catch {}
		process.exit(1);
	}

	// Extract binary
	try {
		await extractBinary(archivePath, target, outputPath);
		console.log(`✓ Binary extracted to ${outputPath}`);
	} catch (e) {
		console.error(`✗ Extraction failed: ${e.message}`);
		// Clean up the archive
		try {
			await import('fs/promises').then(fs => fs.unlink(archivePath));
		} catch {}
		process.exit(1);
	}

	// Verify version
	const verified = await verifyVersion(outputPath, target);
	if (!verified) {
		console.error('Binary version verification failed');
		process.exit(1);
	}

	// Cleanup temp directory
	try {
		await import('fs/promises').then(fs => fs.rm(tempDir, { recursive: true, force: true }));
	} catch {}

	console.log(`✓ Done!`);
}

main().catch(e => {
	console.error('Fatal error:', e.message);
	process.exit(1);
});
