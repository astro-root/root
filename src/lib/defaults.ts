// サイト設定の型と既定値。DB(settings)に値があればそれが優先される。
export interface NavItem { label: string; href: string; external?: boolean }

export interface HomeSection {
  id: 'hero' | 'interests' | 'projects' | 'notes' | 'news' | 'links';
  enabled: boolean;
  title: string;
  body: string;
}

export interface Settings {
  site: {
    name: string; nameEn: string; description: string; tagline: string;
    contactEmail: string; copyright: string; logo: string; logoAlt: string;
  };
  nav: NavItem[];
  footer: { links: NavItem[]; note: string; showSocial: boolean };
  social: NavItem[];
  seo: { titleTemplate: string; ogImage: string; twitterCard: 'summary' | 'summary_large_image'; noindex: boolean; structuredData: boolean };
  display: {
    meteors: { enabled: boolean; frequency: 'low' | 'normal' | 'high' };
    opening: boolean;
    reveal: boolean;
  };
  home: {
    heroTitle: string; heroLede: string; interests: { label: string; note: string }[];
    buttons: { label: string; href: string; primary: boolean }[];
    sections: HomeSection[];
    news: { date: string; text: string; href: string }[];
  };
  contact: { intro: string; successMessage: string; retentionDays: number };
}

export const DEFAULT_SETTINGS: Settings = {
  site: {
    name: 'るーとの研究室',
    nameEn: "Root's Laboratory",
    description: '高校生るーとが、天文・物理・科学とソフトウェア開発を横断しながら研究・制作・実験する個人ラボラトリー。',
    tagline: 'Science. Software. Ideas.',
    contactEmail: 'contact@astro-root.com',
    copyright: '© るーと',
    logo: '/apple-touch-icon.png',
    logoAlt: 'るーとの研究室のロゴ'
  },
  nav: [
    { label: 'Projects', href: '/projects' },
    { label: 'Blog', href: '/blog' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' }
  ],
  footer: {
    links: [
      { label: '利用規約', href: '/terms' },
      { label: 'プライバシーポリシー', href: '/privacy' }
    ],
    note: '',
    showSocial: true
  },
  social: [{ label: 'GitHub', href: 'https://github.com/astro-root', external: true }],
  seo: {
    titleTemplate: '%s — るーとの研究室',
    ogImage: '/og-default.png',
    twitterCard: 'summary_large_image',
    noindex: false,
    structuredData: true
  },
  display: { meteors: { enabled: true, frequency: 'normal' }, opening: true, reveal: true },
  home: {
    heroTitle: 'るーとの研究室',
    heroLede: '興味を持ったものを観測し、考え、作る。天文・物理・科学と、Web開発・ソフトウェアを横断しながら実験を続ける個人のラボラトリー。',
    interests: [
      { label: 'Astronomy', note: '観測と、そこから浮かぶ疑問を記録している。' },
      { label: 'Physics', note: '力学・電磁気学を中心に、簡単なシミュレーションで確かめ直す。' },
      { label: 'Software', note: '小さなツールを作りながら、考えを形にする方法を探る。' },
      { label: 'Web Development', note: '情報の伝わり方そのものを設計として捉える。' },
      { label: 'Quiz', note: '問題の作成・運営を通して、知識の構造に触れる。' }
    ],
    buttons: [
      { label: 'Projects を見る', href: '/projects', primary: true },
      { label: 'Blog を読む', href: '/blog', primary: false }
    ],
    sections: [
      { id: 'hero', enabled: true, title: '', body: '' },
      { id: 'interests', enabled: true, title: '関心領域', body: '' },
      { id: 'projects', enabled: true, title: '作っているもの', body: '' },
      { id: 'notes', enabled: true, title: '最近のブログ', body: '' },
      { id: 'news', enabled: false, title: 'お知らせ', body: '' },
      { id: 'links', enabled: true, title: 'ほかのページ', body: '' }
    ],
    news: []
  },
  contact: {
    intro: 'ご質問・ご依頼・ご感想など、お気軽にどうぞ。返信までお時間をいただくことがあります。',
    successMessage: '送信しました。お問い合わせありがとうございます。内容を確認のうえ、必要に応じてご連絡します。',
    retentionDays: 365
  }
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export const PROJECT_STATUSES = ['Active', 'In Development', 'Concept', 'Archived'] as const;
export const CONTENT_STATES = ['draft', 'published', 'private'] as const;
export const STATE_LABEL: Record<string, string> = { draft: '下書き', published: '公開', private: '非公開' };
export const CONTACT_STATUS_LABEL: Record<string, string> = { new: '未対応', in_progress: '対応中', done: '対応済み' };
