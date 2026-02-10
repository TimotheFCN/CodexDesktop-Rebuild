#!/usr/bin/env node
/**
 * Smart development startup script
 * Automatically detects system architecture and sets correct CLI path
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Detect platform and architecture
const platform = process.platform;
const arch = os.arch();

// Map to CLI binary paths
const platformMap = {
  darwin: {
    x64: 'darwin-x64',
    arm64: 'darwin-arm64',
  },
  linux: {
    x64: 'linux-x64',
    arm64: 'linux-arm64',
  },
  win32: {
    x64: 'win32-x64',
  },
};

const binDir = platformMap[platform]?.[arch];
if (!binDir) {
  console.error(`Unsupported platform/arch: ${platform}/${arch}`);
  process.exit(1);
}

const cliName = platform === 'win32' ? 'codex.exe' : 'codex';
const cliPath = path.join(__dirname, '..', 'resources', 'bin', binDir, cliName);

// Verify CLI exists
if (!fs.existsSync(cliPath)) {
  console.error(`CLI not found at: ${cliPath}`);
  console.error('Please ensure the CLI binary exists in resources/bin/');
  process.exit(1);
}

// Detect WSL environment
function isWSL() {
  try {
    const procVersion = fs.readFileSync('/proc/version', 'utf8');
    return /microsoft|wsl/i.test(procVersion);
  } catch {
    return false;
  }
}

console.log(`[start-dev] Platform: ${platform}, Arch: ${arch}`);
console.log(`[start-dev] CLI Path: ${cliPath}`);

// Build Electron args — on WSL, force software GL to avoid dzn/D3D12 GPU crash loop
// We do NOT use --disable-gpu because the app bundle explicitly checks GPU availability.
// Instead we force Mesa software rendering (llvmpipe) via LIBGL_ALWAYS_SOFTWARE=1 and
// disable GPU compositing so the buggy WSLg D3D12 driver is never touched.
const wsl = isWSL();
const electronArgs = ['.'];
const extraEnv = {};
if (wsl) {
  console.log('[start-dev] WSL detected, forcing software rendering + Wayland CSD');
  extraEnv.LIBGL_ALWAYS_SOFTWARE = '1';
  electronArgs.unshift(
    '--disable-gpu-compositing',
    '--in-process-gpu',
    // Use native Wayland via Ozone instead of XWayland for clean client-side decorations
    '--ozone-platform=wayland',
    '--enable-features=UseOzonePlatform,WaylandWindowDecorations',
  );
}

// Launch Electron with CLI path
const electronBin = require('electron');
const child = spawn(electronBin, electronArgs, {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: {
    ...process.env,
    ...extraEnv,
    CODEX_CLI_PATH: cliPath,
    BUILD_FLAVOR: process.env.BUILD_FLAVOR || 'dev',
    // 使用 app:// 自定义协议加载静态资源（而非 Vite dev server）
    ELECTRON_RENDERER_URL: process.env.ELECTRON_RENDERER_URL || 'app://-/index.html',
  },
});

child.on('close', (code) => {
  process.exit(code);
});
