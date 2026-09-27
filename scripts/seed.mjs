// 一度だけ実行するシードスクリプト。
// 既存の src/content/{projects,blog,about} のMarkdownを読み取り、Firestoreに書き込みます。
//
// 事前準備:
// 1. Firebase Console → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵を生成
// 2. ダウンロードしたJSONを scripts/service-account.json として保存（.gitignore済み）
// 3. node scripts/seed.mjs を実行
//
// 既存データを上書きしたくない場合は、Firestore側のコレクションが空のときだけ実行してください。

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let serviceAccount;
try {
  serviceAccount = JSON.parse(
    readFileSync(path.join(__dirname, 'service-account.json'), 'utf-8')
  );
} catch {
  console.error(
    '✗ scripts/service-account.json が見つかりません。\n' +
      '  Firebase Console → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵を生成 のJSONを、\n' +
      '  scripts/service-account.json として保存してから、もう一度実行してください。'
  );
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function readMarkdownDir(dir) {
  const full = path.join(root, 'src/content', dir);
  return readdirSync(full)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = readFileSync(path.join(full, f), 'utf-8');
      const { data, content } = matter(raw);
      return { id: f.replace(/\.md$/, ''), data, content };
    });
}

async function seedProjects() {
  const files = readMarkdownDir('projects');
  const batch = db.batch();
  for (const { id, data } of files) {
    batch.set(db.collection('projects').doc(id), {
      title: data.title,
      order: data.order,
      category: data.category,
      status: data.status,
      year: data.year,
      summary: data.summary,
      technology: data.technology ?? [],
      url: data.url ?? '',
      github: data.github ?? '',
      featured: Boolean(data.featured)
    });
  }
  await batch.commit();
  console.log(`✓ projects: ${files.length}件を書き込みました`);
}

async function seedBlog() {
  const files = readMarkdownDir('blog');
  const batch = db.batch();
  for (const { id, data, content } of files) {
    batch.set(db.collection('blog').doc(id), {
      title: data.title,
      slug: data.slugOverride ?? id,
      date: new Date(data.date).toISOString().slice(0, 10),
      category: data.category,
      tags: data.tags ?? [],
      excerpt: data.excerpt,
      content: content.trim(),
      published: data.published ?? true,
      featured: false
    });
  }
  await batch.commit();
  console.log(`✓ blog: ${files.length}件を書き込みました`);
}

async function seedAbout() {
  const files = readMarkdownDir('about');
  const entry = files.find((f) => f.id === 'index');
  if (!entry) return;
  await db.collection('about').doc('main').set({
    bodyMarkdown: entry.content.trim(),
    based: 'Japan',
    status: 'Student, building on the side',
    currently: 'Q-Room, physics notes',
    updated: new Date().toISOString()
  });
  console.log('✓ about: 書き込みました');
}

async function seedSettings() {
  await db.collection('settings').doc('site').set(
    {
      heroTagline: 'Science. Software. Ideas.',
      heroLede:
        '興味を持ったものを観測し、考え、作る。天文・物理・科学と、Web開発・ソフトウェアを横断しながら実験を続ける個人のラボラトリー。',
      siteDescription:
        '高校生Rootが、天文・物理・科学とソフトウェア開発を横断しながら研究・制作・実験する個人ラボラトリー。',
      contactEmail: 'contact@astro-root.com',
      githubUrl: 'https://github.com/',
      xUrl: 'https://x.com/',
      footerNote: '© Root'
    },
    { merge: true }
  );
  console.log('✓ settings: 書き込みました');
}

await seedProjects();
await seedBlog();
await seedAbout();
await seedSettings();
console.log('\n完了しました。Firebaseコンソールの Firestore Database でデータを確認してください。');
