export interface Interest {
  label: string;
  note: string;
}

export const interests: Interest[] = [
  {
    label: 'Astronomy',
    note: '観測と、そこから浮かぶ疑問を記録している。'
  },
  {
    label: 'Physics',
    note: '力学・電磁気学を中心に、簡単なシミュレーションで確かめ直す。'
  },
  {
    label: 'Software',
    note: '小さなツールを作りながら、考えを形にする方法を探る。'
  },
  {
    label: 'Web Development',
    note: '情報の伝わり方そのものを設計として捉える。'
  },
  {
    label: 'Quiz',
    note: '問題の作成・運営を通して、知識の構造に触れる。'
  }
];
