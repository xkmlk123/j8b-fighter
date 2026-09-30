#!/usr/bin/env node
'use strict';

/**
 * 通过 GitHub REST API（api.github.com）把本站点发布到 GitHub 并开启 Pages。
 *
 * 适用场景：本机 github.com:443 不可达、但 api.github.com 可达的网络环境。
 * 无需 git push，无需 SSH 配置。
 *
 * 用法：
 *   GH_TOKEN=xxx node tools/push-to-github.js [仓库名]
 *   REPO_NAME=my-repo GH_TOKEN=xxx node tools/push-to-github.js
 */

const fs = require('fs');
const path = require('path');

const API = 'https://api.github.com';
const TOKEN = process.env.GH_TOKEN;
const REPO_NAME = process.env.REPO_NAME || process.argv[2] || 'j8b-fighter';
const ROOT = path.resolve(__dirname, '..');

if (!TOKEN) {
  console.error('✗ 缺少 GH_TOKEN 环境变量');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'j8b-publisher',
  'Content-Type': 'application/json',
};

async function api(method, endpoint, body) {
  const url = endpoint.startsWith('http') ? endpoint : API + endpoint;
  const res = await fetch(url, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) {
    const msg = data && data.message ? data.message : raw;
    const err = new Error(`${method} ${endpoint} -> ${res.status} ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function collectFiles() {
  const list = [];
  for (const f of ['.gitignore', '.nojekyll', 'README.md', 'index.html']) {
    if (fs.existsSync(path.join(ROOT, f))) list.push(f);
  }
  for (const d of ['css', 'js', 'libs', 'tools']) {
    const base = path.join(ROOT, d);
    if (!fs.existsSync(base)) continue;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else list.push(path.relative(ROOT, p).split(path.sep).join('/'));
      }
    };
    walk(base);
  }
  return list;
}

(async () => {
  const t0 = Date.now();
  console.log('▸ 校验令牌…');
  const me = await api('GET', '/user');
  const owner = me.login;
  console.log(`  已登录：${owner}`);

  // 站点地址是确定性的，先在本地算出来，好把 README 里的占位符一次性替换掉
  const site = REPO_NAME.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${REPO_NAME}/`;

  console.log(`\n▸ 创建仓库 ${owner}/${REPO_NAME} …`);
  try {
    await api('POST', '/user/repos', {
      name: REPO_NAME,
      description: '歼-8B 三维交互模型与气动仿真平台 / J-8B 3D interactive model & aero simulation',
      private: false,
      has_issues: true,
      has_wiki: false,
      auto_init: true,
    });
    console.log('  ✓ 仓库已创建');
  } catch (e) {
    if (e.status === 422) {
      console.log('  · 仓库已存在，复用');
      await api('GET', `/repos/${owner}/${REPO_NAME}`);
    } else throw e;
  }

  // 空仓库无法使用 Git Data API：先用 Contents API 写入引导文件，建立 main 分支
  console.log('\n▸ 检查仓库状态…');
  let repoEmpty = false;
  try {
    await api('GET', `/repos/${owner}/${REPO_NAME}/git/ref/heads/main`);
    console.log('  · main 分支已存在');
  } catch (e) {
    if (e.status === 404 || e.status === 409) repoEmpty = true;
    else throw e;
  }
  if (repoEmpty) {
    console.log('  · 仓库为空，正在建立 main 分支…');
    await api('PUT', `/repos/${owner}/${REPO_NAME}/contents/README.md`, {
      message: 'chore: 初始化仓库',
      content: Buffer.from('# 初始化\n').toString('base64'),
      branch: 'main',
    });
    console.log('  ✓ main 分支已建立');
  }

  console.log('\n▸ 上传文件…');
  const files = collectFiles();
  const tree = [];
  for (const rel of files) {
    let buf = fs.readFileSync(path.join(ROOT, rel));
    if (rel === 'README.md') {
      buf = Buffer.from(buf.toString('utf8').replace(/\{\{SITE_URL\}\}/g, site), 'utf8');
    }
    const blob = await api('POST', `/repos/${owner}/${REPO_NAME}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`  ✓ ${rel}  (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  console.log('\n▸ 生成提交…');
  const treeObj = await api('POST', `/repos/${owner}/${REPO_NAME}/git/trees`, { tree });
  const author = {
    name: owner,
    email: `${me.id}+${owner}@users.noreply.github.com`,
    date: new Date().toISOString(),
  };

  let headSha = null;
  try {
    const ref = await api('GET', `/repos/${owner}/${REPO_NAME}/git/ref/heads/main`);
    headSha = ref.object.sha;
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
  }

  const commit = await api('POST', `/repos/${owner}/${REPO_NAME}/git/commits`, {
    message: '歼-8B 三维交互模型与气动仿真平台',
    tree: treeObj.sha,
    parents: headSha ? [headSha] : [],
    author,
    committer: author,
  });

  if (headSha) {
    await api('PATCH', `/repos/${owner}/${REPO_NAME}/git/refs/heads/main`, {
      sha: commit.sha,
      force: true,
    });
  } else {
    await api('POST', `/repos/${owner}/${REPO_NAME}/git/refs`, {
      ref: 'refs/heads/main',
      sha: commit.sha,
    });
  }
  console.log('  ✓ main 分支已就绪');

  console.log('\n▸ 开启 GitHub Pages…');
  let pagesOk = false;
  let pagesMsg = '';
  try {
    await api('POST', `/repos/${owner}/${REPO_NAME}/pages`, {
      source: { branch: 'main', path: '/' },
    });
    pagesOk = true;
  } catch (e) {
    if (e.status === 409) {
      pagesOk = true;
      pagesMsg = '（此前已开启）';
    } else {
      try {
        await api('PUT', `/repos/${owner}/${REPO_NAME}/pages`, {
          source: { branch: 'main', path: '/' },
        });
        pagesOk = true;
      } catch (e2) {
        pagesMsg = `自动开启失败（${e2.status}）：${(e2.data && e2.data.message) || e2.message}`;
      }
    }
  }

  console.log('\n' + '='.repeat(56));
  console.log(`仓库地址：https://github.com/${owner}/${REPO_NAME}`);
  if (pagesOk) {
    console.log(`预览地址：${site} ${pagesMsg}`);
    console.log('（Pages 首次构建约 1-2 分钟，稍等再打开）');
  } else {
    console.log(`Pages：${pagesMsg}`);
    console.log(`可在 https://github.com/${owner}/${REPO_NAME}/settings/pages 手动开启`);
  }
  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('='.repeat(56));
})().catch((e) => {
  console.error('\n✗ 失败：' + e.message);
  if (e.data && e.data.errors) console.error(JSON.stringify(e.data.errors, null, 2));
  process.exit(1);
});
