/**
 * Arena Mode integration for Equalizer APO and local crowd audio.
 *
 * @module
 */
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import log from 'electron-log';
import { app, BrowserWindow } from 'electron';
import { Constants } from '@liga/shared';

const LOGGER = log.scope('arena-mode');
const MANAGED_CONFIG_FILE = 'liga-arena-mode.txt';
const CROWD_NOISE_FILE = 'crowd-noise.wav';
const CONFIG_BEGIN = '# LIGA Arena Mode begin';
const CONFIG_END = '# LIGA Arena Mode end';
const CONFIG_INCLUDE_BLOCK = `${CONFIG_BEGIN}\nInclude: ${MANAGED_CONFIG_FILE}\n${CONFIG_END}`;
const CONFIG_BLOCK_PATTERN = new RegExp(
  `${CONFIG_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${CONFIG_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  'g',
);
const ACTIVE_INCLUDE_PATTERN = new RegExp(
  `^\\s*Include:\\s*${MANAGED_CONFIG_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
  'm',
);
const EQUALIZER_APO_INSTALLER_URL =
  'https://sourceforge.net/projects/equalizerapo/files/1.4.2/EqualizerAPO-x64-1.4.2.exe/download';
const VALHALLA_SUPERMASSIVE_URL =
  'https://valhallaproduction.s3.us-west-2.amazonaws.com/supermassive/ValhallaSupermassiveWin_V5_0_0.zip';
const DEFAULT_SUPERMASSIVE_CHUNK_DATA =
  'VkMyIToCAAA8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCI/PiA8VmFsaGFsbGFTdXBlcm1hc3NpdmUgcGx1Z2luVmVyc2lvbj0iNS4wLjAiIHByZXNldE5hbWU9IkRlZmF1bHQiIE1peD0iMC4zNTYwMDAwMDYxOTg4ODMxIiBEZWxheVN5bmM9IjAuMjUiIERlbGF5Tm90ZT0iMC4yODU3MTQyOTg0ODY3MDk2IiBEZWxheV9Ncz0iMC4yNjgwMDAwMDY2NzU3MjAyIiBEZWxheVdhcnA9IjAuODkyMDAwMDE5NTUwMzIzNSIgQ2xlYXI9IjEuMCIgRmVlZGJhY2s9IjAuMTUxOTk5OTk1MTEyNDE5MSIgRGVuc2l0eT0iMC4xNjc5OTk5OTc3MzUwMjM1IiBXaWR0aD0iMC44NTE5OTk5OTgwOTI2NTE0IiBMb3dDdXQ9IjAuMDgzOTk5OTk4ODY3NTExNzUiIEhpZ2hDdXQ9IjAuMzAzOTk5OTkwMjI0ODM4MyIgTW9kUmF0ZT0iMC4yNzc5OTk5OTcxMzg5NzcxIiBNb2REZXB0aD0iMC4wIiBNb2RlPSIwLjA0MTY2NjY2NzkwODQzMDEiIFJlc2VydmVkMT0iMC4wIiBSZXNlcnZlZDI9IjAuMCIgUmVzZXJ2ZWQzPSIwLjAiIFJlc2VydmVkND0iMC4wIiBtaXhMb2NrPSIwIiB1aVdpZHRoPSI4MjAiIHVpSGVpZ2h0PSI0MzUiLz4A';
const VALHALLA_VST_PATHS = [
  'C:\\Program Files\\Common Files\\VST2\\ValhallaSupermassive_x64.dll',
  'C:\\Program Files\\Common Files\\VST2\\Valhalla DSP\\ValhallaSupermassive.dll',
  'C:\\Program Files\\Common Files\\VST2\\Valhalla DSP\\ValhallaSupermassive_x64.dll',
  'C:\\Program Files\\Common Files\\VST2\\ValhallaSupermassive.dll',
  'C:\\Program Files\\Steinberg\\VstPlugins\\Valhalla DSP\\ValhallaSupermassive.dll',
  'C:\\Program Files\\Steinberg\\VstPlugins\\Valhalla DSP\\ValhallaSupermassive_x64.dll',
  'C:\\Program Files\\VstPlugins\\Valhalla DSP\\ValhallaSupermassive.dll',
  'C:\\Program Files\\VstPlugins\\Valhalla DSP\\ValhallaSupermassive_x64.dll',
  'C:\\Program Files\\VstPlugins\\ValhallaSupermassive.dll',
  'C:\\Program Files\\VstPlugins\\ValhallaSupermassive_x64.dll',
];

let crowdWindow: BrowserWindow | null = null;
let arenaModeActive = false;

const ARENA_MODE_TIER_SLUGS = new Set<string>([
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
  Constants.TierSlug.CCT_GLOBAL_FINALS,
]);

function quoteApoPath(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function getArenaSettings(settings: typeof Constants.Settings) {
  return settings.arenaMode;
}

function getEqualizerApoConfigPath(settings: typeof Constants.Settings) {
  return (
    getArenaSettings(settings).equalizerApoConfigPath ||
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'EqualizerAPO', 'config')
  );
}

function getManagedConfigPath(settings: typeof Constants.Settings) {
  return path.join(getEqualizerApoConfigPath(settings), MANAGED_CONFIG_FILE);
}

function getInactiveConfig() {
  return '# LIGA Arena Mode inactive\n';
}

async function pathExists(filePath: string) {
  return fs.promises
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

async function findValhallaVstPluginPath() {
  for (const candidate of VALHALLA_VST_PATHS) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return '';
}

async function downloadFile(url: string, destination: string, redirectCount = 0): Promise<void> {
  if (redirectCount > 5) {
    throw new Error(`Too many redirects while downloading ${url}`);
  }

  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'LIGA-Pro-Journey Arena Mode Installer',
        },
      },
      async (response) => {
        const redirect = response.headers.location;

        if (
          redirect &&
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400
        ) {
          response.resume();
          const nextUrl = new URL(redirect, url).toString();

          try {
            await downloadFile(nextUrl, destination, redirectCount + 1);
            resolve();
          } catch (error) {
            reject(error);
          }
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed (${response.statusCode}) for ${url}`));
          return;
        }

        try {
          await pipeline(response, fs.createWriteStream(destination));
          resolve();
        } catch (error) {
          reject(error);
        }
      },
    );

    request.on('error', reject);
  });
}

async function runPowerShell(script: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`PowerShell command failed with exit code ${code}.`));
      }
    });
  });
}

async function runElevatedInstaller(installerPath: string) {
  await runPowerShell(
    `Start-Process -FilePath ${JSON.stringify(installerPath)} -Verb RunAs -Wait`,
  );
}

async function expandZip(zipPath: string, destination: string) {
  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.mkdir(destination, { recursive: true });
  await runPowerShell(
    `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destination)} -Force`,
  );
}

async function installEqualizerApoIfNeeded(settings: typeof Constants.Settings) {
  const configFile = path.join(getEqualizerApoConfigPath(settings), 'config.txt');

  if (await pathExists(configFile)) {
    return false;
  }

  const installerPath = path.join(os.tmpdir(), 'EqualizerAPO-x64-1.4.2.exe');
  LOGGER.info('Downloading Equalizer APO installer...');
  await downloadFile(EQUALIZER_APO_INSTALLER_URL, installerPath);
  LOGGER.info('Launching Equalizer APO installer...');
  await runElevatedInstaller(installerPath);
  return true;
}

async function installValhallaSupermassiveIfNeeded(settings: typeof Constants.Settings) {
  const existingPath = settings.arenaMode.vstPluginPath || (await findValhallaVstPluginPath());

  if (existingPath && (await pathExists(existingPath))) {
    return existingPath;
  }

  const zipPath = path.join(os.tmpdir(), 'ValhallaSupermassiveWin_V5_0_0.zip');
  const extractPath = path.join(os.tmpdir(), 'liga-arena-valhalla-supermassive');
  LOGGER.info('Downloading Valhalla Supermassive installer...');
  await downloadFile(VALHALLA_SUPERMASSIVE_URL, zipPath);
  await expandZip(zipPath, extractPath);

  const installerPath = path.join(extractPath, 'ValhallaSupermassiveWin_V5_0_0.exe');

  if (!(await pathExists(installerPath))) {
    throw new Error('Valhalla Supermassive installer was not found in the downloaded package.');
  }

  LOGGER.info('Launching Valhalla Supermassive installer...');
  await runElevatedInstaller(installerPath);
  return findValhallaVstPluginPath();
}

async function buildActiveConfig(settings: typeof Constants.Settings) {
  const arena = getArenaSettings(settings);
  const vstPluginPath = arena.vstPluginPath && (await pathExists(arena.vstPluginPath))
    ? arena.vstPluginPath
    : await findValhallaVstPluginPath();
  const lines = [
    '# LIGA Arena Mode active',
    'Device: all',
    'Stage: post-mix',
    'Channel: all',
    'Preamp: 0 dB',
    'GraphicEQ: 25 4; 40 5.5; 63 6; 100 5; 160 3; 250 1.5; 400 0; 630 0; 1000 0; 1600 0; 2500 0; 4000 0; 6300 0; 10000 0; 16000 0',
  ];

  if (vstPluginPath) {
    lines.push(
      `VSTPlugin: Library ${quoteApoPath(vstPluginPath)} ChunkData "${DEFAULT_SUPERMASSIVE_CHUNK_DATA}"`,
    );
  }

  return `${lines.join('\n')}\n`;
}

async function writeFileWithElevatedFallback(filePath: string, content: string, settings: typeof Constants.Settings) {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (process.platform !== 'win32' || !['EACCES', 'EPERM'].includes(err.code || '')) {
      throw error;
    }

    await runElevatedInstallScript(settings, content);
  }
}

async function runElevatedInstallScript(settings: typeof Constants.Settings, managedContent: string) {
  const configPath = getEqualizerApoConfigPath(settings);
  const configFile = path.join(configPath, 'config.txt');
  const managedConfigFile = getManagedConfigPath(settings);
  const scriptPath = path.join(os.tmpdir(), `liga-arena-mode-${Date.now()}.ps1`);
  const script = `
$ErrorActionPreference = 'Stop'
$configPath = ${JSON.stringify(configPath)}
$configFile = ${JSON.stringify(configFile)}
$managedConfigFile = ${JSON.stringify(managedConfigFile)}
$managedContent = ${JSON.stringify(managedContent)}
$begin = ${JSON.stringify(CONFIG_BEGIN)}
$end = ${JSON.stringify(CONFIG_END)}
$block = ${JSON.stringify(CONFIG_INCLUDE_BLOCK)}

New-Item -ItemType Directory -Path $configPath -Force | Out-Null
if (!(Test-Path -LiteralPath $configFile)) {
  New-Item -ItemType File -Path $configFile -Force | Out-Null
}

$config = Get-Content -LiteralPath $configFile -Raw
$pattern = [regex]::Escape($begin) + '(?s).*?' + [regex]::Escape($end)
if ($config -match $pattern) {
  $config = [regex]::Replace($config, $pattern, $block)
} else {
  $config = $config.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $block + [Environment]::NewLine
}
Set-Content -LiteralPath $configFile -Value $config -Encoding UTF8
Set-Content -LiteralPath $managedConfigFile -Value $managedContent -Encoding UTF8
icacls $managedConfigFile /grant "$($env:USERNAME):(M)" | Out-Null
`;

  await fs.promises.writeFile(scriptPath, script, 'utf8');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath.replace(/'/g, "''")}') -Verb RunAs -Wait`,
      ],
      { windowsHide: true },
    );

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Elevated Arena Mode install failed with exit code ${code}.`));
      }
    });
  });

  await fs.promises.unlink(scriptPath).catch(() => Promise.resolve());
}

async function runElevatedUninstallScript(settings: typeof Constants.Settings) {
  const configFile = path.join(getEqualizerApoConfigPath(settings), 'config.txt');
  const managedConfigFile = getManagedConfigPath(settings);
  const scriptPath = path.join(os.tmpdir(), `liga-arena-mode-uninstall-${Date.now()}.ps1`);
  const script = `
$ErrorActionPreference = 'Stop'
$configFile = ${JSON.stringify(configFile)}
$managedConfigFile = ${JSON.stringify(managedConfigFile)}
$begin = ${JSON.stringify(CONFIG_BEGIN)}
$end = ${JSON.stringify(CONFIG_END)}

if (Test-Path -LiteralPath $configFile) {
  $config = Get-Content -LiteralPath $configFile -Raw
  $pattern = [regex]::Escape($begin) + '(?s).*?' + [regex]::Escape($end) + '\\r?\\n?'
  $config = [regex]::Replace($config, $pattern, '').TrimEnd() + [Environment]::NewLine
  Set-Content -LiteralPath $configFile -Value $config -Encoding UTF8
}
if (Test-Path -LiteralPath $managedConfigFile) {
  Remove-Item -LiteralPath $managedConfigFile -Force
}
`;

  await fs.promises.writeFile(scriptPath, script, 'utf8');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath.replace(/'/g, "''")}') -Verb RunAs -Wait`,
      ],
      { windowsHide: true },
    );

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Elevated Arena Mode delete failed with exit code ${code}.`));
      }
    });
  });

  await fs.promises.unlink(scriptPath).catch(() => Promise.resolve());
}

async function removeManagedInclude(settings: typeof Constants.Settings) {
  const configFile = path.join(getEqualizerApoConfigPath(settings), 'config.txt');

  try {
    const config = await fs.promises.readFile(configFile, 'utf8');
    await fs.promises.writeFile(
      configFile,
      config.replace(CONFIG_BLOCK_PATTERN, '').trimEnd() + '\n',
      'utf8',
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code !== 'ENOENT') {
      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(err.code || '')) {
        await runElevatedUninstallScript(settings);
        return;
      }

      throw error;
    }
  }
}

export function isArenaMatch(
  match?: {
    competition?: {
      tier?: { groupSize?: number | null; slug?: string | null } | null;
    } | null;
  } | null,
) {
  const tierSlug = match?.competition?.tier?.slug;

  return Boolean(tierSlug && ARENA_MODE_TIER_SLUGS.has(tierSlug));
}

export async function install(settings: typeof Constants.Settings) {
  await installEqualizerApoIfNeeded(settings);
  const detectedVstPluginPath = await installValhallaSupermassiveIfNeeded(settings);

  await writeFileWithElevatedFallback(getManagedConfigPath(settings), getInactiveConfig(), settings);

  const configFile = path.join(getEqualizerApoConfigPath(settings), 'config.txt');
  let config = '';

  try {
    config = await fs.promises.readFile(configFile, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code !== 'ENOENT') {
      throw error;
    }
  }

  if (!ACTIVE_INCLUDE_PATTERN.test(config)) {
    try {
      const repairedConfig = config.includes(CONFIG_BEGIN)
        ? config.replace(CONFIG_BLOCK_PATTERN, CONFIG_INCLUDE_BLOCK)
        : `${config.trimEnd()}\n\n${CONFIG_INCLUDE_BLOCK}\n`;

      await fs.promises.writeFile(configFile, repairedConfig, 'utf8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(err.code || '')) {
        await runElevatedInstallScript(settings, getInactiveConfig());
      } else {
        throw error;
      }
    }
  }

  return {
    ...(await getStatus(settings)),
    detectedVstPluginPath,
  };
}

export async function uninstall(settings: typeof Constants.Settings) {
  await disable(settings);
  await removeManagedInclude(settings);
  await fs.promises.unlink(getManagedConfigPath(settings)).catch(() => Promise.resolve());
  return getStatus(settings);
}

export async function getStatus(settings: typeof Constants.Settings) {
  const configFile = path.join(getEqualizerApoConfigPath(settings), 'config.txt');
  const managedConfigFile = getManagedConfigPath(settings);
  const detectedVstPluginPath = settings.arenaMode.vstPluginPath && (await pathExists(settings.arenaMode.vstPluginPath))
    ? settings.arenaMode.vstPluginPath
    : await findValhallaVstPluginPath();

  const [configExists, managedConfigExists] = await Promise.all([
    fs.promises
      .readFile(configFile, 'utf8')
      .then((content) => ACTIVE_INCLUDE_PATTERN.test(content))
      .catch(() => false),
    fs.promises
      .access(managedConfigFile, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false),
  ]);

  return {
    installed: configExists && managedConfigExists,
    equalizerApoConfigPath: getEqualizerApoConfigPath(settings),
    managedConfigFile,
    equalizerApoInstalled: await pathExists(configFile),
    valhallaSupermassiveInstalled: Boolean(detectedVstPluginPath),
    detectedVstPluginPath,
  };
}

export async function enable(settings: typeof Constants.Settings) {
  if (!getArenaSettings(settings).enabled) {
    return false;
  }

  const status = await getStatus(settings);

  if (!status.installed) {
    LOGGER.warn('Arena Mode is enabled in settings but not installed.');
    return false;
  }

  await fs.promises.writeFile(getManagedConfigPath(settings), await buildActiveConfig(settings), 'utf8');
  arenaModeActive = true;
  return true;
}

export async function disable(settings: typeof Constants.Settings) {
  arenaModeActive = false;
  await stopCrowdLoop();
  await fs.promises
    .writeFile(getManagedConfigPath(settings), getInactiveConfig(), 'utf8')
    .catch((error) => LOGGER.warn('Could not disable Equalizer APO Arena Mode config: %s', error));
}

export async function runForMatch<T>(
  settings: typeof Constants.Settings,
  match: Parameters<typeof isArenaMatch>[0],
  callback: () => Promise<T>,
) {
  const shouldEnable = getArenaSettings(settings).enabled && isArenaMatch(match);

  if (!shouldEnable) {
    LOGGER.info(
      'Skipping Arena Mode. enabled=%s arenaMatch=%s tier=%s',
      getArenaSettings(settings).enabled,
      isArenaMatch(match),
      match?.competition?.tier?.slug || 'unknown',
    );
    return callback();
  }

  const enabled = await enable(settings);
  LOGGER.info(
    'Arena Mode %s for tier=%s',
    enabled ? 'enabled' : 'not enabled',
    match?.competition?.tier?.slug || 'unknown',
  );

  try {
    return await callback();
  } finally {
    await disable(settings);
  }
}

export async function startCrowdLoop(settings: typeof Constants.Settings) {
  if (!arenaModeActive) {
    return false;
  }

  await stopCrowdLoop();

  const src = `resources://audio/${CROWD_NOISE_FILE}`;
  const volume = 1;
  const html = `
<!doctype html>
<html>
  <body>
    <audio id="crowd" src="${src}" loop autoplay></audio>
    <script>
      const audio = document.getElementById('crowd');
      audio.volume = ${volume};
      audio.play().catch(() => {});
    </script>
  </body>
</html>`;

  crowdWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  crowdWindow.on('closed', () => {
    crowdWindow = null;
  });

  await crowdWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return true;
}

async function stopCrowdLoop() {
  if (!crowdWindow || crowdWindow.isDestroyed()) {
    crowdWindow = null;
    return;
  }

  crowdWindow.close();
  crowdWindow = null;
}
