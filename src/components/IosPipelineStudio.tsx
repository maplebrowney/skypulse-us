import { useMemo, useState, type FC } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FolderGit2,
  Play,
  RefreshCw,
  Save,
  Smartphone,
  UploadCloud,
} from 'lucide-react';
import { DEFAULT_IOS_CONFIG, generateIosArtifacts } from '../lib/iosGenerator.ts';
import type { IosWrapperConfig } from '../types/skypulse.ts';

type PushResult = {
  owner: string;
  repoName: string;
  branch: string;
  filesPushed: number;
  commitSha: string;
  repoUrl: string;
  actionsUrl: string;
  workflowFileUrl: string;
  sideStoreSourceUrl: string;
};

type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  head_branch: string;
  event: string;
};

const APP_ICON_PATH = '/src/assets/images/skypulse_app_icon_1794773227602.jpg';

export const IosPipelineStudio: FC = () => {
  const [config, setConfig] = useState<IosWrapperConfig>(DEFAULT_IOS_CONFIG);
  const artifacts = useMemo(() => generateIosArtifacts(config), [config]);
  const [selectedPath, setSelectedPath] = useState<string>(artifacts[0]?.path || 'ios-wrapper/project.yml');

  const activeFile = useMemo(
    () => artifacts.find((f) => f.path === selectedPath) || artifacts[0],
    [artifacts, selectedPath]
  );

  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [downloadingZip, setDownloadingZip] = useState(false);

  // GitHub Push & Actions state
  const [githubToken, setGithubToken] = useState('');
  const [isPrivateRepo, setIsPrivateRepo] = useState(false);
  const [commitMessage, setCommitMessage] = useState(
    'feat: SkyPulse US flight tracker + ios-wrapper + SideStore/LiveContainer IPA workflow'
  );
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);

  const updateConfig = <K extends keyof IosWrapperConfig>(key: K, value: IosWrapperConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleCopyFile = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopiedPath(activeFile.path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  const handleSyncToWorkspace = async () => {
    setSyncState({ status: 'saving' });
    try {
      const res = await fetch('/api/ios-generator/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncState({
        status: 'saved',
        message: `Synced ${data.writtenCount} files into ios-wrapper/, .github/workflows/, and sidestore-source.json`,
      });
    } catch (err) {
      setSyncState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unable to write workspace files.',
      });
    }
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const res = await fetch('/api/repo/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error('Failed to create zip archive');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.githubRepo || 'skypulse-us'}-ios-repo.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSyncState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to download ZIP archive.',
      });
    } finally {
      setDownloadingZip(false);
    }
  };

  const fetchWorkflowRuns = async (owner: string, repoName: string) => {
    if (!githubToken.trim()) return;
    setLoadingRuns(true);
    try {
      const res = await fetch('/api/github/workflow-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, owner, repoName }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.runs)) {
        setRuns(data.runs);
      }
    } finally {
      setLoadingRuns(false);
    }
  };

  const handlePushToGitHub = async () => {
    setPushError(null);
    setDispatchStatus(null);
    if (!githubToken.trim()) {
      setPushError('Enter a GitHub Personal Access Token with repo and workflow scopes.');
      return;
    }
    if (!config.githubRepo.trim()) {
      setPushError('Enter a target GitHub repository name.');
      return;
    }

    setPushing(true);
    try {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: githubToken,
          owner: config.githubOwner === 'your-github-username' ? '' : config.githubOwner,
          repoName: config.githubRepo,
          branch: config.githubBranch,
          isPrivate: isPrivateRepo,
          commitMessage,
          config,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'GitHub push failed');
      }
      setPushResult(data);
      updateConfig('githubOwner', data.owner);
      await fetchWorkflowRuns(data.owner, data.repoName);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Failed to push repository to GitHub.');
    } finally {
      setPushing(false);
    }
  };

  const handleDispatchBuild = async () => {
    if (!pushResult || !githubToken.trim()) return;
    setDispatchStatus('Dispatching workflow...');
    try {
      const res = await fetch('/api/github/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: githubToken,
          owner: pushResult.owner,
          repoName: pushResult.repoName,
          branch: pushResult.branch,
          signingMode: config.signingMode,
          versionTag: config.version,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dispatch failed');
      setDispatchStatus('Workflow dispatched on macos-15 runner.');
      setTimeout(() => {
        fetchWorkflowRuns(pushResult.owner, pushResult.repoName);
      }, 2500);
    } catch (err) {
      setDispatchStatus(err instanceof Error ? err.message : 'Unable to trigger workflow dispatch.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Studio Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="flex items-center gap-4">
          {!iconLoadFailed ? (
            <img
              src={APP_ICON_PATH}
              alt="SkyPulse US iOS App Icon"
              referrerPolicy="no-referrer"
              onError={() => setIconLoadFailed(true)}
              className="h-14 w-14 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-600 text-white">
              <Smartphone className="h-7 w-7" />
            </div>
          )}
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              iOS Wrapper &amp; SideStore / LiveContainer IPA Pipeline
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Generates <span className="font-mono">ios-wrapper/</span>, <span className="font-mono">.github/workflows/build-ios-ipa.yml</span>, and <span className="font-mono">sidestore-source.json</span> directly from this SkyPulse US project.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncToWorkspace}
            disabled={syncState.status === 'saving'}
            className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Save className="h-3.5 w-3.5" />
            {syncState.status === 'saving' ? 'Syncing...' : 'Sync to Workspace'}
          </button>

          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-600"
          >
            <Download className="h-3.5 w-3.5" />
            {downloadingZip ? 'Packaging Repo...' : 'Download Repo (.zip)'}
          </button>
        </div>
      </div>

      {syncState.message && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs ${
            syncState.status === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
          }`}
        >
          {syncState.message}
        </div>
      )}

      {/* Main Split Grid: Configuration + GitHub Push (Left) / Generated Code Inspector (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Wrapper Config + Direct GitHub Publisher */}
        <div className="space-y-6 lg:col-span-5">
          {/* iOS Wrapper Settings */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0F172A]">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Wrapper &amp; Signing Configuration
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Unsigned mode strips embedded signatures so SideStore &amp; LiveContainer can inject or re-sign cleanly.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  App Display Name
                </label>
                <input
                  type="text"
                  value={config.appName}
                  onChange={(e) => updateConfig('appName', e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Bundle Identifier
                </label>
                <input
                  type="text"
                  value={config.bundleId}
                  onChange={(e) => updateConfig('bundleId', e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Version / Build
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={config.version}
                    onChange={(e) => updateConfig('version', e.target.value)}
                    className="h-9 w-2/3 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={config.buildNumber}
                    onChange={(e) => updateConfig('buildNumber', e.target.value)}
                    className="h-9 w-1/3 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Minimum iOS Target
                </label>
                <select
                  value={config.minIosVersion}
                  onChange={(e) => updateConfig('minIosVersion', e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="15.0">iOS 15.0</option>
                  <option value="16.0">iOS 16.0</option>
                  <option value="17.0">iOS 17.0</option>
                  <option value="18.0">iOS 18.0</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Signing Workflow Mode
                </label>
                <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => updateConfig('signingMode', 'sidestore-unsigned')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      config.signingMode === 'sidestore-unsigned'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    Unsigned (SideStore / LiveContainer)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('signingMode', 'apple-cert-p12')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      config.signingMode === 'apple-cert-p12'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    Signed (.p12 Certificate)
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Web Content Source Inside WKWebView
                </label>
                <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => updateConfig('webBundleMode', 'hybrid-offline')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      config.webBundleMode === 'hybrid-offline'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    Embedded WebBundle (dist/)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig('webBundleMode', 'remote-url')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      config.webBundleMode === 'remote-url'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    Remote Hosted URL
                  </button>
                </div>
              </div>

              {config.webBundleMode === 'remote-url' && (
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Remote Web App URL
                  </label>
                  <input
                    type="url"
                    value={config.remoteAppUrl}
                    onChange={(e) => updateConfig('remoteAppUrl', e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 sm:col-span-2 dark:border-slate-800">
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  LiveContainer &amp; Free Apple ID Safe Entitlements
                </span>
                <input
                  type="checkbox"
                  checked={config.liveContainerCompatible}
                  onChange={(e) => updateConfig('liveContainerCompatible', e.target.checked)}
                  className="h-4 w-4 accent-sky-600"
                />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 sm:col-span-2 dark:border-slate-800">
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  Include CoreLocation Bridge (Nearest US Hub)
                </span>
                <input
                  type="checkbox"
                  checked={config.enableLocation}
                  onChange={(e) => updateConfig('enableLocation', e.target.checked)}
                  className="h-4 w-4 accent-sky-600"
                />
              </div>
            </div>
          </div>

          {/* Direct GitHub Push & Automated Build Trigger */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0F172A]">
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Push Web Repo + iOS Pipeline to GitHub
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Creates or updates a GitHub repository with your full Web app, <span className="font-mono">ios-wrapper/</span>, <span className="font-mono">build-ios-ipa.yml</span>, and <span className="font-mono">sidestore-source.json</span>.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  GitHub Personal Access Token (PAT with repo + workflow scopes)
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_... or github_pat_..."
                  autoComplete="off"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    GitHub Owner (optional)
                  </label>
                  <input
                    type="text"
                    value={config.githubOwner === 'your-github-username' ? '' : config.githubOwner}
                    onChange={(e) => updateConfig('githubOwner', e.target.value || 'your-github-username')}
                    placeholder="Auto-detect from token"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Repository Name
                  </label>
                  <input
                    type="text"
                    value={config.githubRepo}
                    onChange={(e) => updateConfig('githubRepo', e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Target Branch
                  </label>
                  <input
                    type="text"
                    value={config.githubBranch}
                    onChange={(e) => updateConfig('githubBranch', e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={isPrivateRepo}
                      onChange={(e) => setIsPrivateRepo(e.target.checked)}
                      className="h-4 w-4 accent-sky-600"
                    />
                    Private Repository
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Commit Message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {pushError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                  {pushError}
                </div>
              )}

              <button
                type="button"
                onClick={handlePushToGitHub}
                disabled={pushing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                <UploadCloud className="h-4 w-4" />
                {pushing ? 'Uploading Repo & Workflow to GitHub...' : 'Push Repo & Trigger SideStore IPA Build'}
              </button>
            </div>

            {pushResult && (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
                <div className="font-medium text-emerald-700 dark:text-emerald-400">
                  ✓ Pushed {pushResult.filesPushed} files · Commit {pushResult.commitSha.slice(0, 7)}
                </div>

                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Repository</span>
                    <a
                      href={pushResult.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"
                    >
                      {pushResult.owner}/{pushResult.repoName}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Actions Workflow</span>
                    <a
                      href={pushResult.actionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"
                    >
                      View IPA Runs
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2 text-[11px] text-slate-700 break-all dark:bg-slate-900 dark:text-slate-300">
                    SideStore Source URL: {pushResult.sideStoreSourceUrl}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDispatchBuild}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Play className="h-3 w-3" />
                    Dispatch IPA Build
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchWorkflowRuns(pushResult.owner, pushResult.repoName)}
                    disabled={loadingRuns}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingRuns ? 'animate-spin' : ''}`} />
                    Refresh Runs
                  </button>
                </div>

                {dispatchStatus && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{dispatchStatus}</p>
                )}

                {runs.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {runs.map((r) => (
                      <a
                        key={r.id}
                        href={r.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      >
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          {r.name}
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                          {r.conclusion || r.status}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Generated ios-wrapper/ + build-ios-ipa.yml File Explorer */}
        <div className="lg:col-span-7">
          <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F172A]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Generated Artifacts ({artifacts.length} files)
                </h3>
              </div>

              {activeFile && (
                <button
                  type="button"
                  onClick={handleCopyFile}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copiedPath === activeFile.path ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy File
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="grid flex-1 grid-cols-1 divide-y divide-slate-200 md:grid-cols-12 md:divide-x md:divide-y-0 dark:divide-slate-800">
              {/* File Tree List */}
              <div className="max-h-[620px] overflow-y-auto p-3 md:col-span-4">
                {(['ios-wrapper', 'workflow', 'sidestore'] as const).map((cat) => {
                  const group = artifacts.filter((a) => a.category === cat);
                  const title =
                    cat === 'ios-wrapper'
                      ? 'iOS Wrapper'
                      : cat === 'workflow'
                      ? 'GitHub Actions'
                      : 'SideStore Feed';
                  return (
                    <div key={cat} className="mb-4 last:mb-0">
                      <div className="px-2 pb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {title}
                      </div>
                      <div className="space-y-0.5">
                        {group.map((file) => {
                          const isCurrent = activeFile?.path === file.path;
                          const shortLabel = file.path
                            .replace(/^ios-wrapper\//, '')
                            .replace(/^\.github\/workflows\//, '');
                          return (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => setSelectedPath(file.path)}
                              title={file.path}
                              className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors ${
                                isCurrent
                                  ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              {shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Code Viewer */}
              <div className="flex flex-col md:col-span-8">
                {activeFile && (
                  <>
                    <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                        {activeFile.path}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {activeFile.description}
                      </p>
                    </div>
                    <pre className="max-h-[560px] flex-1 overflow-auto bg-slate-950 p-4 font-mono text-[11.5px] leading-relaxed text-slate-200">
                      <code>{activeFile.content}</code>
                    </pre>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
